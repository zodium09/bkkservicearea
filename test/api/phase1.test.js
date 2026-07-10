const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const app = require('../../backend/server');
const db = require('../../backend/db/pool');
const routing = require('../../backend/services/routing.service');
const population = require('../../backend/services/population.service');
const traffic = require('../../backend/services/traffic.service');

function listen() {
  const server = app.listen(0);
  return new Promise((resolve) => server.once('listening', () => resolve(server)));
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test('population estimator returns the official total for a complete district polygon', () => {
  const districts = JSON.parse(fs.readFileSync('./data/processed/bma-layers/layer-13.geojson', 'utf8'));
  const phayaThai = districts.features.find((feature) => feature.properties?.DISTRICT_N === 'พญาไท');
  const result = population.enrichDistrict(phayaThai, phayaThai);
  assert.equal(result.populationTotal, 64037);
  assert.equal(result.populationReachedEstimate, 64037);
  assert.equal(result.overlapRatio, 1);
});

test('data catalog and traffic status endpoints remain available without a licensed live feed', async () => {
  const originalUrl = process.env.TRAFFIC_GEOJSON_URL;
  delete process.env.TRAFFIC_GEOJSON_URL;
  traffic.resetCache();
  const server = await listen();
  try {
    const { port } = server.address();
    const [catalogResponse, trafficResponse] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/api/data/catalog`),
      fetch(`http://127.0.0.1:${port}/api/traffic/status`),
    ]);
    const catalog = await catalogResponse.json();
    const trafficStatus = await trafficResponse.json();
    assert.equal(catalogResponse.status, 200);
    assert.ok(catalog.sources.some((source) => source.id === 'bma-population-district-2023'));
    assert.equal(trafficResponse.status, 200);
    assert.equal(trafficStatus.available, false);
    assert.match(trafficStatus.viewerUrl, /bangkok\.go\.th/);
  } finally {
    if (originalUrl === undefined) delete process.env.TRAFFIC_GEOJSON_URL;
    else process.env.TRAFFIC_GEOJSON_URL = originalUrl;
    traffic.resetCache();
    await close(server);
  }
});

test('contour endpoint calculates the standard 10, 15 and 30 minute bands', async () => {
  const originalHealth = db.checkHealth;
  const originalFallback = routing.analyzeFallback;
  const receivedLimits = [];
  db.checkHealth = async () => ({ connected: false, postgis: false, pgrouting: false });
  routing.analyzeFallback = async (request) => {
    receivedLimits.push(request.limit);
    return {
      engine: 'test',
      metrics: { serviceAreaSqKm: request.limit / 600 },
      serviceArea: { type: 'FeatureCollection', features: [] },
      reachableRoads: { type: 'FeatureCollection', features: [] },
      intersectingDistricts: [],
    };
  };

  const server = await listen();
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/analyze/contours`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 13.7563, lng: 100.5018, mode: 'walk' }),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.contours.map((contour) => contour.minutes), [10, 15, 30]);
    assert.deepEqual(receivedLimits, [600, 900, 1800]);
  } finally {
    db.checkHealth = originalHealth;
    routing.analyzeFallback = originalFallback;
    await close(server);
  }
});
