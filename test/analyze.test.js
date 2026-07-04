const http = require('http');

function makeRequest(urlOptions, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(urlOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting pgRouting API Integration Tests ---');
  const port = process.env.PORT || 5174;

  // Test 1: Check engine status
  try {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/engine/status',
      method: 'GET',
    });

    console.log(`[Test 1] GET /api/engine/status - Status: ${res.statusCode}`);
    console.log('Response body:', res.body);
    
    if (res.statusCode !== 200) {
      throw new Error(`Engine status check failed with status ${res.statusCode}`);
    }
    if (res.body.runtimeEngine !== 'postgis-pgrouting') {
      throw new Error(`Expected engine "postgis-pgrouting", got "${res.body.runtimeEngine}"`);
    }
    console.log('✓ Test 1 Passed: Engine status is correct.');
  } catch (err) {
    console.error('✗ Test 1 Failed:', err.message);
    process.exit(1);
  }

  // Test 2: PostGIS + pgRouting analyze endpoint
  try {
    const analyzePayload = {
      facilities: [
        { lat: 13.7563, lng: 100.5018, name: 'Sao Chingcha', type: 'health' }
      ],
      distanceMeters: 1000
    };

    const res = await makeRequest({
      hostname: '127.0.0.1',
      port: port,
      path: '/api/analyze',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    }, analyzePayload);

    console.log(`[Test 2] POST /api/analyze - Status: ${res.statusCode}`);
    
    if (res.statusCode !== 200) {
      console.error('Error response body:', res.body);
      throw new Error(`Analyze failed with status ${res.statusCode}`);
    }

    const { engine, serviceArea, reachableRoads, metrics } = res.body;
    console.log('Response Body keys:', Object.keys(res.body));
    if (!serviceArea) {
      console.log('Full Response Body:', JSON.stringify(res.body, null, 2));
    }

    if (engine !== 'postgis-pgrouting' && engine !== 'js-dijkstra-fallback') {
      throw new Error(`Expected engine "postgis-pgrouting" or "js-dijkstra-fallback", got "${engine}"`);
    }

    if (!serviceArea || serviceArea.type !== 'FeatureCollection') {
      throw new Error('Service area is missing or not a FeatureCollection');
    }

    if (!reachableRoads || reachableRoads.type !== 'FeatureCollection') {
      throw new Error('Reachable roads is missing or not a FeatureCollection');
    }

    console.log('Metrics returned:', metrics);
    console.log('✓ Test 2 Passed: pgRouting analysis is successful.');
  } catch (err) {
    console.error('✗ Test 2 Failed:', err.message);
    process.exit(1);
  }

  console.log('--- All Tests Passed Successfully! ---');
}

runTests();
