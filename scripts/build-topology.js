const db = require('../backend/db/pool');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Building pgRouting network topology...');
  try {
    const sqlPath = path.join(__dirname, 'build-road-topology.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await db.query(sql);
    console.log('✓ Road topology built successfully.');
    process.exit(0);
  } catch (err) {
    console.error('✗ Failed to build road network topology:', err.message);
    process.exit(1);
  }
}

main();
