const express = require('express');
const db = require('../db/pool');
const { findQgisProcess } = require('../services/network.service');

const router = express.Router();

router.get('/engine/status', async (_req, res) => {
  const health = await db.checkHealth();
  const qgis = await findQgisProcess();
  res.json({
    runtimeEngine: 'postgis-pgrouting',
    database: health.connected,
    postgis: Boolean(health.connected && health.postgis),
    pgrouting: Boolean(health.connected && health.pgrouting),
    qgisProcess: qgis.found ? 'available' : 'optional',
    networkAttributes: true,
    modes: ['walk', 'bike', 'drive'],
    costTypes: ['distance', 'time'],
    error: health.error || null,
  });
});

module.exports = router;
