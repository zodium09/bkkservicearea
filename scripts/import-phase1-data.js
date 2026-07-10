const fs = require('fs');
const path = require('path');
const db = require('../backend/db/pool');

const ROOT = path.join(__dirname, '..');

async function importCatalog() {
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));
  for (const source of catalog.sources || []) {
    await db.query(`
      INSERT INTO dataset_registry
        (dataset_id, title, publisher, source_role, source_url, source_format, refresh_policy, license_note, status, metadata, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
      ON CONFLICT (dataset_id) DO UPDATE SET
        title = EXCLUDED.title,
        publisher = EXCLUDED.publisher,
        source_role = EXCLUDED.source_role,
        source_url = EXCLUDED.source_url,
        source_format = EXCLUDED.source_format,
        refresh_policy = EXCLUDED.refresh_policy,
        license_note = EXCLUDED.license_note,
        status = EXCLUDED.status,
        metadata = EXCLUDED.metadata,
        updated_at = now()
    `, [
      source.id, source.title, source.publisher, source.role, source.url || null,
      source.format || null, source.refresh || null, source.license || null,
      source.status || 'active', JSON.stringify(source),
    ]);
  }
  return catalog.sources?.length || 0;
}

async function importPopulation() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'processed', 'population', 'district-population.json'), 'utf8'));
  for (const district of data.districts || []) {
    await db.query(`
      INSERT INTO district_population
        (district_name, reference_year, population_total, population_male, population_female, dataset_id, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,now())
      ON CONFLICT (district_name, reference_year) DO UPDATE SET
        population_total = EXCLUDED.population_total,
        population_male = EXCLUDED.population_male,
        population_female = EXCLUDED.population_female,
        dataset_id = EXCLUDED.dataset_id,
        updated_at = now()
    `, [district.name, data.referenceYear, district.total, district.male, district.female, 'bma-population-district-2023']);
  }
  return data.districts?.length || 0;
}

async function main() {
  const sourceCount = await importCatalog();
  const populationCount = await importPopulation();
  console.log(`Imported ${sourceCount} data sources and ${populationCount} district population records.`);
  await db.pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  await db.pool.end();
  process.exit(1);
});
