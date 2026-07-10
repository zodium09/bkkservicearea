const fs = require('fs');
const path = require('path');

const apiBase = String(process.env.API_BASE_URL || 'http://127.0.0.1:5174').replace(/\/$/, '');
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'golden-service-areas.json'), 'utf8'));

async function validateFixture(fixture) {
  const response = await fetch(`${apiBase}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat: fixture.lat,
      lng: fixture.lng,
      mode: fixture.mode,
      costType: 'time',
      limit: fixture.minutes * 60,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${fixture.id}: HTTP ${response.status} ${result.message || ''}`);
  if (result.serviceArea?.type !== 'FeatureCollection' || !result.serviceArea.features?.length) {
    throw new Error(`${fixture.id}: no service-area geometry`);
  }
  if (Number(result.metrics?.serviceAreaSqKm || 0) < fixture.minimumAreaSqKm) {
    throw new Error(`${fixture.id}: area below ${fixture.minimumAreaSqKm} sq.km.`);
  }
  const districtNames = new Set((result.intersectingDistricts || []).map((district) => district.name));
  if (!fixture.expectedDistrictsAny.some((name) => districtNames.has(name))) {
    throw new Error(`${fixture.id}: expected one of ${fixture.expectedDistrictsAny.join(', ')}`);
  }
  return {
    id: fixture.id,
    areaSqKm: result.metrics.serviceAreaSqKm,
    districts: [...districtNames],
    quality: result.analysisQuality,
  };
}

async function main() {
  const results = [];
  for (const fixture of fixtures) results.push(await validateFixture(fixture));
  process.stdout.write(`${JSON.stringify({ passed: results.length, results }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
