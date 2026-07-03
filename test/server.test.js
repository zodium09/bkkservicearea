const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');

const { app, normalizeFacilities, normalizeTravelCost } = require('../server');

let server;
let baseUrl;

function request(path) {
  return fetch(`${baseUrl}${path}`).then(async (response) => ({
    status: response.status,
    body: await response.json(),
  }));
}

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

describe('normalizeTravelCost', () => {
  it('derives distance from time and speed by default', () => {
    assert.deepEqual(normalizeTravelCost({ travelMinutes: 15, speedKmh: 6 }), {
      travelMinutes: 15,
      speedKmh: 6,
      distanceMeters: 1500,
    });
  });

  it('uses an explicit positive distance override when provided', () => {
    assert.equal(normalizeTravelCost({ travelMinutes: 15, speedKmh: 6, distanceMeters: 2500 }).distanceMeters, 2500);
  });
});

describe('normalizeFacilities', () => {
  it('drops facilities with invalid coordinates', () => {
    const facilities = normalizeFacilities([
      { name: 'Valid', lat: 13.75, lng: 100.5 },
      { name: 'Invalid', lat: 'nope', lng: 100.5 },
    ]);

    assert.equal(facilities.length, 1);
    assert.equal(facilities[0].name, 'Valid');
  });
});

describe('processed layer API', () => {
  it('validates bbox input', async () => {
    const response = await request('/api/processed-layers/7/query?bbox=bad');

    assert.equal(response.status, 400);
    assert.match(response.body.error, /bbox/);
  });

  it('returns a capped processed GeoJSON collection', async () => {
    const response = await request('/api/processed-layers/7/query?bbox=100.48,13.73,100.53,13.78&maxFeatures=5');

    assert.equal(response.status, 200);
    assert.equal(response.body.type, 'FeatureCollection');
    assert.equal(response.body.source, 'qgis-processed');
    assert.ok(response.body.features.length <= 5);
    assert.equal(response.body.returned, response.body.features.length);
  });
});
