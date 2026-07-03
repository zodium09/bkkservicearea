const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/bkk_gis';
const roadsPath = path.join(__dirname, '..', 'data', 'processed', 'bma-layers', 'layer-7.geojson');

async function main() {
  if (!fs.existsSync(roadsPath)) {
    console.error(`Road network file not found at ${roadsPath}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  let client;
  try {
    client = await pool.connect();
  } catch (e) {
    console.error(`Database connection failed: ${e.message}`);
    console.error('Please make sure PostgreSQL is running and DATABASE_URL is correct.');
    process.exit(1);
  }

  try {
    console.log('Reading roads GeoJSON file...');
    const data = JSON.parse(fs.readFileSync(roadsPath, 'utf8'));
    const features = data.features || [];
    console.log(`Loaded ${features.length} features.`);

    console.log('Clearing existing roads_raw data...');
    await client.query('TRUNCATE TABLE roads_raw RESTART IDENTITY CASCADE');

    console.log('Importing features in batches...');
    let count = 0;
    const batchSize = 500; // safe batch size to avoid parameter limit in pg
    
    await client.query('BEGIN');
    
    for (let i = 0; i < features.length; i += batchSize) {
      const batch = features.slice(i, i + batchSize);
      const values = [];
      const placeholders = [];
      
      let pIdx = 1;
      for (const f of batch) {
        if (!f.geometry) continue;
        
        const name = f.properties?.ROAD_NAME_T || f.properties?.NAME || null;
        const type = f.properties?.RC_TYPE || f.properties?.TYPE || null;
        
        const geomType = f.geometry.type;
        if (geomType === 'LineString') {
          const wkt = `LINESTRING(${f.geometry.coordinates.map(c => `${c[0]} ${c[1]}`).join(', ')})`;
          placeholders.push(`(ST_Transform(ST_SetSRID(ST_GeomFromText($${pIdx++}), 4326), 32647), $${pIdx++}, $${pIdx++})`);
          values.push(wkt, name, type);
          count++;
        } else if (geomType === 'MultiLineString') {
          for (const line of f.geometry.coordinates) {
            const wkt = `LINESTRING(${line.map(c => `${c[0]} ${c[1]}`).join(', ')})`;
            placeholders.push(`(ST_Transform(ST_SetSRID(ST_GeomFromText($${pIdx++}), 4326), 32647), $${pIdx++}, $${pIdx++})`);
            values.push(wkt, name, type);
            count++;
          }
        }
      }

      if (placeholders.length > 0) {
        const query = `INSERT INTO roads_raw (geom, road_name, road_type) VALUES ${placeholders.join(', ')}`;
        await client.query(query, values);
      }

      process.stdout.write(`\rImported ${count.toLocaleString()} geometries...`);
    }

    await client.query('COMMIT');
    console.log(`\nImport complete! Total geometries in database: ${count.toLocaleString()}`);

  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Import failed:', err);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch(console.error);
