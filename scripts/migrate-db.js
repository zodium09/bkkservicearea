const fs = require('fs');
const path = require('path');
const db = require('../backend/db/pool');

async function main() {
  const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT now()
    )
  `);

  for (const file of files) {
    const applied = await db.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (applied.rows.length) {
      console.log(`skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await db.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }

  await db.pool.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
