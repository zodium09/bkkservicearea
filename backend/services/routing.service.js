const turf = require('@turf/turf');
const { edgeSql } = require('../db/routing.queries');
const cache = require('./cache.service');
const network = require('./network.service');

function nodeKey(coord) {
  const precision = Number(process.env.FALLBACK_TOPOLOGY_COORD_PRECISION) || 5;
  return `${Number(coord[0]).toFixed(precision)},${Number(coord[1]).toFixed(precision)}`;
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

function projectionFor(roads) {
  const coords = [];
  for (const feature of roads.features || []) {
    for (const line of eachLineCoords(feature)) {
      coords.push(...line);
      if (coords.length > 500) break;
    }
    if (coords.length > 500) break;
  }
  const lat = coords.length
    ? coords.reduce((sum, coord) => sum + Number(coord[1] || 0), 0) / coords.length
    : 13.7563;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = metersPerDegreeLat * Math.cos((lat * Math.PI) / 180);

  return {
    toXY: (coord) => ({
      x: Number(coord[0]) * metersPerDegreeLng,
      y: Number(coord[1]) * metersPerDegreeLat,
    }),
  };
}

function segmentPoint(segment, t) {
  return [
    segment.start[0] + (segment.end[0] - segment.start[0]) * t,
    segment.start[1] + (segment.end[1] - segment.start[1]) * t,
  ];
}

function collectSegments(roads, project) {
  const segments = [];
  for (const feature of roads.features || []) {
    for (const line of eachLineCoords(feature)) {
      for (let index = 0; index < line.length - 1; index += 1) {
        const start = line[index];
        const end = line[index + 1];
        if (!start || !end || (start[0] === end[0] && start[1] === end[1])) continue;
        const startXY = project.toXY(start);
        const endXY = project.toXY(end);
        const lengthMeters = Math.hypot(endXY.x - startXY.x, endXY.y - startXY.y);
        if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) continue;
        segments.push({
          id: `${feature.id || feature.properties?.OBJECTID || 'road'}-${index}`,
          start,
          end,
          startXY,
          endXY,
          lengthMeters,
          properties: feature.properties || {},
          splits: [0, 1],
          bbox: {
            minX: Math.min(startXY.x, endXY.x),
            minY: Math.min(startXY.y, endXY.y),
            maxX: Math.max(startXY.x, endXY.x),
            maxY: Math.max(startXY.y, endXY.y),
          },
        });
      }
    }
  }
  return segments;
}

function addSplit(segment, t, epsilon = 1e-6) {
  if (!Number.isFinite(t) || t <= epsilon || t >= 1 - epsilon) return;
  if (!segment.splits.some((value) => Math.abs(value - t) <= epsilon)) segment.splits.push(t);
}

function densifySegments(segments) {
  const spacingMeters = Number(process.env.FALLBACK_TOPOLOGY_NODE_SPACING_M) || 75;
  for (const segment of segments) {
    if (segment.lengthMeters <= spacingMeters) continue;
    const parts = Math.ceil(segment.lengthMeters / spacingMeters);
    for (let step = 1; step < parts; step += 1) addSplit(segment, step / parts);
  }
}

function segmentIntersection(a, b) {
  const ax = a.startXY.x;
  const ay = a.startXY.y;
  const bx = a.endXY.x;
  const by = a.endXY.y;
  const cx = b.startXY.x;
  const cy = b.startXY.y;
  const dx = b.endXY.x;
  const dy = b.endXY.y;
  const rX = bx - ax;
  const rY = by - ay;
  const sX = dx - cx;
  const sY = dy - cy;
  const denominator = rX * sY - rY * sX;
  if (Math.abs(denominator) < 1e-9) return null;

  const cax = cx - ax;
  const cay = cy - ay;
  const t = (cax * sY - cay * sX) / denominator;
  const u = (cax * rY - cay * rX) / denominator;
  const tolerance = 1e-7;
  if (t < -tolerance || t > 1 + tolerance || u < -tolerance || u > 1 + tolerance) return null;
  return { t: Math.max(0, Math.min(1, t)), u: Math.max(0, Math.min(1, u)) };
}

