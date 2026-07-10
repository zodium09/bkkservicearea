const express = require('express');
const traffic = require('../services/traffic.service');

const router = express.Router();

router.get('/traffic/status', async (_req, res) => {
  res.json(await traffic.status());
});

router.get('/traffic/segments', async (_req, res) => {
  const collection = await traffic.loadTraffic();
  const status = await traffic.status();
  res.json(collection || {
    type: 'FeatureCollection',
    features: [],
    trafficStatus: status,
  });
});

module.exports = router;
