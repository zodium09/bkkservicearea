const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const turf = require('@turf/turf');
const db = require('./lib/db');

const app = express();
const PORT = process.env.PORT || 5174;
const ARCGIS_ORIGIN = 'https://citymap.bangkok.go.th';
const BASEMAP_PATH = '/citymap/rest/services/Basemap_Service/Basemap1000_32647_H/MapServer';
const ROAD_LAYER_ID = 7;
const PROCESSED_LAYERS_DIR = path.join(__dirname, 'data', 'processed', 'bma-layers');
const PROCESSED_CATALOG_PATH = path.join(PROCESSED_LAYERS_DIR, 'catalog.json');
const processedLayerCache = new Map();

const LAYER_DIMENSIONS = {
  0: 'จุดอ้างอิงเมือง',
  1: 'ภูมิประเทศ',
  2: 'การปกครอง',
  3: 'คมนาคม',
  4: 'อาคารและสิ่งปลูกสร้าง',
  5: 'อาคารและสิ่งปลูกสร้าง',
  6: 'คมนาคม',
  7: 'คมนาคม',
  8: 'คมนาคม',
  9: 'คมนาคม',
  10: 'แหล่งน้ำ',
  11: 'แหล่งน้ำ',
  12: 'การปกครอง',
  13: 'การปกครอง',
  14: 'การปกครอง',
};

app.use(express.json({ limit: '20mb' }));

function buildCatalogFromMetadata(metadata, prepared = false) {
  const layers = (metadata.layers || []).map((layer) => ({
    id: layer.id,
    name: layer.name,
    type: layer.type,
    geometryType: layer.geometryType,
    minScale: layer.minScale,
    maxScale: layer.maxScale,
    dimension: LAYER_DIMENSIONS[layer.id] || 'อื่นๆ',
  }));
  const dimensions = Array.from(new Set(layers.map((layer) => layer.dimension))).map((dimension) => ({
    name: dimension,
    layers: layers.filter((layer) => layer.dimension === dimension),
  }));
  return {
    prepared,
    source: `${ARCGIS_ORIGIN}${BASEMAP_PATH}`,
    spatialReference: metadata.spatialReference,
    maxRecordCount: metadata.maxRecordCount,
    layers,
    dimensions,
  };
}

function readProcessedCatalog() {
  if (!fs.existsSync(PROCESSED_CATALOG_PATH)) return null;
  return JSON.parse(fs.readFileSync(PROCESSED_CATALOG_PATH, 'utf8'));
}

function featureIntersectsBbox(feature, bbox) {
  if (!feature?.geometry) return false;
  try {
    const [minX, minY, maxX, maxY] = turf.bbox(feature);
    const [xmin, ymin, xmax, ymax] = bbox;
    return minX <= xmax && maxX >= xmin && minY <= ymax && maxY >= ymin;
  } catch {
    return false;
  }
}

function processedLayerPath(layerId) {
  const catalog = readProcessedCatalog();
  const catalogLayer = catalog?.layers?.find((layer) => layer.id === layerId);
  return catalogLayer?.path
    ? path.join(__dirname, catalogLayer.path)
    : path.join(PROCESSED_LAYERS_DIR, `layer-${layerId}.geojson`);
}

function loadProcessedLayer(layerId) {
  const layerPath = processedLayerPath(layerId);
  if (!fs.existsSync(layerPath)) return null;
  const mtimeMs = fs.statSync(layerPath).mtimeMs;
  const cached = processedLayerCache.get(layerPath);
  if (cached?.mtimeMs === mtimeMs) {
    cached.touchedAt = Date.now();
    return cached.collection;
  }

  const collection = JSON.parse(fs.readFileSync(layerPath, 'utf8'));
  processedLayerCache.set(layerPath, { mtimeMs, collection, touchedAt: Date.now() });
  if (processedLayerCache.size > 4) {
    const [oldestPath] = Array.from(processedLayerCache.entries())
      .sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
    processedLayerCache.delete(oldestPath);
  }
  return collection;
}