function nodeRoadIntersections(segments) {
  const maxSegments = Number(process.env.FALLBACK_INTERSECTION_MAX_SEGMENTS) || 60000;
  if (segments.length > maxSegments) return { skipped: true, intersectionCount: 0 };

  const cellSize = Number(process.env.FALLBACK_INTERSECTION_GRID_M) || 120;
  const grid = new Map();
  const seenPairs = new Set();
  let intersectionCount = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const minCellX = Math.floor(segment.bbox.minX / cellSize);
    const maxCellX = Math.floor(segment.bbox.maxX / cellSize);
    const minCellY = Math.floor(segment.bbox.minY / cellSize);
    const maxCellY = Math.floor(segment.bbox.maxY / cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const cellKey = `${cellX}:${cellY}`;
        const candidates = grid.get(cellKey) || [];
        for (const otherIndex of candidates) {
          const pairKey = otherIndex < index ? `${otherIndex}:${index}` : `${index}:${otherIndex}`;
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);
          const other = segments[otherIndex];
          if (
            segment.bbox.maxX < other.bbox.minX ||
            segment.bbox.minX > other.bbox.maxX ||
            segment.bbox.maxY < other.bbox.minY ||
            segment.bbox.minY > other.bbox.maxY
          ) continue;

          const intersection = segmentIntersection(segment, other);
          if (!intersection) continue;
          const beforeA = segment.splits.length;
          const beforeB = other.splits.length;
          addSplit(segment, intersection.t);
          addSplit(other, intersection.u);
          if (segment.splits.length > beforeA || other.splits.length > beforeB) intersectionCount += 1;
        }
        candidates.push(index);
        grid.set(cellKey, candidates);
      }
    }
  }

  return { skipped: false, intersectionCount };
}

function connectNearbyNodes(graph, project, request) {
  const toleranceMeters = Number(process.env.FALLBACK_TOPOLOGY_CONNECTOR_TOLERANCE_M) || 20;
  if (toleranceMeters <= 0) return 0;

  const modeSpeed = request.speedKmh || (request.mode === 'drive' ? 30 : request.mode === 'bike' ? 15 : 5);
  const cellSize = toleranceMeters;
  const nodes = Array.from(graph.nodes.values()).map((node) => ({
    ...node,
    xy: project.toXY(node.coord),
  }));
  const grid = new Map();
  let connectorCount = 0;
  const existingPairs = new Set(graph.edges.map((edge) => (edge.a < edge.b ? `${edge.a}:${edge.b}` : `${edge.b}:${edge.a}`)));

  for (const node of nodes) {
    const cellX = Math.floor(node.xy.x / cellSize);
    const cellY = Math.floor(node.xy.y / cellSize);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const candidates = grid.get(`${cellX + dx}:${cellY + dy}`) || [];
        for (const other of candidates) {
          const pairKey = node.key < other.key ? `${node.key}:${other.key}` : `${other.key}:${node.key}`;
          if (existingPairs.has(pairKey)) continue;
          const lengthMeters = Math.hypot(node.xy.x - other.xy.x, node.xy.y - other.xy.y);
          if (lengthMeters <= 0.5 || lengthMeters > toleranceMeters) continue;
          const cost = request.costType === 'time' ? lengthMeters / (modeSpeed * 1000 / 3600) : lengthMeters;
          const edge = {
            id: `topology-connector-${connectorCount}`,
            a: node.key,
            b: other.key,
            lengthMeters,
            cost,
            coordinates: [node.coord, other.coord],
            properties: { generated: true, road_type: 'topology-connector' },
          };
          graph.edges.push(edge);
          graph.nodes.get(node.key)?.edges.push({ to: other.key, edge });
          graph.nodes.get(other.key)?.edges.push({ to: node.key, edge });
          existingPairs.add(pairKey);
          connectorCount += 1;
        }
      }
    }
    const cellKey = `${cellX}:${cellY}`;
    const bucket = grid.get(cellKey) || [];
    bucket.push(node);
    grid.set(cellKey, bucket);
  }

  return connectorCount;
}

function annotateConnectedComponents(graph) {
  let componentId = 0;
  for (const node of graph.nodes.values()) {
    if (node.componentId !== undefined) continue;
    const stack = [node];
    const members = [];
    node.componentId = componentId;
    while (stack.length) {
      const current = stack.pop();
      members.push(current);
      for (const adjacent of current.edges) {
        const next = graph.nodes.get(adjacent.to);
        if (!next || next.componentId !== undefined) continue;
        next.componentId = componentId;
        stack.push(next);
      }
    }
    for (const member of members) member.componentSize = members.length;
    componentId += 1;
  }
}

