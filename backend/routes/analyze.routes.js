const express = require('express');
const db = require('../db/pool');
const routing = require('../services/routing.service');
const { normalizeAnalyzeRequest, validateAnalyzeRequest } = require('../utils/validation');

const router = express.Router();

router.post('/analyze', async (req, res) => {
  const request = normalizeAnalyzeRequest(req.body || {});
  const invalid = validateAnalyzeRequest(request);
  if (invalid) return res.status(invalid.status).json({ error: true, code: invalid.code, message: invalid.message });

  const health = await db.checkHealth();
  if (!health.connected || !health.postgis || !health.pgrouting) {
    try {
      const fallback = await routing.analyzeFallback(request);
      return res.json(fallback);
    } catch (error) {
      return res.status(error.status || 503).json({
        error: true,
        code: 'ANALYSIS_UNAVAILABLE',
        message: 'Database is not ready for pgRouting analysis and JavaScript fallback failed.',
        detail: error.message,
      });
    }
  }

  try {
    const result = await routing.analyzeWithPgRouting(db, request);
    return res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: true, code: 'ROUTING_FAILED', message: error.message });
    }
    return res.status(500).json({
      error: true,
      code: 'PGROUTING_FAILED',
      message: 'pgRouting network analysis failed',
      detail: error.message,
    });
  }
});

module.exports = router;
