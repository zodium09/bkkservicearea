const turf = require('@turf/turf');
const { edgeSql } = require('../db/routing.queries');
const cache = require('./cache.service');
const network = require('./network.service');

function nodeKey(coord) {
  return `${Number(coord[0]).toFixed(6)},${Number(coord[1]).toFixed(6)}`;
}

function addNode(graph, coord) {
  const key = nodeKey(coord);
  if (!graph.nodes.has(key)) graph.nodes.set(key, { key, coord, edges: [] });
  return graph.nodes.get(key);
}

function eachLineCoords(feature) {
  if (feature.geometry?.type === 'LineString') return [feature.geometry.coordinates];
  if (feature.geometry?.type === 'MultiLineString') return feature.geometry.coordinates;
  return [];
}

function buildRoadGraph(roads, request) {
  const graph = { nodes: new Map(), edges: [] };
  const modeSpeed = request.mode === 'drive' ? 25 : request.mode === 'bike' ? 15 : 5;

  for (const feature of roads.features || []) {
    for (const line of eachLineCoords(feature)) {
      for (let index = 0; index < line.length - 1; index += 1) {
        const start = line[index];
        const end = line[index + 1];
        if (!start || !end || (start[0] === end[0] && start[1] === end[1])) continue;
        const a = addNode(graph, start);
        const b = addNode(graph, end);
        const lengthMeters = turf.distance(turf.point(start), turf.point(end), { units: 'kilometers' }) * 1000;
        if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) continue;
        const cost = request.costType === 'time' ? lengthMeters / (modeSpeed * 1000 / 3600) : lengthMeters;
        const edge = {
          id: `${feature.id || feature.properties?.OBJECTID || 'road'}-${index}`,
          a: a.key,
          b: b.key,
          lengthMeters,
          cost,
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
    if (!nearest || distanceMeters < nearest.distanceMeters) nearest = { nodeKey: node.key, coord: node.coord, distanceMeters };
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

function dijkstra(graph, sourceKeys, cutoff) {
  const distances = new Map();
  const queue = [];
  for (const key of sourceKeys) {
    distances.set(key, 0);
    pushHeap(queue, { key, distance: 0 });
  }
  while (queue.length) {
    const current = popHeap(queue);
    if (current.distance !== distances.get(current.key) || current.distance > cutoff) continue;
    const node = graph.nodes.get(current.key);
    if (!node) continue;
    for (const adjacent of node.edges) {
      const nextDistance = current.distance + adjacent.edge.cost;
      if (nextDistance > cutoff) continue;
      if (!distances.has(adjacent.to) || nextDistance < distances.get(adjacent.to)) {
        distances.set(adjacent.to, nextDistance);
        pushHeap(queue, { key: adjacent.to, distance: nextDistance });
      }
    }
  }
  return distances;
}

function modeBufferMeters(mode) {
  if (mode === 'drive') return Number(process.env.SERVICE_AREA_DRIVE_BUFFER_M) || 125;
  if (mode === 'bike') return Number(process.env.SERVICE_AREA_BIKE_BUFFER_M) || 65;
  return Number(process.env.SERVICE_AREA_WALK_BUFFER_M) || 40;
}

function buildNetworkServiceArea(graph, distances, request) {
  const reachableEdges = graph.edges.filter((edge) => distances.has(edge.a) && distances.has(edge.b));
  const reachableLines = turf.featureCollection(reachableEdges.map((edge) =>
    turf.lineString(edge.coordinates, {
      ...edge.properties,
      lengthMeters: Number(edge.lengthMeters.toFixed(2)),
      fromCost: Number(distances.get(edge.a).toFixed(2)),
      toCost: Number(distances.get(edge.b).toFixed(2)),
    }),
  ));
  const nodePoints = Array.from(distances.entries()).map(([key, cost]) =>
    turf.point(graph.nodes.get(key).coord, { cost: Number(cost.toFixed(2)) }),
  );

  let serviceArea = null;
  if (reachableLines.features.length) {
    serviceArea = turf.buffer(reachableLines, modeBufferMeters(request.mode) / 1000, { units: 'kilometers' });
    serviceArea.properties = {
      ...(serviceArea.properties || {}),
      method: 'network-road-corridor',
      bufferMeters: modeBufferMeters(request.mode),
    };
  }
  const areaSqKm = serviceArea ? turf.area(serviceArea) / 1000000 : 0;
  if (serviceArea) serviceArea.properties.areaSqKm = Number(areaSqKm.toFixed(3));

  return {
    reachableRoads: reachableLines,
    serviceArea: serviceArea ? turf.featureCollection([serviceArea]) : turf.featureCollection([]),
    networkNodes: turf.featureCollection(nodePoints),
    reachedRoadLengthKm: reachableEdges.reduce((sum, edge) => sum + edge.lengthMeters, 0) / 1000,
    areaSqKm,
  };
}

function buildApproximateServiceArea(request, reason) {
  const facility = request.facilities[0];
  const radiusKm = Math.max(request.distanceMeters / 1000, 0.1);
  const point = turf.point([facility.lng, facility.lat], {
    id: facility.id,
    name: facility.name,
    type: facility.type,
  });
  const serviceFeature = turf.circle(point, radiusKm, {
    steps: 96,
    units: 'kilometers',
    properties: {
      method: 'straight-line-fallback',
      reason,
      mode: request.mode,
      costType: request.costType,
      limit: request.limit,
      radiusMeters: Number((radiusKm * 1000).toFixed(2)),
    },
  });
  const areaSqKm = turf.area(serviceFeature) / 1000000;
  serviceFeature.properties.areaSqKm = Number(areaSqKm.toFixed(3));

  const snap = { nodeKey: 'manual-point', coord: [facility.lng, facility.lat], distanceMeters: 0 };
  return {
    snappedFacilities: [{ ...facility, snap }],
    networkNodes: turf.featureCollection([point]),
    reachableRoads: turf.featureCollection([]),
    serviceArea: turf.featureCollection([serviceFeature]),
    areaSqKm,
    reachedRoadLengthKm: 0,
  };
}

async function intersectingDistricts(serviceArea) {
  if (!serviceArea?.features?.length) return [];
  try {
    const districts = await network.loadDistricts();
    if (!districts?.features?.length) return [];
    const serviceAreaFeature = serviceArea.features[0];
    return districts.features
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
  } catch (err) {
    console.error('District intersection calculation failed:', err.message);
    return [];
  }
}

function pointCollections(facilities, snappedFacilities) {
  return {
    facilities: turf.featureCollection(facilities.map((facility) =>
      turf.point([facility.lng, facility.lat], { id: facility.id, name: facility.name, type: facility.type }),
    )),
    snappedFacilities: turf.featureCollection(snappedFacilities.map((facility) =>
      turf.point(facility.snap.coord, {
        id: facility.id,
        name: facility.name,
        snapDistanceMeters: Number(facility.snap.distanceMeters.toFixed(2)),
      }),
    )),
  };
}

async function analyzeFallback(request) {
  let roads;
  let approximateReason = null;
  const canUseLiveArcgisRoads = process.env.ENABLE_ARCGIS_ROAD_FALLBACK === 'true';
  const canUseLargeLocalRoads = process.env.ENABLE_LARGE_LOCAL_ROADS === 'true';
  const roadLayerMaxBytes = Number(process.env.FALLBACK_ROAD_LAYER_MAX_BYTES) || 25 * 1024 * 1024;
  const hasUsableLocalRoads = canUseLargeLocalRoads || network.isProcessedLayerSmallEnough(network.ROAD_LAYER_ID, roadLayerMaxBytes);
  if (!hasUsableLocalRoads && !canUseLiveArcgisRoads) {
    approximateReason = network.hasProcessedLayer(network.ROAD_LAYER_ID)
      ? 'Local road layer is too large for interactive fallback. Enable large local roads or use PostGIS/pgRouting for network analysis.'
      : 'Local road layer is not available and live ArcGIS road fallback is disabled.';
  }
  try {
    if (!approximateReason) {
      roads = await Promise.race([
        network.loadRoadsForFacilities(request.facilities, request.distanceMeters),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Road network fallback timed out.')), Number(process.env.FALLBACK_ROAD_TIMEOUT_MS) || 12000).unref?.();
        }),
      ]);
    }
  } catch (error) {
    approximateReason = error.message || 'Road network fallback failed.';
  }
  if (approximateReason || !roads?.features?.length) {
    const networkArea = buildApproximateServiceArea(request, approximateReason || 'No road features were available near the selected point.');
    const districts = await intersectingDistricts(networkArea.serviceArea);
    const points = pointCollections(request.facilities, networkArea.snappedFacilities);
    const qgis = { found: false, command: null, version: null, skipped: true };
    return formatResponse({
      engine: 'straight-line-fallback',
      request,
      qgis,
      points,
      snappedFacilities: networkArea.snappedFacilities,
      networkNodes: networkArea.networkNodes,
      reachableRoads: networkArea.reachableRoads,
      serviceArea: networkArea.serviceArea,
      intersectingDistricts: districts,
      areaSqKm: networkArea.areaSqKm,
      reachedRoadLengthKm: networkArea.reachedRoadLengthKm,
      roadFeaturesLoaded: roads?.features?.length || 0,
      networkNodesReached: networkArea.networkNodes.features.length,
      fallbackReason: networkArea.serviceArea.features[0].properties.reason,
      analysisQuality: 'approximate',
    });
  }
  const graph = buildRoadGraph(roads, request);
  const snappedFacilities = [];
  const sourceKeys = [];
  for (const facility of request.facilities) {
    const nearest = nearestRoadNode(graph, facility);
    if (nearest && nearest.distanceMeters <= 1500) {
      snappedFacilities.push({ ...facility, snap: nearest });
      sourceKeys.push(nearest.nodeKey);
    }
  }
  if (!snappedFacilities.length) {
    const error = new Error('Selected service points are too far from the road network (limit 1.5 km).');
    error.status = 422;
    throw error;
  }

  const distances = dijkstra(graph, sourceKeys, request.limit);
  const networkArea = buildNetworkServiceArea(graph, distances, request);
  const districts = await intersectingDistricts(networkArea.serviceArea);
  const points = pointCollections(request.facilities, snappedFacilities);
  const qgis = await network.findQgisProcess();
  return formatResponse({
    engine: 'js-dijkstra-fallback',
    request,
    qgis,
    points,
    snappedFacilities,
    networkNodes: networkArea.networkNodes,
    reachableRoads: networkArea.reachableRoads,
    serviceArea: networkArea.serviceArea,
    intersectingDistricts: districts,
    areaSqKm: networkArea.areaSqKm,
    reachedRoadLengthKm: networkArea.reachedRoadLengthKm,
    roadFeaturesLoaded: roads.features.length,
    networkNodesReached: distances.size,
    analysisQuality: 'network',
  });
}

function formatResponse(context) {
  const {
    engine,
    request,
    qgis,
    points,
    snappedFacilities,
    networkNodes,
    reachableRoads,
    serviceArea,
    intersectingDistricts,
    areaSqKm,
    reachedRoadLengthKm,
    roadFeaturesLoaded,
    networkNodesReached,
    fallbackReason,
    analysisQuality = 'network',
  } = context;
  const averageSnapDistanceMeters = Number((
    snappedFacilities.reduce((sum, facility) => sum + facility.snap.distanceMeters, 0) / Math.max(snappedFacilities.length, 1)
  ).toFixed(2));
  const stats = {
    mode: request.mode,
    costType: request.costType,
    limit: request.limit,
    areaSqKm: Number(areaSqKm.toFixed(3)),
    roadLengthKm: Number((reachedRoadLengthKm || 0).toFixed(3)),
    reachedNodes: networkNodesReached,
    cacheHit: false,
  };

  return {
    engine,
    analysisType: 'road-network',
    analysisQuality,
    fallbackReason,
    qgis,
    cacheHit: false,
    stats,
    metrics: {
      facilities: request.facilities.length,
      distanceMeters: Number(request.distanceMeters.toFixed(2)),
      travelMinutes: Number(request.travelMinutes.toFixed(2)),
      speedKmh: request.speedKmh,
      serviceAreaSqKm: stats.areaSqKm,
      reachedRoadLengthKm: stats.roadLengthKm,
      roadFeaturesLoaded,
      networkNodesReached,
      averageSnapDistanceMeters,
      intersectingDistricts: intersectingDistricts.length,
      mode: request.mode,
      costType: request.costType,
      limit: request.limit,
    },
    ...points,
    networkNodes,
    reachableRoads,
    serviceArea,
    intersectingDistricts,
  };
}

async function getNetworkCapabilities(db) {
  try {
    const columns = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'roads'
        AND column_name IN (
          'walk_cost_s', 'bike_cost_s', 'drive_cost_s',
          'reverse_walk_cost_s', 'reverse_bike_cost_s', 'reverse_drive_cost_s',
          'length_m'
        )
    `);
    const blocked = await db.query("SELECT to_regclass('public.blocked_edges') AS table_name");
    const columnSet = new Set(columns.rows.map((row) => row.column_name));
    return {
      hasTimeCosts: ['walk_cost_s', 'bike_cost_s', 'drive_cost_s', 'reverse_walk_cost_s', 'reverse_bike_cost_s', 'reverse_drive_cost_s']
        .every((column) => columnSet.has(column)),
      hasBlockedEdges: Boolean(blocked.rows[0]?.table_name),
    };
  } catch {
    return { hasTimeCosts: false, hasBlockedEdges: false };
  }
}

async function analyzeWithPgRouting(db, request) {
  const key = cache.cacheKey(request);
  const cached = await cache.get(db, key);
  if (cached) return cached;

  const snappedFacilities = [];
  for (const facility of request.facilities) {
    const vertexRes = await db.query(`
      SELECT id, ST_X(ST_Transform(the_geom, 4326)) as snap_lng, ST_Y(ST_Transform(the_geom, 4326)) as snap_lat,
             ST_Distance(the_geom, ST_Transform(ST_SetSRID(ST_Point($1, $2), 4326), 32647)) as dist
      FROM roads_vertices_pgr
      ORDER BY the_geom <-> ST_Transform(ST_SetSRID(ST_Point($1, $2), 4326), 32647)
      LIMIT 1
    `, [facility.lng, facility.lat]);
    if (vertexRes.rows.length && Number(vertexRes.rows[0].dist) <= 1500) {
      const row = vertexRes.rows[0];
      snappedFacilities.push({
        ...facility,
        snap: { nodeKey: row.id, coord: [Number(row.snap_lng), Number(row.snap_lat)], distanceMeters: Number(row.dist) },
      });
    }
  }
  if (!snappedFacilities.length) {
    const error = new Error('Selected service points are too far from the road network (limit 1.5 km).');
    error.status = 422;
    throw error;
  }

  const startNodeIds = snappedFacilities.map((facility) => facility.snap.nodeKey);
  const bufferMeters = modeBufferMeters(request.mode);
  const capabilities = await getNetworkCapabilities(db);
  const routingSql = edgeSql(request.mode, request.costType, capabilities).replace(/\s+/g, ' ');
  const directed = capabilities.hasTimeCosts && (request.costType === 'time' || request.mode === 'drive');

  const roadsRes = await db.query(`
    SELECT r.id, r.road_name, r.name, r.highway, r.road_type, r.oneway, d.agg_cost,
           ST_Length(r.geom) AS length_m,
           ST_AsGeoJSON(ST_Transform(r.geom, 4326))::json AS geom
    FROM roads r
    JOIN (
      SELECT * FROM pgr_drivingDistance($3, $1::integer[], $2::double precision, directed := $4)
    ) d ON r.source = d.node OR r.target = d.node
  `, [startNodeIds, request.limit, routingSql, directed]);

  const nodesRes = await db.query(`
    SELECT v.id, d.agg_cost, ST_AsGeoJSON(ST_Transform(v.the_geom, 4326))::json AS geom
    FROM roads_vertices_pgr v
    JOIN (
      SELECT * FROM pgr_drivingDistance($3, $1::integer[], $2::double precision, directed := $4)
    ) d ON v.id = d.node
  `, [startNodeIds, request.limit, routingSql, directed]);

  const polyRes = await db.query(`
    WITH reachable AS (
      SELECT * FROM pgr_drivingDistance($3, $1::integer[], $2::double precision, directed := $5)
    ),
    reachable_edges AS (
      SELECT r.geom
      FROM roads r
      JOIN reachable d ON r.source = d.node OR r.target = d.node
    ),
    merged AS (
      SELECT ST_SimplifyPreserveTopology(ST_UnaryUnion(ST_Buffer(geom, $4::double precision)), $6::double precision) AS geom
      FROM reachable_edges
    )
    SELECT ST_AsGeoJSON(ST_Transform(ST_Multi(geom), 4326))::json AS geom_geojson,
           ST_Area(geom) / 1000000.0 AS area_sq_km
    FROM merged
  `, [startNodeIds, request.limit, routingSql, bufferMeters, directed, Number(process.env.SERVICE_AREA_SIMPLIFY_M) || 8]);

  const polyGeometry = polyRes.rows[0]?.geom_geojson;
  const areaSqKm = Number(polyRes.rows[0]?.area_sq_km || 0);
  const serviceArea = {
    type: 'FeatureCollection',
    features: polyGeometry ? [{
      type: 'Feature',
      geometry: polyGeometry,
      properties: {
        method: 'pgrouting-buffer',
        mode: request.mode,
        costType: request.costType,
        limit: request.limit,
        bufferMeters,
        areaSqKm: Number(areaSqKm.toFixed(3)),
      },
    }] : [],
    properties: { areaSqKm: Number(areaSqKm.toFixed(3)) },
  };
  const reachableRoads = {
    type: 'FeatureCollection',
    features: roadsRes.rows.map((row) => ({
      type: 'Feature',
      geometry: row.geom,
      properties: {
        id: row.id,
        road_name: row.road_name || row.name,
        road_type: row.road_type || row.highway,
        oneway: row.oneway,
        length_m: Number(Number(row.length_m || 0).toFixed(2)),
        agg_cost: Number(Number(row.agg_cost || 0).toFixed(2)),
      },
    })),
  };
  const networkNodes = {
    type: 'FeatureCollection',
    features: nodesRes.rows.map((row) => ({
      type: 'Feature',
      geometry: row.geom,
      properties: { id: row.id, agg_cost: Number(Number(row.agg_cost || 0).toFixed(2)) },
    })),
  };
  const districts = await intersectingDistricts(serviceArea);
  const points = pointCollections(request.facilities, snappedFacilities);
  const qgis = await network.findQgisProcess();
  const roadLengthKm = roadsRes.rows.reduce((sum, row) => sum + Number(row.length_m || 0), 0) / 1000;
  const response = formatResponse({
    engine: 'postgis-pgrouting',
    request,
    qgis,
    points,
    snappedFacilities,
    networkNodes,
    reachableRoads,
    serviceArea,
    intersectingDistricts: districts,
    areaSqKm,
    reachedRoadLengthKm: roadLengthKm,
    roadFeaturesLoaded: roadsRes.rows.length,
    networkNodesReached: nodesRes.rows.length,
  });
  response.snappedNode = snappedFacilities[0]?.snap?.nodeKey || null;
  await cache.set(db, key, request, response);
  return response;
}

module.exports = { analyzeFallback, analyzeWithPgRouting, modeBufferMeters };