function queryProcessedLayerByBbox(layerId, bbox, maxFeatures = 50000) {
  const collection = loadProcessedLayer(layerId);
  if (!collection) return null;
  const features = (collection.features || []).filter((feature) => featureIntersectsBbox(feature, bbox)).slice(0, maxFeatures);
  return turf.featureCollection(features);
}

function run(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const isBatch = /\.(bat|cmd)$/i.test(command);
    const executable = isBatch ? process.env.ComSpec || 'cmd.exe' : command;
    const executableArgs = isBatch ? ['/c', command, ...args] : args;
    execFile(executable, executableArgs, { timeout: 15000, windowsHide: true, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, error, stdout, stderr });
    });
  });
}

async function findQgisProcess() {
  if (process.env.QGIS_PROCESS) {
    const probe = await run(process.env.QGIS_PROCESS, ['--version']);
    return { found: probe.ok, command: process.env.QGIS_PROCESS, version: probe.stdout.trim() || probe.stderr.trim() };
  }

  const probe = await run('where.exe', ['qgis_process']);
  const command = probe.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  const candidates = [];
  if (command) candidates.push(command);

  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  candidates.push(
    path.join(programFiles, 'QGIS 4.0.1', 'bin', 'qgis_process-qgis.bat'),
    path.join(programFiles, 'QGIS 4.0.0', 'bin', 'qgis_process-qgis.bat'),
    path.join(programFiles, 'QGIS 3.34.12', 'bin', 'qgis_process-qgis-ltr.bat'),
  );

  for (const candidate of candidates) {
    const version = await run(candidate, ['--version']);
    if (version.ok) {
      return { found: true, command: candidate, version: version.stdout.trim() || version.stderr.trim() };
    }
  }

  return { found: false, command: null, version: null };
}

async function fetchArcgis(pathAndQuery) {
  const upstream = `${ARCGIS_ORIGIN}${pathAndQuery}`;
  const response = await fetch(upstream, {
    headers: {
      'user-agent': 'Bangkok-Service-Area-Analysis/1.0',
      accept: 'application/json, image/*, */*',
    },
  });

  const arrayBuffer = await response.arrayBuffer();
  return {
    ok: response.ok,
    status: response.status,
    headers: response.headers,
    body: Buffer.from(arrayBuffer),
  };
}

app.use('/arcgis', async (req, res) => {
  try {
    const target = req.originalUrl.replace(/^\/arcgis/, '');
    const upstream = await fetchArcgis(target);
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    res.send(upstream.body);
  } catch (error) {
    res.status(502).json({ error: 'ArcGIS proxy failed', detail: error.message });
  }
});

app.get('/api/basemap/metadata', async (req, res) => {
  try {
    const upstream = await fetchArcgis(`${BASEMAP_PATH}?f=pjson`);
    res.type('json').send(upstream.body);
  } catch (error) {
    res.status(502).json({ error: 'Unable to load basemap metadata', detail: error.message });
  }
});

app.get('/api/layers/catalog', async (req, res) => {
  try {
    const upstream = await fetchArcgis(`${BASEMAP_PATH}?f=pjson`);
    const metadata = JSON.parse(upstream.body.toString('utf8'));
    res.json(buildCatalogFromMetadata(metadata, false));
  } catch (error) {
    res.status(502).json({ error: 'Unable to load BMA layer catalog', detail: error.message });
  }
});

app.get('/api/processed-layers/catalog', async (req, res) => {
  try {
    const catalog = readProcessedCatalog();
    if (catalog) return res.json(catalog);

    const upstream = await fetchArcgis(`${BASEMAP_PATH}?f=pjson`);
    const metadata = JSON.parse(upstream.body.toString('utf8'));
    return res.json({
      ...buildCatalogFromMetadata(metadata, false),
      note: 'Run npm run prepare:data to preprocess BMA layers with QGIS.',
    });
  } catch (error) {
    return res.status(502).json({ error: 'Unable to load processed layer catalog', detail: error.message });
  }
});

