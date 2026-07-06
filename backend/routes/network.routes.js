const express = require('express');
const db = require('../db/pool');

const router = express.Router();

router.get('/network/turn-restrictions', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
    const result = await db.query(`
      SELECT id, osm_relation_id, restriction, from_edge, via_node, to_edge, mode, created_at
      FROM turn_restrictions
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `, [limit]);
    res.json({ count: result.rows.length, restrictions: result.rows });
  } catch (error) {
    res.status(503).json({ error: true, code: 'TURN_RESTRICTIONS_UNAVAILABLE', message: error.message });
  }
});

router.get('/network/barriers', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
    const result = await db.query(`
      SELECT id, barrier_type, mode, reason, ST_AsGeoJSON(geom)::json AS geometry, created_at
      FROM network_barriers
      ORDER BY created_at DESC, id DESC
      LIMIT $1
    `, [limit]);
    res.json({ count: result.rows.length, barriers: result.rows });
  } catch (error) {
    res.status(503).json({ error: true, code: 'BARRIERS_UNAVAILABLE', message: error.message });
  }
});

router.get('/network/oneway-roads', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000);
    const result = await db.query(`
      SELECT id, road_name, name, highway, oneway, ST_AsGeoJSON(ST_Transform(geom, 4326))::json AS geometry
      FROM roads
      WHERE oneway IN ('yes', '-1')
      LIMIT $1
    `, [limit]);
    res.json({ count: result.rows.length, roads: result.rows });
  } catch (error) {
    res.status(503).json({ error: true, code: 'ONEWAY_ROADS_UNAVAILABLE', message: error.message });
  }
});

module.exports = router;
