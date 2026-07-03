const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/bkk_gis';

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message);
});

module.exports = {
  pool,
  query: async (text, params) => {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      // Log slow queries (> 150ms)
      if (duration > 150) {
        console.warn(`Slow Database Query: ${text.slice(0, 100)}... took ${duration}ms`);
      }
      return res;
    } catch (err) {
      console.error(`Database Query Error: ${err.message}\nQuery: ${text}`);
      throw err;
    }
  },
  // Utility to check database & extensions connection health
  checkHealth: async () => {
    try {
      const client = await pool.connect();
      try {
        const postgisRes = await client.query("SELECT PostGIS_Full_Version() as version");
        const pgroutingRes = await client.query("SELECT pgr_version() as version");
        return {
          connected: true,
          postgis: postgisRes.rows[0]?.version || false,
          pgrouting: pgroutingRes.rows[0]?.version || false
        };
      } finally {
        client.release();
      }
    } catch (err) {
      return {
        connected: false,
        error: err.message
      };
    }
  }
};
