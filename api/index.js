const app = require('../backend/server');

/**
 * Vercel exposes this file as /api/index. Requests under /api/* are rewritten
 * here with the original path in the `path` query parameter so the existing
 * Express router can be shared by local, Docker, and serverless deployments.
 */
module.exports = function handler(req, res) {
  const routedPath = Array.isArray(req.query?.path)
    ? req.query.path.join('/')
    : req.query?.path;

  if (routedPath) {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    requestUrl.searchParams.delete('path');
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${String(routedPath).replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
  }

  return app(req, res);
};