function buildRoadGraph(roads, request) {
  const graph = { nodes: new Map(), edges: [], topology: {} };
  const modeSpeed = request.speedKmh || (request.mode === 'drive' ? 30 : request.mode === 'bike' ? 15 : 5);
  const project = projectionFor(roads);
  const segments = collectSegments(roads, project);
  densifySegments(segments);
  const topology = nodeRoadIntersections(segments);

  for (const segment of segments) {
    const splits = Array.from(new Set(segment.splits.map((value) => Number(value.toFixed(8)))))
      .sort((a, b) => a - b);
    for (let index = 0; index < splits.length - 1; index += 1) {
      const fromT = splits[index];
      const toT = splits[index + 1];
      if (toT - fromT <= 1e-8) continue;
      const start = segmentPoint(segment, fromT);
      const end = segmentPoint(segment, toT);
      if (!start || !end || (start[0] === end[0] && start[1] === end[1])) continue;
      const a = addNode(graph, start);
      const b = addNode(graph, end);
      const lengthMeters = turf.distance(turf.point(start), turf.point(end), { units: 'kilometers' }) * 1000;
      if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) continue;
      const cost = request.costType === 'time' ? lengthMeters / (modeSpeed * 1000 / 3600) : lengthMeters;
      const edge = {
        id: `${segment.id}-${index}`,
        a: a.key,
        b: b.key,
        lengthMeters,
        cost,
        coordinates: [start, end],
        properties: segment.properties || {},
      };
      graph.edges.push(edge);
      a.edges.push({ to: b.key, edge });
      b.edges.push({ to: a.key, edge });
    }
  }
  const nearNodeConnectorCount = connectNearbyNodes(graph, project, request);
  annotateConnectedComponents(graph);
  graph.topology = {
    inputFeatureCount: roads.features?.length || 0,
    inputSegmentCount: segments.length,
    nodedIntersectionCount: topology.intersectionCount,
    nearNodeConnectorCount,
    componentCount: new Set(Array.from(graph.nodes.values()).map((node) => node.componentId)).size,
    largestComponentSize: Math.max(0, ...Array.from(graph.nodes.values()).map((node) => node.componentSize || 0)),
    connectorToleranceMeters: Number(process.env.FALLBACK_TOPOLOGY_CONNECTOR_TOLERANCE_M) || 20,
    intersectionNodingSkipped: topology.skipped,
    nodeSpacingMeters: Number(process.env.FALLBACK_TOPOLOGY_NODE_SPACING_M) || 75,
  };
  return graph;
}

function connectorSearchDistance(request) {
  if (Number.isFinite(Number(process.env.FALLBACK_CONNECTED_SNAP_MAX_M))) {
    return Number(process.env.FALLBACK_CONNECTED_SNAP_MAX_M);
  }
  if (request.mode === 'drive') return 5000;
  if (request.mode === 'bike') return 2500;
  return 250;
}

function sourceComponentThreshold(request) {
  if (Number.isFinite(Number(process.env.FALLBACK_SOURCE_COMPONENT_MIN_SIZE))) {
    return Number(process.env.FALLBACK_SOURCE_COMPONENT_MIN_SIZE);
  }
  if (request.mode === 'drive') return 1200;
  if (request.mode === 'bike') return 800;
  return 50;
}

function candidateComponentThreshold() {
  if (Number.isFinite(Number(process.env.FALLBACK_TARGET_COMPONENT_MIN_SIZE))) {
    return Number(process.env.FALLBACK_TARGET_COMPONENT_MIN_SIZE);
  }
  return Number(process.env.FALLBACK_MIN_SNAP_COMPONENT_SIZE) || 50;
}

function virtualConnectorLimit(request) {
  if (Number.isFinite(Number(process.env.FALLBACK_VIRTUAL_CONNECTOR_MAX))) {
    return Number(process.env.FALLBACK_VIRTUAL_CONNECTOR_MAX);
  }
  if (request.mode === 'drive') return 80;
  if (request.mode === 'bike') return 35;
  return 1;
}

function addVirtualConnector(graph, fromKey, toKey, request, reason) {
  if (!fromKey || !toKey || fromKey === toKey) return null;
  const from = graph.nodes.get(fromKey);
  const to = graph.nodes.get(toKey);
  if (!from || !to) return null;
  const lengthMeters = turf.distance(turf.point(from.coord), turf.point(to.coord), { units: 'kilometers' }) * 1000;
  if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) return null;
  const modeSpeed = request.speedKmh || (request.mode === 'drive' ? 30 : request.mode === 'bike' ? 15 : 5);
  const cost = request.costType === 'time' ? lengthMeters / (modeSpeed * 1000 / 3600) : lengthMeters;
  const edge = {
    id: `virtual-snap-connector-${fromKey}-${toKey}`,
    a: fromKey,
    b: toKey,
    lengthMeters,
    cost,
    coordinates: [from.coord, to.coord],
    properties: { generated: true, road_type: 'virtual-snap-connector', reason },
  };
  graph.edges.push(edge);
  from.edges.push({ to: toKey, edge });
  to.edges.push({ to: fromKey, edge });
  return edge;
}

