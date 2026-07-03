const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw', 'bma-layers');
const PROCESSED_DIR = path.join(ROOT, 'data', 'processed', 'bma-layers');
const ARCGIS_ORIGIN = 'https://citymap.bangkok.go.th';
const BASEMAP_PATH = '/citymap/rest/services/Basemap_Service/Basemap1000_32647_H/MapServer';

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

const DEFAULT_LAYER_IDS = Object.keys(LAYER_DIMENSIONS).map(Number);
const REQUEST_PAGE_SIZE = Math.min(Math.max(Number(process.env.BMA_PAGE_SIZE) || 2000, 100), 2000);
const MAX_FEATURES_PER_LAYER = Number(process.env.BMA_MAX_FEATURES || 0);
const DEFAULT_LAYER_LIMITS = {
  0: 10000,
  4: 20000,
  5: 20000,
  8: 50000,
  9: 50000,
};
const layerLimits = {
  ...DEFAULT_LAYER_LIMITS,
  ...(process.env.BMA_LAYER_LIMITS || '').split(',').reduce((limits, pair) => {
    const [id, limit] = pair.split(':').map((value) => Number(value.trim()));
    if (Number.isInteger(id) && Number.isFinite(limit)) limits[id] = limit;
    return limits;
  }, {}),
};
const layerIds = (process.env.BMA_LAYER_IDS || DEFAULT_LAYER_IDS.join(','))
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value));

process.stdout.on('error', () => {});

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function run(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const isBatch = /\.(bat|cmd)$/i.test(command);
    const executable = isBatch ? process.env.ComSpec || 'cmd.exe' : command;
    const executableArgs = isBatch ? ['/c', command, ...args] : args;
    execFile(executable, executableArgs, { timeout: 10 * 60 * 1000, windowsHide: true, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, error, stdout, stderr });
    });
  });
}

