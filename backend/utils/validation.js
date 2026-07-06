const BANGKOK_BBOX = {
  minLng: 100.30,
  minLat: 13.45,
  maxLng: 100.95,
  maxLat: 14.10,
};

const MODES = new Set(['walk', 'bike', 'drive']);
const COST_TYPES = new Set(['distance', 'time']);

function inBangkokBbox(lat, lng) {
  return lat >= BANGKOK_BBOX.minLat && lat <= BANGKOK_BBOX.maxLat
    && lng >= BANGKOK_BBOX.minLng && lng <= BANGKOK_BBOX.maxLng;
}

function normalizeFacilities(rawFacilities, body = {}) {
  const directPoint = Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lng))
    ? [{ lat: body.lat, lng: body.lng, name: body.name || 'จุดเริ่มต้น', type: 'service' }]
    : [];
  const facilities = Array.isArray(rawFacilities) && rawFacilities.length ? rawFacilities : directPoint;

  return facilities
    .map((facility, index) => ({
      id: facility.id || `facility-${index + 1}`,
      name: facility.name || `จุดบริการ ${index + 1}`,
      type: facility.type || 'service',
      lng: Number(facility.lng),
      lat: Number(facility.lat),
    }))
    .filter((facility) => Number.isFinite(facility.lng) && Number.isFinite(facility.lat));
}

function normalizeAnalyzeRequest(body) {
  const facilities = normalizeFacilities(body.facilities || [], body);
  const mode = MODES.has(body.mode) ? body.mode : 'walk';
  const costType = COST_TYPES.has(body.costType) ? body.costType : (body.distanceMeters ? 'distance' : 'time');
  const travelMinutes = Math.max(1, Math.min(Number(body.travelMinutes) || 15, 60));
  const speedKmh = Math.max(1, Math.min(Number(body.speedKmh) || (mode === 'drive' ? 25 : mode === 'bike' ? 15 : 5), 120));

  let limit = Number(body.limit);
  if (!Number.isFinite(limit) || limit <= 0) {
    limit = costType === 'time'
      ? travelMinutes * 60
      : Number(body.distanceMeters) || (speedKmh * 1000 * travelMinutes) / 60;
  }
  const maxLimit = costType === 'time' ? 3600 : 10000;
  limit = Math.max(costType === 'time' ? 60 : 100, Math.min(limit, maxLimit));

  return {
    facilities,
    mode,
    costType,
    limit,
    distanceMeters: costType === 'distance' ? limit : (speedKmh * 1000 * limit) / 3600,
    travelMinutes: costType === 'time' ? limit / 60 : travelMinutes,
    speedKmh,
    respectTurns: body.respectTurns === true || body.respectTurns === 'true',
  };
}

function validateAnalyzeRequest(normalized) {
  if (!normalized.facilities.length) {
    return { status: 400, code: 'NO_FACILITIES', message: 'Add at least one service point before analysis.' };
  }
  const outside = normalized.facilities.find((facility) => !inBangkokBbox(facility.lat, facility.lng));
  if (outside) {
    return { status: 400, code: 'INVALID_LOCATION', message: 'ตำแหน่งอยู่นอกพื้นที่กรุงเทพมหานคร' };
  }
  return null;
}

module.exports = {
  BANGKOK_BBOX,
  normalizeAnalyzeRequest,
  validateAnalyzeRequest,
  inBangkokBbox,
};
