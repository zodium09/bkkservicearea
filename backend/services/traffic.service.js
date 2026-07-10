const DEFAULT_VIEWER_URL = 'https://cpudapp.bangkok.go.th/bmatraffic/';
const CACHE_TTL_MS = Number(process.env.TRAFFIC_CACHE_TTL_SECONDS || 60) * 1000;

let cache = { fetchedAt: 0, collection: null, error: null };

function configuredUrl() {
  const value = String(process.env.TRAFFIC_GEOJSON_URL || '').trim();
  if (!value) return null;
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('TRAFFIC_GEOJSON_URL must use http or https.');
  return parsed.toString();
}

function isFeatureCollection(value) {
  return value?.type === 'FeatureCollection' && Array.isArray(value.features);
}

async function loadTraffic({ force = false } = {}) {
  let url;
  try {
    url = configuredUrl();
  } catch (error) {
    cache.error = error.message;
    return null;
  }
  if (!url) return null;
  if (!force && cache.collection && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.collection;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.TRAFFIC_FETCH_TIMEOUT_MS || 8000));
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/geo+json, application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Traffic provider returned HTTP ${response.status}`);
    const data = await response.json();
    if (!isFeatureCollection(data)) throw new Error('Traffic provider did not return a GeoJSON FeatureCollection.');
    cache = { fetchedAt: Date.now(), collection: data, error: null };
    return data;
  } catch (error) {
    cache.error = error.name === 'AbortError' ? 'Traffic provider timed out.' : error.message;
    return cache.collection;
  } finally {
    clearTimeout(timeout);
  }
}

async function status() {
  const url = (() => {
    try { return configuredUrl(); } catch { return null; }
  })();
  if (url && (!cache.collection || Date.now() - cache.fetchedAt >= CACHE_TTL_MS)) await loadTraffic();
  return {
    configured: Boolean(url),
    available: Boolean(cache.collection),
    provider: url ? 'configured-geojson-feed' : 'bma-public-viewer',
    viewerUrl: DEFAULT_VIEWER_URL,
    lastUpdated: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null,
    featureCount: cache.collection?.features?.length || 0,
    refreshSeconds: CACHE_TTL_MS / 1000,
    error: cache.error,
    note: url
      ? 'Traffic overlay refreshes from the configured authorized GeoJSON feed.'
      : 'BMA publishes a realtime viewer, but no documented public GeoJSON API is configured.',
  };
}

function resetCache() {
  cache = { fetchedAt: 0, collection: null, error: null };
}

module.exports = { DEFAULT_VIEWER_URL, loadTraffic, status, resetCache, isFeatureCollection };
