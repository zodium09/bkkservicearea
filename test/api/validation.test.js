const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAnalyzeRequest,
  validateAnalyzeRequest,
} = require('../../backend/utils/validation');

test('normalizes time-based walk analysis request', () => {
  const request = normalizeAnalyzeRequest({
    lat: 13.7563,
    lng: 100.5018,
    mode: 'walk',
    costType: 'time',
    limit: 900,
  });

  assert.equal(request.mode, 'walk');
  assert.equal(request.costType, 'time');
  assert.equal(request.limit, 900);
  assert.equal(request.facilities.length, 1);
});

test('rejects location outside Bangkok bbox', () => {
  const request = normalizeAnalyzeRequest({
    lat: 15.0,
    lng: 100.5018,
    mode: 'drive',
    costType: 'time',
    limit: 900,
  });
  const error = validateAnalyzeRequest(request);

  assert.equal(error.code, 'INVALID_LOCATION');
});

test('caps limits by cost type', () => {
  const timeRequest = normalizeAnalyzeRequest({ lat: 13.7, lng: 100.5, costType: 'time', limit: 99999 });
  const distanceRequest = normalizeAnalyzeRequest({ lat: 13.7, lng: 100.5, costType: 'distance', limit: 99999 });

  assert.equal(timeRequest.limit, 3600);
  assert.equal(distanceRequest.limit, 10000);
});
