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

test('fallback analysis uses road network when road features are available', async () => {
  const originalLoadRoads = network.loadRoadsForFacilities;
  const originalLoadDistricts = network.loadDistricts;
  const originalFindQgis = network.findQgisProcess;

  network.loadRoadsForFacilities = async () => ({
    type: 'FeatureCollection',
    features: [
      turfLine([[100.5000, 13.7500], [100.5050, 13.7500]], 1),
      turfLine([[100.5050, 13.7500], [100.5100, 13.7500]], 2),
      turfLine([[100.5050, 13.7450], [100.5050, 13.7500], [100.5050, 13.7550]], 3),
    ],
  });
  network.loadDistricts = async () => ({ type: 'FeatureCollection', features: [] });
  network.findQgisProcess = async () => ({ found: false, command: null, version: null });

  try {
    const request = normalizeAnalyzeRequest({
      lat: 13.7500,
      lng: 100.5050,
      mode: 'walk',
      costType: 'time',
      limit: 900,
    });
    const result = await routing.analyzeFallback(request);

    assert.equal(result.engine, 'js-dijkstra-fallback');
    assert.equal(result.analysisQuality, 'network');
    assert.equal(result.reachableRoads.type, 'FeatureCollection');
    assert.ok(result.reachableRoads.features.length > 0);
    assert.ok(result.metrics.reachedRoadLengthKm > 0);
    assert.equal(result.serviceArea.features[0].properties.method, 'network-road-corridor');
  } finally {
    network.loadRoadsForFacilities = originalLoadRoads;
    network.loadDistricts = originalLoadDistricts;
    network.findQgisProcess = originalFindQgis;
  }
});

test('fallback analysis connects roads that geometrically cross without shared vertices', async () => {
  const originalLoadRoads = network.loadRoadsForFacilities;
  const originalLoadDistricts = network.loadDistricts;
  const originalFindQgis = network.findQgisProcess;

  network.loadRoadsForFacilities = async () => ({
    type: 'FeatureCollection',
    features: [
      turfLine([[100.5000, 13.7500], [100.5100, 13.7500]], 10),
      turfLine([[100.5050, 13.7450], [100.5050, 13.7550]], 11),
    ],
  });
  network.loadDistricts = async () => ({ type: 'FeatureCollection', features: [] });
  network.findQgisProcess = async () => ({ found: false, command: null, version: null });

  try {
    const request = normalizeAnalyzeRequest({
      lat: 13.7500,
      lng: 100.5000,
      mode: 'walk',
      costType: 'time',
      limit: 900,
    });
    const result = await routing.analyzeFallback(request);

    assert.equal(result.engine, 'js-dijkstra-fallback');
    assert.ok(result.metrics.networkNodesReached > 4);
    assert.ok(result.metrics.reachedRoadLengthKm > 1.5);
    assert.ok(result.metrics.fallbackTopology.nodedIntersectionCount >= 1);
  } finally {
    network.loadRoadsForFacilities = originalLoadRoads;
    network.loadDistricts = originalLoadDistricts;
    network.findQgisProcess = originalFindQgis;
  }
});

test('bike fallback can leave a medium disconnected source component', async () => {
  const originalLoadRoads = network.loadRoadsForFacilities;
  const originalLoadDistricts = network.loadDistricts;
  const originalFindQgis = network.findQgisProcess;
  const originalEnv = {
    FALLBACK_SOURCE_COMPONENT_MIN_SIZE: process.env.FALLBACK_SOURCE_COMPONENT_MIN_SIZE,
    FALLBACK_TARGET_COMPONENT_MIN_SIZE: process.env.FALLBACK_TARGET_COMPONENT_MIN_SIZE,
    FALLBACK_CONNECTED_SNAP_MAX_M: process.env.FALLBACK_CONNECTED_SNAP_MAX_M,
    FALLBACK_VIRTUAL_CONNECTOR_MAX: process.env.FALLBACK_VIRTUAL_CONNECTOR_MAX,
  };
  delete process.env.FALLBACK_SOURCE_COMPONENT_MIN_SIZE;
  delete process.env.FALLBACK_TARGET_COMPONENT_MIN_SIZE;
  delete process.env.FALLBACK_CONNECTED_SNAP_MAX_M;
  delete process.env.FALLBACK_VIRTUAL_CONNECTOR_MAX;

  const localStub = Array.from({ length: 61 }, (_, index) => [100.5000 + index * 0.0001, 13.7500]);
  const nearbyNetwork = Array.from({ length: 81 }, (_, index) => [100.5000 + index * 0.00025, 13.7600]);

  network.loadRoadsForFacilities = async () => ({
    type: 'FeatureCollection',
    features: [
      turfLine(localStub, 20),
      turfLine(nearbyNetwork, 21),
    ],
  });
  network.loadDistricts = async () => ({ type: 'FeatureCollection', features: [] });
  network.findQgisProcess = async () => ({ found: false, command: null, version: null });

  try {
    const baseRequest = {
      lat: 13.7500,
      lng: 100.5000,
      costType: 'time',
      limit: 900,
    };
    const walk = await routing.analyzeFallback(normalizeAnalyzeRequest({ ...baseRequest, mode: 'walk' }));
    const bike = await routing.analyzeFallback(normalizeAnalyzeRequest({ ...baseRequest, mode: 'bike' }));

    assert.equal(walk.engine, 'js-dijkstra-fallback');
    assert.equal(bike.engine, 'js-dijkstra-fallback');
    assert.equal(walk.metrics.fallbackTopology.virtualConnectorCount, 0);
    assert.ok(bike.metrics.fallbackTopology.virtualConnectorCount > 0);
    assert.ok(bike.metrics.reachedRoadLengthKm > walk.metrics.reachedRoadLengthKm + 1);
  } finally {
    network.loadRoadsForFacilities = originalLoadRoads;
    network.loadDistricts = originalLoadDistricts;
    network.findQgisProcess = originalFindQgis;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

function turfLine(coordinates, id) {
  return {
    type: 'Feature',
    id,
    properties: { OBJECTID: id, ROAD_NAME_T: `ถนนทดสอบ ${id}` },
    geometry: { type: 'LineString', coordinates },
  };
}
