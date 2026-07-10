const crypto = require('crypto');

function cacheKey({ facilities, mode, costType, limit }) {
  // Include the response schema version so stale records from an older
  // deployment are never returned after accessibility metrics change.
  const cacheVersion = process.env.ANALYSIS_CACHE_VERSION || 'phase1-v1';
  const points = facilities
    .map((facility) => `${Number(facility.lat).toFixed(5)},${Number(facility.lng).toFixed(5)}`)
    .sort()
    .join('|');
  return crypto
    .createHash('sha1')
    .update(`${cacheVersion}:${points}:${mode}:${costType}:${Number(limit).toFixed(2)}`)
    .digest('hex');
}

async function get(db, key, ttlSeconds = Number(process.env.SERVICE_AREA_CACHE_TTL_SECONDS) || 86400) {
  try {
    const res = await db.query(
      `SELECT result_geojson, stats
       FROM service_area_cache
       WHERE cache_key = $1 AND created_at > now() - ($2::text || ' seconds')::interval
       LIMIT 1`,
      [key, ttlSeconds],
    );
    if (!res.rows.length) return null;
    return { ...res.rows[0].result_geojson, cacheHit: true, stats: res.rows[0].stats || res.rows[0].result_geojson?.stats };
  } catch (err) {
    if (/service_area_cache/i.test(err.message)) return null;
    throw err;
  }
}

async function set(db, key, request, result) {
  try {
    await db.query(
      `INSERT INTO service_area_cache
       (cache_key, lat, lng, snapped_node, mode, cost_type, limit_value, result_geojson, stats)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (cache_key) DO UPDATE
       SET result_geojson = EXCLUDED.result_geojson,
           stats = EXCLUDED.stats,
           created_at = now()`,
      [
        key,
        request.facilities[0]?.lat,
        request.facilities[0]?.lng,
        result.snappedNode || null,
        request.mode,
        request.costType,
        request.limit,
        JSON.stringify(result),
        JSON.stringify(result.stats || result.metrics || {}),
      ],
    );
  } catch (err) {
    console.warn('Service area cache write skipped:', err.message);
  }
}

module.exports = { cacheKey, get, set };