app.get('/api/processed-layers/:id/query', async (req, res) => {
  const layerId = Number(req.params.id);
  const bbox = String(req.query.bbox || '').split(',').map(Number);
  if (!Number.isInteger(layerId) || layerId < 0 || layerId > 99) {
    return res.status(400).json({ error: 'Invalid layer id.' });
  }
  if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
    return res.status(400).json({ error: 'bbox must be xmin,ymin,xmax,ymax in EPSG:4326.' });
  }

  const catalog = readProcessedCatalog();
  const processedPath = processedLayerPath(layerId);

  if (!fs.existsSync(processedPath)) {
    return res.status(404).json({ error: 'Processed layer is not available. Run npm run prepare:data first.' });
  }

  try {
    const maxFeatures = Math.min(Math.max(Number(req.query.maxFeatures) || 4000, 1), 12000);
    const collection = loadProcessedLayer(layerId);
    const matching = (collection.features || []).filter((feature) => featureIntersectsBbox(feature, bbox));
    res.json({
      type: 'FeatureCollection',
      source: 'qgis-processed',
      preparedAt: catalog?.generatedAt || null,
      layerId,
      returned: Math.min(matching.length, maxFeatures),
      totalMatched: matching.length,
      totalPrepared: collection.features?.length || 0,
      exceededTransferLimit: matching.length > maxFeatures,
      features: matching.slice(0, maxFeatures),
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to read processed layer', detail: error.message });
  }
});

app.get('/api/accessibility/stats', (req, res) => {
  const statsPath = path.join(__dirname, 'data', 'processed', 'accessibility', 'stats.json');
  if (!fs.existsSync(statsPath)) {
    return res.status(404).json({ error: 'Accessibility stats not precomputed yet.' });
  }
  try {
    const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read accessibility stats', detail: error.message });
  }
});

app.get('/api/accessibility/layer/:category/:type', (req, res) => {
  const { category, type } = req.params;
  
  if (!['bkk_hospitals', 'gov_hospitals', 'health_centers', 'schools', 'public_transit'].includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }
  if (!['pois', 'area-walk', 'area-cycle'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  
  const layerPath = path.join(__dirname, 'data', 'processed', 'accessibility', `${category}-${type}.geojson`);
  if (!fs.existsSync(layerPath)) {
    return res.status(404).json({ error: `Accessibility layer ${category}-${type} not precomputed yet.` });
  }
  
  try {
    const layer = JSON.parse(fs.readFileSync(layerPath, 'utf8'));
    res.json(layer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read accessibility layer', detail: error.message });
  }
});


app.get('/api/layers/:id/query', async (req, res) => {
  const layerId = Number(req.params.id);
  const bbox = String(req.query.bbox || '').split(',').map(Number);
  if (!Number.isInteger(layerId) || layerId < 0 || layerId > 99) {
    return res.status(400).json({ error: 'Invalid layer id.' });
  }
  if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
    return res.status(400).json({ error: 'bbox must be xmin,ymin,xmax,ymax in EPSG:4326.' });
  }

  const [xmin, ymin, xmax, ymax] = bbox;
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 1000, 100), 2000);
  const maxFeatures = Math.min(Math.max(Number(req.query.maxFeatures) || 4000, pageSize), 8000);
  const features = [];
  let exceededTransferLimit = false;

  try {
    for (let offset = 0; offset < maxFeatures; offset += pageSize) {
      const params = new URLSearchParams({
        f: 'geojson',
        where: '1=1',
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
        inSR: '4326',
        geometryType: 'esriGeometryEnvelope',
        spatialRel: 'esriSpatialRelIntersects',
        geometry: `${xmin},${ymin},${xmax},${ymax}`,
        resultOffset: String(offset),
        resultRecordCount: String(pageSize),
        orderByFields: 'OBJECTID',
      });
      const upstream = await fetchArcgis(`${BASEMAP_PATH}/${layerId}/query?${params.toString()}`);
      if (!upstream.ok) break;
      const page = JSON.parse(upstream.body.toString('utf8'));
      features.push(...(page.features || []));
      exceededTransferLimit = Boolean(page.exceededTransferLimit);
      if (!page.exceededTransferLimit && (page.features || []).length < pageSize) break;
    }

    res.json({
      type: 'FeatureCollection',
      layerId,
      exceededTransferLimit,
      returned: features.length,
      features: features.slice(0, maxFeatures),
    });
  } catch (error) {
    res.status(502).json({ error: 'Unable to query BMA layer', detail: error.message });
  }
});

app.get('/api/etl/qgis-status', async (req, res) => {
  const status = await findQgisProcess();
  res.json({
    ...status,
    note: status.found
      ? 'qgis_process is available for automation.'
      : 'qgis_process was not found. Install QGIS or set QGIS_PROCESS to enable native QGIS processing.',
  });
});

app.get('/api/engine/status', async (req, res) => {
  const health = await db.checkHealth();
  const qgis = await findQgisProcess();
  res.json({
    runtimeEngine: 'postgis-pgrouting',
    database: health.connected,
    postgis: health.connected && health.postgis ? true : false,
    pgrouting: health.connected && health.pgrouting ? true : false,
    qgisProcess: qgis.found ? 'available' : 'optional',
    error: health.error || null
  });
});

app.get('/api/districts', async (req, res) => {
  try {
    const districts = await loadDistricts();
    if (!districts) return res.status(404).json({ error: 'Districts layer not found.' });
    res.json(districts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load districts', detail: error.message });
  }
});

async function loadDistricts() {
  const processed = loadProcessedLayer(13);
  if (processed) return processed;

  const params = new URLSearchParams({
    f: 'geojson',
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
  });
  const upstream = await fetchArcgis(`${BASEMAP_PATH}/13/query?${params.toString()}`);
  if (!upstream.ok) return null;
  return JSON.parse(upstream.body.toString('utf8'));
}

async function loadRoadsForFacility(facility, distanceMeters) {
  const searchKm = Math.min(Math.max(distanceMeters / 1000 + 0.8, 1.2), 12);
  const searchArea = turf.buffer(turf.point([facility.lng, facility.lat]), searchKm, { units: 'kilometers' });
  const [xmin, ymin, xmax, ymax] = turf.bbox(searchArea);
  const processed = queryProcessedLayerByBbox(ROAD_LAYER_ID, [xmin, ymin, xmax, ymax], 50000);
  if (processed) return processed;

  const features = [];
  const pageSize = 2000;

  for (let offset = 0; offset < 10000; offset += pageSize) {
    const params = new URLSearchParams({
      f: 'geojson',
      where: '1=1',
      outFields: 'OBJECTID,ROAD_NAME_T,ROAD_DIRECTION,RC_LENGTH,SHAPE.LEN',
      returnGeometry: 'true',
      outSR: '4326',
      inSR: '4326',
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      geometry: `${xmin},${ymin},${xmax},${ymax}`,
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      orderByFields: 'OBJECTID',
    });
    const upstream = await fetchArcgis(`${BASEMAP_PATH}/${ROAD_LAYER_ID}/query?${params.toString()}`);
    if (!upstream.ok) break;
    const page = JSON.parse(upstream.body.toString('utf8'));
    features.push(...(page.features || []));
    if (!page.exceededTransferLimit && (page.features || []).length < pageSize) break;
  }

  return turf.featureCollection(features);
}

async function loadRoadsForFacilities(facilities, distanceMeters) {
  const collections = await Promise.all(facilities.map((facility) => loadRoadsForFacility(facility, distanceMeters)));
  const seen = new Set();
  const roads = [];

  for (const collection of collections) {
    for (const feature of collection.features || []) {
      const key = feature.id || feature.properties?.OBJECTID || JSON.stringify(feature.geometry?.coordinates?.slice?.(0, 2));
      if (!feature.geometry || seen.has(key)) continue;
      seen.add(key);
      roads.push(feature);
    }
  }

  return turf.featureCollection(roads);
}

function nodeKey(coord) {
  return `${Number(coord[0]).toFixed(6)},${Number(coord[1]).toFixed(6)}`;
}

function addNode(graph, coord) {
  const key = nodeKey(coord);
  if (!graph.nodes.has(key)) {
    graph.nodes.set(key, { key, coord, edges: [] });
  }
  return graph.nodes.get(key);
}

function eachLineCoords(feature) {
  if (feature.geometry?.type === 'LineString') return [feature.geometry.coordinates];
  if (feature.geometry?.type === 'MultiLineString') return feature.geometry.coordinates;
  return [];
}

function buildRoadGraph(roads) {
  const graph = { nodes: new Map(), edges: [] };

  for (const feature of roads.features || []) {
    for (const line of eachLineCoords(feature)) {
      for (let index = 0; index < line.length - 1; index += 1) {
        const start = line[index];
        const end = line[index + 1];
        if (!start || !end || start[0] === end[0] && start[1] === end[1]) continue;
        const a = addNode(graph, start);
        const b = addNode(graph, end);
        const lengthMeters = turf.distance(turf.point(start), turf.point(end), { units: 'kilometers' }) * 1000;
        if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) continue;
        const edge = {
          id: `${feature.id || feature.properties?.OBJECTID || 'road'}-${index}`,
          a: a.key,
          b: b.key,
          lengthMeters,
          coordinates: [start, end],
          properties: feature.properties || {},
        };
        graph.edges.push(edge);
        a.edges.push({ to: b.key, edge });
        b.edges.push({ to: a.key, edge });
      }
    }
  }

  return graph;
}

function nearestRoadNode(graph, facility) {
  const point = turf.point([facility.lng, facility.lat]);
  let nearest = null;

  for (const node of graph.nodes.values()) {
    const distanceMeters = turf.distance(point, turf.point(node.coord), { units: 'kilometers' }) * 1000;
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { nodeKey: node.key, coord: node.coord, distanceMeters };
    }
  }

  return nearest;
}

