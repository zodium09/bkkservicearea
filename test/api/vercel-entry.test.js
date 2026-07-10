const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

const vercelHandler = require('../../api/index');

test('Vercel API entry forwards rewritten paths to the Express router', async (t) => {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    req.query = Object.fromEntries(url.searchParams.entries());
    return vercelHandler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/index?path=traffic/status`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.configured, false);
  assert.equal(body.available, false);
  assert.match(body.viewerUrl, /^https:\/\//);

  const previousArcgisFallback = process.env.ENABLE_ARCGIS_ROAD_FALLBACK;
  process.env.ENABLE_ARCGIS_ROAD_FALLBACK = 'false';
  try {
    const analysisResponse = await fetch(`http://127.0.0.1:${port}/api/index?path=analyze/contours`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        facilities: [{ id: 'vercel-test', lat: 13.7563, lng: 100.5018 }],
        mode: 'drive',
        costType: 'time',
        limit: 900,
        contoursMinutes: [10, 15, 30],
      }),
    });
    const analysis = await analysisResponse.json();

    assert.equal(analysisResponse.status, 200);
    assert.deepEqual(analysis.contours.map((item) => item.minutes), [10, 15, 30]);
    assert.ok(analysis.contours.every((item) => item.result.serviceArea.type === 'FeatureCollection'));
  } finally {
    if (previousArcgisFallback === undefined) delete process.env.ENABLE_ARCGIS_ROAD_FALLBACK;
    else process.env.ENABLE_ARCGIS_ROAD_FALLBACK = previousArcgisFallback;
  }
});
