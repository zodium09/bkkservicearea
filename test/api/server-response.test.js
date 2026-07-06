const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../../backend/server');

function listen(app) {
  const server = app.listen(0);
  return new Promise((resolve) => {
    server.once('listening', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('invalid JSON requests return JSON error responses', async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(body.code, 'INVALID_JSON');
  } finally {
    await close(server);
  }
});

test('api responds to local Vite CORS preflight', async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/analyze`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://127.0.0.1:5173',
        'Access-Control-Request-Method': 'POST',
      },
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
  } finally {
    await close(server);
  }
});