function pushHeap(heap, item) {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].distance <= item.distance) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = item;
}

function popHeap(heap) {
  if (heap.length === 1) return heap.pop();
  const top = heap[0];
  const item = heap.pop();
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const child = right < heap.length && heap[right].distance < heap[left].distance ? right : left;
    if (heap[child].distance >= item.distance) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = item;
  return top;
}

function dijkstra(graph, sourceKeys, cutoffMeters) {
  const distances = new Map();
  const queue = [];

  for (const key of sourceKeys) {
    distances.set(key, 0);
    pushHeap(queue, { key, distance: 0 });
  }

  while (queue.length) {
    const current = popHeap(queue);
    if (current.distance !== distances.get(current.key)) continue;
    if (current.distance > cutoffMeters) continue;

    const node = graph.nodes.get(current.key);
    if (!node) continue;

    for (const adjacent of node.edges) {
      const nextDistance = current.distance + adjacent.edge.lengthMeters;
      if (nextDistance > cutoffMeters) continue;
      if (!distances.has(adjacent.to) || nextDistance < distances.get(adjacent.to)) {
        distances.set(adjacent.to, nextDistance);
        pushHeap(queue, { key: adjacent.to, distance: nextDistance });
      }
    }
  }

  return distances;
}

function buildNetworkServiceArea(graph, distances, distanceMeters) {
  const reachableEdges = graph.edges.filter((edge) => distances.has(edge.a) && distances.has(edge.b));
  const reachableLines = turf.featureCollection(
    reachableEdges.map((edge) =>
      turf.lineString(edge.coordinates, {
        ...edge.properties,
        lengthMeters: Number(edge.lengthMeters.toFixed(2)),
        fromCostMeters: Number(distances.get(edge.a).toFixed(2)),
        toCostMeters: Number(distances.get(edge.b).toFixed(2)),
      }),
    ),
  );

  const nodePoints = Array.from(distances.entries()).map(([key, costMeters]) =>
    turf.point(graph.nodes.get(key).coord, { costMeters: Number(costMeters.toFixed(2)) }),
  );

  let serviceArea = null;
  if (nodePoints.length >= 4) {
    const maxEdgeKm = Math.max(0.35, Math.min(distanceMeters / 2500, 3));
    try {
      serviceArea = turf.concave(turf.featureCollection(nodePoints), { maxEdge: maxEdgeKm, units: 'kilometers' });
    } catch {
      serviceArea = null;
    }
  }
  if (!serviceArea && nodePoints.length >= 3) {
    serviceArea = turf.convex(turf.featureCollection(nodePoints));
  }
  if (serviceArea) {
    serviceArea.properties = {
      ...(serviceArea.properties || {}),
      method: 'network-node-envelope',
      note: 'Approximate polygon derived from reachable road-network nodes.',
    };
  }
  if (!serviceArea && reachableLines.features.length) {
    serviceArea = turf.buffer(reachableLines, 0.04, { units: 'kilometers' });
    serviceArea.properties = {
      ...(serviceArea.properties || {}),
      method: 'network-road-corridor',
      note: 'Approximate corridor around reachable road-network edges.',
    };
  }

  return {
    reachableRoads: reachableLines,
    serviceArea: serviceArea || turf.featureCollection([]),
    networkNodes: turf.featureCollection(nodePoints),
    reachedRoadLengthKm: reachableEdges.reduce((sum, edge) => sum + edge.lengthMeters, 0) / 1000,
  };
}

