const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/bkk_gis';
const inputPath = process.argv[2] || path.join(__dirname, '..', 'data', 'processed', 'bma-layers', 'layer-7.geojson');

const DEFAULT_SPEED = {
  motorway: 80,
  trunk: 70,
  primary: 60,
  secondary: 50,
  tertiary: 40,
  residential: 25,
  service: 15,
  living_street: 10,
  footway: 5,
  path: 5,
  cycleway: 15,
  steps: 2,
};

function firstTag(properties, names, fallback = null) {
  for (const name of names) {
    if (properties?.[name] !== undefined && properties[name] !== null && properties[name] !== '') return properties[name];
  }
  return fallback;
}

function asBoolean(value) {
  return ['yes', 'true', '1'].includes(String(value || '').toLowerCase());
}

function parseInteger(value) {
  const match = String(value || '').match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function inferSpeed(highway, maxspeed) {
  return maxspeed || DEFAULT_SPEED[highway] || 25;
}

function costs({ highway, access, foot, bicycle, motorVehicle, oneway, speedKph }) {
  const walkBlocked = ['no', 'private'].includes(access) || foot === 'no' || ['motorway', 'trunk'].includes(highway);
  const bikeBlocked = ['no', 'private'].includes(access) || bicycle === 'no' || highway === 'motorway';
  const driveBlocked = ['no', 'private'].includes(access) || motorVehicle === 'no' || ['footway', 'path', 'cycleway', 'steps'].includes(highway);
  return { walkBlocked, bikeBlocked, driveBlocked, speedKph, oneway };
}

function lineStrings(feature) {
  if (feature.geometry?.type === 'LineString') return [feature.geometry.coordinates];
  if (feature.geometry?.type === 'MultiLineString') return feature.geometry.coordinates;
  return [];
}

function lineWkt(coords) {
  return `LINESTRING(${coords.map((coord) => `${coord[0]} ${coord[1]}`).join(', ')})`;
}

async function main() {
  if (!fs.existsSync(inputPath)) throw new Error(`OSM/network GeoJSON not found: ${inputPath}`);
  const geojson = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE roads_raw RESTART IDENTITY CASCADE');

    let count = 0;
    for (const feature of geojson.features || []) {
      const props = feature.properties || {};
      const osmId = parseInteger(firstTag(props, ['osm_id', '@id', 'id']));
      const name = firstTag(props, ['name', 'NAME', 'ROAD_NAME_T']);
      const highway = String(firstTag(props, ['highway', 'HIGHWAY', 'road_type', 'RC_TYPE'], 'residential')).toLowerCase();
      const roadType = firstTag(props, ['road_type', 'RC_TYPE', 'TYPE'], highway);
      const oneway = String(firstTag(props, ['oneway', 'ONEWAY', 'ROAD_DIRECTION'], 'no')).toLowerCase();
      const lanes = parseInteger(firstTag(props, ['lanes', 'LANES']));
      const maxspeed = parseInteger(firstTag(props, ['maxspeed', 'MAXSPEED']));
      const bridge = asBoolean(firstTag(props, ['bridge', 'BRIDGE']));
      const tunnel = asBoolean(firstTag(props, ['tunnel', 'TUNNEL']));
      const layer = parseInteger(firstTag(props, ['layer', 'LAYER'])) || 0;
      const access = String(firstTag(props, ['access'], '')).toLowerCase();
      const foot = String(firstTag(props, ['foot'], '')).toLowerCase();
      const bicycle = String(firstTag(props, ['bicycle'], '')).toLowerCase();
      const motorVehicle = String(firstTag(props, ['motor_vehicle', 'motorcar'], '')).toLowerCase();
      const speedKph = inferSpeed(highway, maxspeed);
      const mode = costs({ highway, access, foot, bicycle, motorVehicle, oneway, speedKph });

      for (const coords of lineStrings(feature)) {
        if (coords.length < 2) continue;
        const inserted = await client.query(`
          INSERT INTO roads_raw (geom, road_name, road_type)
          VALUES (ST_Transform(ST_SetSRID(ST_GeomFromText($1), 4326), 32647), $2, $3)
          RETURNING id, ST_Length(geom) AS length_m
        `, [lineWkt(coords), name, roadType]);
        const raw = inserted.rows[0];
        const lengthM = Number(raw.length_m);
        const walk = mode.walkBlocked ? -1 : lengthM / (5 * 1000 / 3600);
        const bike = mode.bikeBlocked ? -1 : lengthM / (15 * 1000 / 3600);
        let drive = mode.driveBlocked ? -1 : lengthM / (speedKph * 1000 / 3600);
        let reverseDrive = drive;
        if (oneway === 'yes') reverseDrive = -1;
        if (oneway === '-1') {
          reverseDrive = drive;
          drive = -1;
        }
        await client.query(`
          INSERT INTO roads (
            geom, road_name, road_type, cost, reverse_cost, osm_id, name, highway, oneway, lanes, maxspeed,
            bridge, tunnel, layer, access, foot, bicycle, motor_vehicle, length_m, speed_kph,
            walk_cost_s, bike_cost_s, drive_cost_s, reverse_walk_cost_s, reverse_bike_cost_s, reverse_drive_cost_s
          )
          SELECT geom, $2, $3, $4, $4, $5, $2, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $19, $20, $22
          FROM roads_raw
          WHERE id = $1
        `, [
          raw.id, name, roadType, lengthM, osmId, highway, oneway, lanes, maxspeed,
          bridge, tunnel, layer, access, foot, bicycle, motorVehicle, lengthM, speedKph,
          walk, bike, drive, reverseDrive,
        ]);
        count += 1;
      }
      if (count % 500 === 0) process.stdout.write(`\rImported ${count.toLocaleString()} edges...`);
    }
    await client.query('COMMIT');
    console.log(`\nImported ${count.toLocaleString()} network edges with OSM attributes.`);
    console.log('Run npm run db:topology after import to rebuild pgRouting topology.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
