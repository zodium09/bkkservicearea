const express = require('express');
const fs = require('fs');
const path = require('path');
const network = require('../services/network.service');
const population = require('../services/population.service');

const router = express.Router();

const ACCESSIBILITY_CATEGORIES = [
  'bkk_hospitals', 'gov_hospitals', 'private_hospitals', 'health_centers',
  'schools_bkk', 'schools_obec', 'schools_private',
  'transit_train', 'transit_boat', 'transit_bus',
  'fire_stations', 'police_stations', 'communities',
];

router.get('/basemap/metadata', async (_req, res) => {
  try {
    const upstream = await network.fetchArcgis(`${network.BASEMAP_PATH}?f=pjson`);
    res.type('json').send(upstream.body);
  } catch (error) {
    res.status(502).json({ error: 'Unable to load basemap metadata', detail: error.message });
  }
});

router.get('/layers/catalog', async (_req, res) => {
  try {
    const upstream = await network.fetchArcgis(`${network.BASEMAP_PATH}?f=pjson`);
    const metadata = JSON.parse(upstream.body.toString('utf8'));
    res.json(network.buildCatalogFromMetadata(metadata, false));
  } catch (error) {
    res.status(502).json({ error: 'Unable to load BMA layer catalog', detail: error.message });
  }
});

router.get('/processed-layers/catalog', async (_req, res) => {
  try {
    const catalog = network.readProcessedCatalog();
    if (catalog) return res.json(catalog);
    const upstream = await network.fetchArcgis(`${network.BASEMAP_PATH}?f=pjson`);
    const metadata = JSON.parse(upstream.body.toString('utf8'));
    return res.json({
      ...network.buildCatalogFromMetadata(metadata, false),
      note: 'Run npm run prepare:data to preprocess BMA layers with QGIS.',
    });
  } catch (error) {
    return res.status(502).json({ error: 'Unable to load processed layer catalog', detail: error.message });
  }
});

router.get('/processed-layers/:id/query', (req, res) => {
  const layerId = Number(req.params.id);
  const bbox = String(req.query.bbox || '').split(',').map(Number);
  if (!Number.isInteger(layerId) || layerId < 0 || layerId > 99) return res.status(400).json({ error: 'Invalid layer id.' });
  if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
    return res.status(400).json({ error: 'bbox must be xmin,ymin,xmax,ymax in EPSG:4326.' });
  }
  const processedPath = network.processedLayerPath(layerId);
  if (!fs.existsSync(processedPath)) {
    return res.status(404).json({ error: 'Processed layer is not available. Run npm run prepare:data first.' });
  }
  try {
    const maxFeatures = Math.min(Math.max(Number(req.query.maxFeatures) || 4000, 1), 12000);
    const collection = network.loadProcessedLayer(layerId);
    const matching = (collection.features || []).filter((feature) => network.featureIntersectsBbox(feature, bbox));
    res.json({
      type: 'FeatureCollection',
      source: 'qgis-processed',
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

router.get('/layers/:id/query', async (req, res) => {
  const layerId = Number(req.params.id);
  const bbox = String(req.query.bbox || '').split(',').map(Number);
  if (!Number.isInteger(layerId) || layerId < 0 || layerId > 99) return res.status(400).json({ error: 'Invalid layer id.' });
  if (bbox.length !== 4 || bbox.some((value) => !Number.isFinite(value))) {
    return res.status(400).json({ error: 'bbox must be xmin,ymin,xmax,ymax in EPSG:4326.' });
  }
  try {
    const params = new URLSearchParams({
      f: 'geojson',
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      inSR: '4326',
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects',
      geometry: bbox.join(','),
      resultRecordCount: String(Math.min(Math.max(Number(req.query.maxFeatures) || 4000, 1), 12000)),
    });
    const upstream = await network.fetchArcgis(`${network.BASEMAP_PATH}/${layerId}/query?${params.toString()}`);
    res.status(upstream.status);
    res.type('json').send(upstream.body);
  } catch (error) {
    res.status(502).json({ error: 'Unable to query BMA layer', detail: error.message });
  }
});

router.get('/accessibility/stats', (_req, res) => {
  const statsPath = path.join(network.ROOT, 'data', 'processed', 'accessibility', 'stats.json');
  if (!fs.existsSync(statsPath)) return res.status(404).json({ error: 'Accessibility stats not precomputed yet.' });
  try {
    res.json(JSON.parse(fs.readFileSync(statsPath, 'utf8')));
  } catch (error) {
    res.status(500).json({ error: 'Failed to read accessibility stats', detail: error.message });
  }
});

router.get('/population/districts', (_req, res) => {
  const data = population.publicDataset();
  if (!data) return res.status(404).json({ error: 'Population dataset is not available.' });
  return res.json(data);
});

router.get('/data/catalog', (_req, res) => {
  const catalogPath = path.join(network.ROOT, 'data', 'catalog.json');
  if (!fs.existsSync(catalogPath)) return res.status(404).json({ error: 'Data catalog is not available.' });
  try {
    return res.json(JSON.parse(fs.readFileSync(catalogPath, 'utf8')));
  } catch (error) {
    return res.status(500).json({ error: 'Failed to read data catalog', detail: error.message });
  }
});

router.get('/accessibility/layer/:category/:type', (req, res) => {
  const { category, type } = req.params;
  if (!ACCESSIBILITY_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
  if (!['area-walk', 'area-cycle', 'area-drive', 'pois'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  const layerPath = path.join(network.ROOT, 'data', 'processed', 'accessibility', `${category}-${type}.geojson`);
  if (!fs.existsSync(layerPath)) return res.status(404).json({ error: `Accessibility layer ${category}-${type} not precomputed yet.` });
  try {
    res.json(JSON.parse(fs.readFileSync(layerPath, 'utf8')));
  } catch (error) {
    res.status(500).json({ error: 'Failed to read accessibility layer', detail: error.message });
  }
});

router.get('/districts', async (_req, res) => {
  try {
    const districts = await network.loadDistricts();
    if (!districts) return res.status(404).json({ error: 'Districts layer is not available.' });
    return res.json(districts);
  } catch (error) {
    return res.status(500).json({ error: 'Unable to load districts', detail: error.message });
  }
});

module.exports = router;