function normalizeFacilities(facilities) {
  return facilities
    .map((facility, index) => ({
      id: facility.id || `facility-${index + 1}`,
      name: facility.name || `จุดบริการ ${index + 1}`,
      type: facility.type || 'service',
      lng: Number(facility.lng),
      lat: Number(facility.lat),
    }))
    .filter((facility) => Number.isFinite(facility.lng) && Number.isFinite(facility.lat));
}

function normalizeTravelCost(body) {
  const travelMinutes = Math.max(1, Math.min(Number(body.travelMinutes) || 15, 120));
  const speedKmh = Math.max(1, Math.min(Number(body.speedKmh) || 6, 120));
  const distanceMetersFromTime = (speedKmh * 1000 * travelMinutes) / 60;
  const requestedDistanceMeters = Number(body.distanceMeters);
  const distanceMeters = Math.max(
    100,
    Math.min(Number.isFinite(requestedDistanceMeters) && requestedDistanceMeters > 0 ? requestedDistanceMeters : distanceMetersFromTime, 50000),
  );

  return {
    travelMinutes,
    speedKmh,
    distanceMeters,
  };
}

app.post('/api/analyze', async (req, res) => {
  const facilities = normalizeFacilities(req.body.facilities || []);
  const travelCost = normalizeTravelCost(req.body);
  const { distanceMeters, speedKmh, travelMinutes } = travelCost;

  if (!facilities.length) {
    return res.status(400).json({ error: 'Add at least one service point before analysis.' });
  }

  // 1. Check database connectivity
  const health = await db.checkHealth();
  if (!health.connected || !health.postgis || !health.pgrouting) {
    return res.status(503).json({
      error: 'Database is not ready for pgRouting analysis. Please make sure PostGIS and pgRouting are enabled.',
      detail: health.error || 'Missing extensions'
    });
  }

  try {
    // 2. Resolve nearest vertices in the database for each facility
    const snappedFacilities = [];
    for (const facility of facilities) {
      const vertexRes = await db.query(`
        SELECT id, ST_X(ST_Transform(the_geom, 4326)) as snap_lng, ST_Y(ST_Transform(the_geom, 4326)) as snap_lat,
               ST_Distance(the_geom, ST_Transform(ST_SetSRID(ST_Point($1, $2), 4326), 32647)) as dist
        FROM roads_vertices_pgr
        ORDER BY the_geom <-> ST_Transform(ST_SetSRID(ST_Point($1, $2), 4326), 32647)
        LIMIT 1
      `, [facility.lng, facility.lat]);

      if (vertexRes.rows.length > 0) {
        const row = vertexRes.rows[0];
        // If nearest node is more than 1.5km away, treat it as out of bounds / invalid
        if (row.dist <= 1500) {
          snappedFacilities.push({
            ...facility,
            snap: {
              nodeKey: row.id,
              coord: [Number(row.snap_lng), Number(row.snap_lat)],
              distanceMeters: Number(row.dist)
            }
          });
        }
      }
    }

    if (snappedFacilities.length === 0) {
      return res.status(422).json({ error: 'Selected service points are too far from the road network (limit 1.5 km).' });
    }

    const startNodeIds = snappedFacilities.map(f => f.snap.nodeKey);
    const bufferMeters = Number(process.env.SERVICE_AREA_BUFFER_M) || 50;

    // 3. Query reachable road network segments (LineStrings)
    const roadsQuery = `
      SELECT 
        r.id,
        r.road_name,
        r.road_type,
        d.agg_cost,
        ST_AsGeoJSON(ST_Transform(r.geom, 4326))::json AS geom
      FROM roads r
      JOIN (
        SELECT * FROM pgr_drivingDistance(
          'SELECT id, source, target, cost, reverse_cost FROM roads',
          $1::integer[],
          $2::double precision,
          directed := false
        )
      ) d ON r.source = d.node OR r.target = d.node
    `;
    const roadsRes = await db.query(roadsQuery, [startNodeIds, distanceMeters]);

    // 4. Query reached network nodes (Points)
    const nodesQuery = `
      SELECT 
        v.id,
        d.agg_cost,
        ST_AsGeoJSON(ST_Transform(v.the_geom, 4326))::json AS geom
      FROM roads_vertices_pgr v
      JOIN (
        SELECT * FROM pgr_drivingDistance(
          'SELECT id, source, target, cost, reverse_cost FROM roads',
          $1::integer[],
          $2::double precision,
          directed := false
        )
      ) d ON v.id = d.node
    `;
    const nodesRes = await db.query(nodesQuery, [startNodeIds, distanceMeters]);

    // 5. Query merged service area polygon (MultiPolygon)
    const polygonQuery = `
      WITH reachable AS (
        SELECT * FROM pgr_drivingDistance(
          'SELECT id, source, target, cost, reverse_cost FROM roads',
          $1::integer[],
          $2::double precision,
          directed := false
        )
      ),
      reachable_edges AS (
        SELECT r.geom
        FROM roads r
        JOIN reachable d ON r.source = d.node OR r.target = d.node
      ),
      merged AS (
        SELECT ST_UnaryUnion(ST_Buffer(geom, $3::double precision)) AS geom
        FROM reachable_edges
      )
      SELECT 
        ST_AsGeoJSON(ST_Transform(ST_Multi(geom), 4326))::json AS geom_geojson,
        ST_Area(geom) / 1000000.0 AS area_sq_km
      FROM merged
    `;
    const polyRes = await db.query(polygonQuery, [startNodeIds, distanceMeters, bufferMeters]);
    const polyRow = polyRes.rows[0];

    const polyGeometry = polyRow?.geom_geojson;
    const areaSqKm = Number(polyRow?.area_sq_km || 0);

    const serviceAreaFeature = polyGeometry ? {
      type: 'Feature',
      geometry: polyGeometry,
      properties: {
        method: 'pgrouting-buffer',
        bufferMeters,
        areaSqKm: Number(areaSqKm.toFixed(3))
      }
    } : null;

    const serviceArea = {
      type: 'FeatureCollection',
      features: serviceAreaFeature ? [serviceAreaFeature] : [],
      properties: {
        areaSqKm: Number(areaSqKm.toFixed(3))
      }
    };

    const reachableRoads = {
      type: 'FeatureCollection',
      features: roadsRes.rows.map(row => ({
        type: 'Feature',
        geometry: row.geom,
        properties: {
          id: row.id,
          road_name: row.road_name,
          road_type: row.road_type,
          agg_cost: Number(row.agg_cost.toFixed(2))
        }
      }))
    };

    const networkNodes = {
      type: 'FeatureCollection',
      features: nodesRes.rows.map(row => ({
        type: 'Feature',
        geometry: row.geom,
        properties: {
          id: row.id,
          agg_cost: Number(row.agg_cost.toFixed(2))
        }
      }))
    };

    // 6. Calculate intersecting districts (using in-memory WGS84 boundary intersection)
    let intersectingDistricts = [];
    if (polyGeometry) {
      try {
        const districts = await loadDistricts();
        if (districts?.features?.length) {
          intersectingDistricts = districts.features
            .filter((district) => {
              try {
                return turf.booleanIntersects(serviceAreaFeature, district);
              } catch {
                return false;
              }
            })
            .map((district) => ({
              id: district.id,
              name: district.properties?.DNAME || district.properties?.DISTRICT_N || district.properties?.NAME || district.properties?.name || 'ไม่ทราบชื่อเขต',
              properties: district.properties,
            }));
        }
      } catch (e) {
        console.error('District intersection calculation failed:', e.message);
      }
    }

    const pointFeatures = turf.featureCollection(
      facilities.map((facility) =>
        turf.point([facility.lng, facility.lat], {
          id: facility.id,
          name: facility.name,
          type: facility.type,
        }),
      ),
    );

    const qgis = await findQgisProcess();
    const responseJson = {
      engine: 'postgis-pgrouting',
      analysisType: 'road-network',
      qgis,
      metrics: {
        facilities: facilities.length,
        distanceMeters,
        travelMinutes,
        speedKmh,
        serviceAreaSqKm: Number(areaSqKm.toFixed(3)),
        reachedRoadLengthKm: Number((roadsRes.rows.reduce((sum, row) => sum + (row.agg_cost || 0), 0) / 1000).toFixed(3)),
        roadFeaturesLoaded: roadsRes.rows.length,
        networkNodesReached: nodesRes.rows.length,
        averageSnapDistanceMeters: Number(
          (
            snappedFacilities.reduce((sum, facility) => sum + facility.snap.distanceMeters, 0) /
            Math.max(snappedFacilities.length, 1)
          ).toFixed(2),
        ),
        intersectingDistricts: intersectingDistricts.length,
      },
      facilities: pointFeatures,
      snappedFacilities: turf.featureCollection(
        snappedFacilities.map((facility) =>
          turf.point(facility.snap.coord, {
            id: facility.id,
            name: facility.name,
            snapDistanceMeters: Number(facility.snap.distanceMeters.toFixed(2)),
          }),
        ),
      ),
      networkNodes,
      reachableRoads,
      serviceArea,
      intersectingDistricts,
    };

    // Log the analysis query and spatial geometries to database for history
    const requestId = `req-${Date.now()}`;
    if (polyGeometry) {
      try {
        await db.query(`
          INSERT INTO service_area_results (request_id, distance_m, engine, geom, result_geojson)
          VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 32647), $5)
        `, [
          requestId,
          distanceMeters,
          'postgis-pgrouting',
          JSON.stringify(polyGeometry),
          JSON.stringify(responseJson)
        ]);
      } catch (dbErr) {
        console.error('Failed to log service area history:', dbErr.message);
      }
    }

    res.json(responseJson);

  } catch (error) {
    res.status(500).json({ error: 'pgRouting network analysis failed', detail: error.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Bangkok service area API listening on http://127.0.0.1:${PORT}`);
  });
}

app.app = app;
app.normalizeFacilities = normalizeFacilities;
app.normalizeTravelCost = normalizeTravelCost;
app.queryProcessedLayerByBbox = queryProcessedLayerByBbox;

module.exports = app;