function nearestRoadNode(graph, facility, request) {
  const point = turf.point([facility.lng, facility.lat]);
  let nearest = null;
  const connectedByComponent = new Map();
  const connectedSnapMaxMeters = connectorSearchDistance(request);
  const minSourceComponentSize = sourceComponentThreshold(request);
  const minTargetComponentSize = candidateComponentThreshold();
  for (const node of graph.nodes.values()) {
    const distanceMeters = turf.distance(point, turf.point(node.coord), { units: 'kilometers' }) * 1000;
    const componentSize = node.componentSize || 0;
    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = { nodeKey: node.key, coord: node.coord, distanceMeters, componentSize };
    }
    if (distanceMeters <= connectedSnapMaxMeters && componentSize >= minTargetComponentSize) {
      const candidate = { nodeKey: node.key, coord: node.coord, distanceMeters, componentSize };
      const previous = connectedByComponent.get(node.componentId);
      if (!previous || candidate.distanceMeters < previous.distanceMeters) connectedByComponent.set(node.componentId, candidate);
    }
  }
  if (nearest && nearest.componentSize < minSourceComponentSize) {
    nearest.connectedCandidates = Array.from(connectedByComponent.values())
      .filter((candidate) => candidate.nodeKey !== nearest.nodeKey)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, virtualConnectorLimit(request));
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
  const reachedRoadEdges = reachableEdges.filter((edge) => !edge.properties?.generated);
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
    const bufferKm = modeBufferMeters(request.mode) / 1000;
    const corridorEdgeLimit = Number(process.env.FALLBACK_CORRIDOR_BUFFER_EDGE_LIMIT) || 1800;
    const shouldPreferReachHull = ['bike', 'drive'].includes(request.mode)
      && nodePoints.length >= (Number(process.env.FALLBACK_DRIVE_HULL_MIN_NODES) || 30);

    if (shouldPreferReachHull || reachableEdges.length > corridorEdgeLimit) {
      const maxEdgeKm = request.mode === 'drive'
        ? Math.max(bufferKm * 6, Math.min(request.distanceMeters / 1000 / 2, 2.5))
        : request.mode === 'bike'
          ? Math.max(bufferKm * 6, Math.min(request.distanceMeters / 1000 / 2, 1.5))
        : Math.max(bufferKm * 6, Math.min(request.distanceMeters / 1000 / 4, 0.45));
      const reachableNodeCollection = turf.featureCollection(nodePoints);
      const hull = turf.concave(reachableNodeCollection, { maxEdge: maxEdgeKm, units: 'kilometers' })
        || turf.convex(reachableNodeCollection);
      serviceArea = hull ? turf.buffer(hull, bufferKm, { units: 'kilometers' }) : null;
      if (serviceArea) {
        serviceArea.properties = {
          ...(serviceArea.properties || {}),
          method: 'network-reach-hull',
          optimizedForLargeNetwork: reachableEdges.length > corridorEdgeLimit,
          maxEdgeKm,
        };
      }
    }

    if (!serviceArea) {
      const reachableRoadGeometry = turf.multiLineString(
        reachableEdges.map((edge) => edge.coordinates),
        { sourceFeatureCount: reachableEdges.length },
      );
      serviceArea = turf.buffer(reachableRoadGeometry, bufferKm, { units: 'kilometers' });
      serviceArea.properties = {
        ...(serviceArea.properties || {}),
        method: 'network-road-corridor',
      };
    }
  }
  if (serviceArea) {
    serviceArea.properties = {
      ...(serviceArea.properties || {}),
      bufferMeters: modeBufferMeters(request.mode),
      reachableEdgeCount: reachableEdges.length,
    };
  }
  const areaSqKm = serviceArea ? turf.area(serviceArea) / 1000000 : 0;
  if (serviceArea) serviceArea.properties.areaSqKm = Number(areaSqKm.toFixed(3));

  return {
    reachableRoads: reachableLines,
    serviceArea: serviceArea ? turf.featureCollection([serviceArea]) : turf.featureCollection([]),
    networkNodes: turf.featureCollection(nodePoints),
    reachedRoadLengthKm: reachedRoadEdges.reduce((sum, edge) => sum + edge.lengthMeters, 0) / 1000,
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
  const canUseLiveArcgisRoads = process.env.ENABLE_ARCGIS_ROAD_FALLBACK !== 'false';
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
  let virtualConnectorCount = 0;
  for (const facility of request.facilities) {
    const nearest = nearestRoadNode(graph, facility, request);
    if (nearest && nearest.distanceMeters <= 1500) {
      for (const candidate of nearest.connectedCandidates || []) {
        const connector = addVirtualConnector(
          graph,
          nearest.nodeKey,
          candidate.nodeKey,
          request,
          'nearest-road-component-was-too-small',
        );
        if (connector) virtualConnectorCount += 1;
      }
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
    fallbackTopology: { ...graph.topology, virtualConnectorCount },
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
    fallbackTopology,
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
      fallbackTopology,
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
