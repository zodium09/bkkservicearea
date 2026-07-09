const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const turf = require('@turf/turf');

const ROOT = path.join(__dirname, '..', '..');
const ARCGIS_ORIGIN = 'https://citymap.bangkok.go.th';
const BASEMAP_PATH = '/citymap/rest/services/Basemap_Service/Basemap1000_32647_H/MapServer';
const ROAD_LAYER_ID = 7;
const PROCESSED_LAYERS_DIR = path.join(ROOT, 'data', 'processed', 'bma-layers');
const PROCESSED_CATALOG_PATH = path.join(PROCESSED_LAYERS_DIR, 'catalog.json');
const processedLayerCache = new Map();
let qgisProcessCache = null;

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

function processedLayerPath(layerId) {
  const catalog = readProcessedCatalog();
  const catalogLayer = catalog?.layers?.find((layer) => layer.id === layerId);
  return catalogLayer?.path
    ? path.join(ROOT, catalogLayer.path)
    : path.join(PROCESSED_LAYERS_DIR, `layer-${layerId}.geojson`);
}

function hasProcessedLayer(layerId) {
  return fs.existsSync(processedLayerPath(layerId));
}

function isProcessedLayerSmallEnough(layerId, maxBytes) {
  const layerPath = processedLayerPath(layerId);
  if (!fs.existsSync(layerPath)) return false;
  return fs.statSync(layerPath).size <= maxBytes;
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

function queryProcessedLayerByBbox(layerId, bbox, maxFeatures = 50000) {
  const collection = loadProcessedLayer(layerId);
  if (!collection) return null;
  const features = (collection.features || []).filter((feature) => featureIntersectsBbox(feature, bbox)).slice(0, maxFeatures);
  return turf.featureCollection(features);
}

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs).unref?.();
  return controller.signal;
}

async function fetchArcgis(pathAndQuery, options = {}) {
  const upstream = `${ARCGIS_ORIGIN}${pathAndQuery}`;
  const timeoutMs = Number(options.timeoutMs) || Number(process.env.ARCGIS_TIMEOUT_MS) || 12000;
  const response = await fetch(upstream, {
    signal: timeoutSignal(timeoutMs),
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

function run(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const isBatch = /\.(bat|cmd)$/i.test(command);
    const executable = isBatch ? process.env.ComSpec || 'cmd.exe' : command;
    const executableArgs = isBatch ? ['/c', command, ...args] : args;
    execFile(executable, executableArgs, { timeout: Number(process.env.QGIS_PROBE_TIMEOUT_MS) || 2500, windowsHide: true, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, error, stdout, stderr });
    });
  });
}

async function findQgisProcess() {
  if (qgisProcessCache && Date.now() - qgisProcessCache.checkedAt < 5 * 60 * 1000) {
    return qgisProcessCache.result;
  }
  const remember = (result) => {
    qgisProcessCache = { checkedAt: Date.now(), result };
    return result;
  };
  if (process.env.QGIS_PROCESS) {
    const probe = await run(process.env.QGIS_PROCESS, ['--version']);
    return remember({ found: probe.ok, command: process.env.QGIS_PROCESS, version: probe.stdout.trim() || probe.stderr.trim() });
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
    if (version.ok) return remember({ found: true, command: candidate, version: version.stdout.trim() || version.stderr.trim() });
  }
  return remember({ found: false, command: null, version: null });
}

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
  const maxSearchKm = Number(process.env.FALLBACK_ROAD_SEARCH_MAX_KM) || 8.5;
  const searchKm = Math.min(Math.max(distanceMeters / 1000 + 0.75, 0.8), maxSearchKm);
  const searchArea = turf.buffer(turf.point([facility.lng, facility.lat]), searchKm, { units: 'kilometers' });
  const [xmin, ymin, xmax, ymax] = turf.bbox(searchArea);
  const maxFeatures = Number(process.env.FALLBACK_ROAD_MAX_FEATURES) || 10000;
  const processed = queryProcessedLayerByBbox(ROAD_LAYER_ID, [xmin, ymin, xmax, ymax], maxFeatures);
  if (processed) return processed;

  const features = [];
  const pageSize = Number(process.env.ARCGIS_ROAD_PAGE_SIZE) || 750;
  const maxPages = Number(process.env.ARCGIS_ROAD_MAX_PAGES) || Math.ceil(maxFeatures / pageSize);
  for (let pageIndex = 0; pageIndex < maxPages && features.length < maxFeatures; pageIndex += 1) {
    const offset = pageIndex * pageSize;
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
    let upstream;
    try {
      upstream = await fetchArcgis(`${BASEMAP_PATH}/${ROAD_LAYER_ID}/query?${params.toString()}`, { timeoutMs: Number(process.env.ARCGIS_ROAD_TIMEOUT_MS) || 9000 });
    } catch (error) {
      if (features.length) break;
      throw error;
    }
    if (!upstream.ok) break;
    const page = JSON.parse(upstream.body.toString('utf8'));
    features.push(...(page.features || []).slice(0, maxFeatures - features.length));
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

module.exports = {
  ROOT,
  ARCGIS_ORIGIN,
  BASEMAP_PATH,
  ROAD_LAYER_ID,
  buildCatalogFromMetadata,
  readProcessedCatalog,
  processedLayerPath,
  hasProcessedLayer,
  isProcessedLayerSmallEnough,
  loadProcessedLayer,
  queryProcessedLayerByBbox,
  fetchArcgis,
  findQgisProcess,
  loadDistricts,
  loadRoadsForFacilities,
  featureIntersectsBbox,
};
