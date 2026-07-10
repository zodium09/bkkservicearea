const express = require('express');
const db = require('../db/pool');
const routing = require('../services/routing.service');
const traffic = require('../services/traffic.service');
const { normalizeAnalyzeRequest, validateAnalyzeRequest } = require('../utils/validation');

const router = express.Router();

async function executeAnalysis(request, health = null) {
  const databaseHealth = health || await db.checkHealth();
  if (!databaseHealth.connected || !databaseHealth.postgis || !databaseHealth.pgrouting) {
    return routing.analyzeFallback(request);
  }

  try {
    return await routing.analyzeWithPgRouting(db, request);
  } catch (error) {
    if (error.status) throw error;
    const fallback = await routing.analyzeFallback(request);
    fallback.pgRoutingError = error.message;
    return fallback;
  }
}

function sendAnalysisError(res, error) {
  return res.status(error.status || 503).json({
    error: true,
    code: 'ANALYSIS_UNAVAILABLE',
    message: 'ไม่สามารถคำนวณพื้นที่เข้าถึงได้ในขณะนี้',
    detail: error.message,
  });
}

router.post('/analyze', async (req, res) => {
  const request = normalizeAnalyzeRequest(req.body || {});
  const invalid = validateAnalyzeRequest(request);
  if (invalid) return res.status(invalid.status).json({ error: true, code: invalid.code, message: invalid.message });

  try {
    return res.json(await executeAnalysis(request));
  } catch (error) {
    return sendAnalysisError(res, error);
  }
});

router.post('/analyze/contours', async (req, res) => {
  const rawContours = Array.isArray(req.body?.contoursMinutes) ? req.body.contoursMinutes : [10, 15, 30];
  const contoursMinutes = [...new Set(rawContours.map(Number)
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 60))]
    .sort((left, right) => left - right)
    .slice(0, 5);
  if (!contoursMinutes.length) {
    return res.status(400).json({ error: true, code: 'INVALID_CONTOURS', message: 'กำหนดช่วงเวลาอย่างน้อย 1 ค่า' });
  }

  const requests = contoursMinutes.map((minutes) => normalizeAnalyzeRequest({
    ...(req.body || {}),
    costType: 'time',
    travelMinutes: minutes,
    limit: minutes * 60,
  }));
  const invalid = validateAnalyzeRequest(requests[0]);
  if (invalid) return res.status(invalid.status).json({ error: true, code: invalid.code, message: invalid.message });

  try {
    const health = await db.checkHealth();
    let results;
    if (!health.connected || !health.postgis || !health.pgrouting) {
      results = await routing.analyzeFallbackContours(requests);
    } else {
      try {
        results = await Promise.all(requests.map((request) => routing.analyzeWithPgRouting(db, request)));
      } catch (error) {
        if (error.status) throw error;
        results = await routing.analyzeFallbackContours(requests);
      }
    }
    const contours = requests.map((request, index) => ({
      minutes: request.limit / 60,
      result: results[index],
    }));
    return res.json({
      type: 'ServiceAreaContours',
      generatedAt: new Date().toISOString(),
      contours,
      traffic: await traffic.status(),
    });
  } catch (error) {
    return sendAnalysisError(res, error);
  }
});

module.exports = router;