async function findQgisProcess() {
  if (process.env.QGIS_PROCESS) {
    const probe = await run(process.env.QGIS_PROCESS, ['--version']);
    return { found: probe.ok, command: process.env.QGIS_PROCESS, version: probe.stdout.trim() || probe.stderr.trim() };
  }

  const candidates = [];
  const where = await run('where.exe', ['qgis_process']);
  const command = where.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Bangkok-Service-Area-Analysis/1.0',
      accept: 'application/json, */*',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function fetchServiceMetadata() {
  return fetchJson(`${ARCGIS_ORIGIN}${BASEMAP_PATH}?f=pjson`);
}

async function fetchLayerMetadata(layerId) {
  return fetchJson(`${ARCGIS_ORIGIN}${BASEMAP_PATH}/${layerId}?f=pjson`);
}

async function downloadLayer(layer) {
  const features = [];
  let exceededTransferLimit = false;
  let truncated = false;
  const layerLimit = MAX_FEATURES_PER_LAYER || layerLimits[layer.id] || 0;

  for (let offset = 0; ; offset += REQUEST_PAGE_SIZE) {
    const remaining = layerLimit ? layerLimit - features.length : REQUEST_PAGE_SIZE;
    if (layerLimit && remaining <= 0) {
      truncated = true;
      break;
    }

    const params = new URLSearchParams({
      f: 'geojson',
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      resultOffset: String(offset),
      resultRecordCount: String(Math.min(REQUEST_PAGE_SIZE, remaining)),
      orderByFields: 'OBJECTID',
    });
    const page = await fetchJson(`${ARCGIS_ORIGIN}${BASEMAP_PATH}/${layer.id}/query?${params.toString()}`);
    const pageFeatures = page.features || [];
    features.push(...pageFeatures);
    exceededTransferLimit = Boolean(page.exceededTransferLimit);
    if (!process.stdout.destroyed) {
      process.stdout.write(`\rLayer ${layer.id}: ${features.length.toLocaleString()} features`);
    }

    if (!page.exceededTransferLimit && pageFeatures.length < REQUEST_PAGE_SIZE) break;
    if (pageFeatures.length === 0) break;
  }

  if (!process.stdout.destroyed) process.stdout.write('\n');
  return {
    type: 'FeatureCollection',
    layerId: layer.id,
    name: layer.name,
    geometryType: layer.geometryType,
    source: `${ARCGIS_ORIGIN}${BASEMAP_PATH}/${layer.id}`,
    exceededTransferLimit,
    truncated,
    features,
  };
}

async function qgisFixGeometries(qgis, inputPath, outputPath) {
  if (!qgis.found) {
    fs.copyFileSync(inputPath, outputPath);
    return { processed: false, note: 'qgis_process not found; copied raw GeoJSON.' };
  }

  const result = await run(qgis.command, [
    'run',
    'native:fixgeometries',
    '--',
    `INPUT=${inputPath}`,
    'METHOD=1',
    `OUTPUT=${outputPath}`,
  ]);

  if (result.ok && fs.existsSync(outputPath)) {
    return { processed: true, note: 'native:fixgeometries completed.' };
  }

  fs.copyFileSync(inputPath, outputPath);
  return {
    processed: false,
    note: 'QGIS fixgeometries failed; copied raw GeoJSON.',
    stderr: result.stderr.trim(),
  };
}

async function main() {
  ensureDir(RAW_DIR);
  ensureDir(PROCESSED_DIR);

  const qgis = await findQgisProcess();
  const serviceMetadata = await fetchServiceMetadata();
  const serviceLayers = new Map((serviceMetadata.layers || []).map((layer) => [layer.id, layer]));
  const catalogLayers = [];

  console.log(qgis.found ? `Using ${qgis.version.split(/\r?\n/)[0]}` : 'qgis_process not found; preparing raw GeoJSON only.');

  for (const layerId of layerIds) {
    const serviceLayer = serviceLayers.get(layerId);
    if (!serviceLayer) {
      console.warn(`Skip layer ${layerId}: not found in service metadata.`);
      continue;
    }

    console.log(`\nPreparing layer ${layerId}: ${serviceLayer.name}`);
    const layerMeta = await fetchLayerMetadata(layerId);
    const collection = await downloadLayer({
      ...serviceLayer,
      geometryType: layerMeta.geometryType || serviceLayer.geometryType,
    });

    const rawPath = path.join(RAW_DIR, `layer-${layerId}.geojson`);
    const processedPath = path.join(PROCESSED_DIR, `layer-${layerId}.geojson`);
    fs.writeFileSync(rawPath, JSON.stringify(collection));

    const qgisResult = await qgisFixGeometries(qgis, rawPath, processedPath);
    const stats = JSON.parse(fs.readFileSync(processedPath, 'utf8'));

    catalogLayers.push({
      id: layerId,
      name: serviceLayer.name,
      type: serviceLayer.type,
      geometryType: layerMeta.geometryType || serviceLayer.geometryType,
      minScale: serviceLayer.minScale,
      maxScale: serviceLayer.maxScale,
      dimension: LAYER_DIMENSIONS[layerId] || 'อื่นๆ',
      featureCount: stats.features?.length || 0,
      truncated: collection.truncated,
      rawPath: path.relative(ROOT, rawPath).replace(/\\/g, '/'),
      path: path.relative(ROOT, processedPath).replace(/\\/g, '/'),
      qgisProcessed: qgisResult.processed,
      qgisNote: qgisResult.note,
    });
  }

  const dimensions = Array.from(new Set(catalogLayers.map((layer) => layer.dimension))).map((dimension) => ({
    name: dimension,
    layers: catalogLayers.filter((layer) => layer.dimension === dimension),
  }));

  const catalog = {
    prepared: true,
    generatedAt: new Date().toISOString(),
    source: `${ARCGIS_ORIGIN}${BASEMAP_PATH}`,
    spatialReference: serviceMetadata.spatialReference,
    maxRecordCount: serviceMetadata.maxRecordCount,
    qgis,
    layers: catalogLayers,
    dimensions,
  };

  fs.writeFileSync(path.join(PROCESSED_DIR, 'catalog.json'), JSON.stringify(catalog, null, 2));
  console.log(`\nPrepared ${catalogLayers.length} layers in ${path.relative(ROOT, PROCESSED_DIR)}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
