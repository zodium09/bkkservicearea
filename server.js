const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const turf = require('@turf/turf');

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
  
  if (!['health', 'education', 'parks', 'transit'].includes(category)) {
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

app.get('/api/qgis/status', async (req, res) => {
  const status = await findQgisProcess();
  res.json({
    ...status,
    note: status.found
      ? 'qgis_process is available for automation.'
      : 'qgis_process was not found. Install QGIS or set QGIS_PROCESS to enable native QGIS processing.',
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

  const pointFeatures = turf.featureCollection(
    facilities.map((facility) =>
      turf.point([facility.lng, facility.lat], {
        id: facility.id,
        name: facility.name,
        type: facility.type,
      }),
    ),
  );

  const roads = await loadRoadsForFacilities(facilities, distanceMeters);
  const graph = buildRoadGraph(roads);
  if (!graph.nodes.size) {
    return res.status(422).json({ error: 'No road network was found near the selected service points.' });
  }

  const snappedFacilities = facilities
    .map((facility) => ({ ...facility, snap: nearestRoadNode(graph, facility) }))
    .filter((facility) => facility.snap);
  const sourceKeys = snappedFacilities.map((facility) => facility.snap.nodeKey);
  const distances = dijkstra(graph, sourceKeys, distanceMeters);
  const network = buildNetworkServiceArea(graph, distances, distanceMeters);
  const serviceArea = network.serviceArea;
  const areaSqKm = turf.area(serviceArea) / 1_000_000;

  let intersectingDistricts = [];
  try {
    const districts = await loadDistricts();
    if (districts?.features?.length) {
      intersectingDistricts = districts.features
        .filter((district) => {
          try {
            return turf.booleanIntersects(serviceArea, district);
          } catch {
            return false;
          }
        })
        .map((district) => ({
          id: district.id,
          name:
            district.properties?.DNAME ||
            district.properties?.DISTRICT_N ||
            district.properties?.NAME ||
            district.properties?.name ||
            'ไม่ทราบชื่อเขต',
          properties: district.properties,
        }));
    }
  } catch {
    intersectingDistricts = [];
  }

  const qgis = await findQgisProcess();
  res.json({
    engine: qgis.found ? 'js-network-analysis-qgis-available' : 'js-network-analysis',
    analysisType: 'road-network',
    qgis,
    metrics: {
      facilities: facilities.length,
      distanceMeters,
      travelMinutes,
      speedKmh,
      serviceAreaSqKm: Number(areaSqKm.toFixed(3)),
      reachedRoadLengthKm: Number(network.reachedRoadLengthKm.toFixed(3)),
      roadFeaturesLoaded: roads.features.length,
      networkNodesReached: distances.size,
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
    networkNodes: network.networkNodes,
    reachableRoads: network.reachableRoads,
    serviceArea,
    intersectingDistricts,
  });
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

module.exports = {
  app,
  normalizeFacilities,
  normalizeTravelCost,
  queryProcessedLayerByBbox,
};
