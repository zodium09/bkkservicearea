const test = require('node:test');
const assert = require('node:assert/strict');
const routing = require('../../backend/services/routing.service');
const network = require('../../backend/services/network.service');
const { normalizeAnalyzeRequest } = require('../../backend/utils/validation');

test('fallback analysis returns an approximate GeoJSON service area when roads are unavailable', async () => {
  const originalLoadRoads = network.loadRoadsForFacilities;
  const originalLoadDistricts = network.loadDistricts;
  const originalFindQgis = network.findQgisProcess;

  network.loadRoadsForFacilities = async () => {
    throw new Error('test road source unavailable');
  };
  network.loadDistricts = async () => ({ type: 'FeatureCollection', features: [] });
  network.findQgisProcess = async () => ({ found: false, command: null, version: null });

  try {
    const request = normalizeAnalyzeRequest({
      lat: 13.7563,
      lng: 100.5018,
      mode: 'walk',
      costType: 'time',
      limit: 900,
    });
    const result = await routing.analyzeFallback(request);

    assert.equal(result.engine, 'straight-line-fallback');
    assert.equal(result.analysisQuality, 'approximate');
    assert.equal(result.serviceArea.type, 'FeatureCollection');
    assert.equal(result.serviceArea.features.length, 1);
    assert.equal(result.reachableRoads.type, 'FeatureCollection');
    assert.equal(result.reachableRoads.features.length, 0);
    assert.ok(result.metrics.serviceAreaSqKm > 0);
  } finally {
    network.loadRoadsForFacilities = originalLoadRoads;
    network.loadDistricts = originalLoadDistricts;
    network.findQgisProcess = originalFindQgis;
  }
});
