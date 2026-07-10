const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');
const network = require('./network.service');

const POPULATION_PATH = path.join(network.ROOT, 'data', 'processed', 'population', 'district-population.json');

let cache = null;

function loadPopulation() {
  if (cache) return cache;
  if (!fs.existsSync(POPULATION_PATH)) return null;
  const data = JSON.parse(fs.readFileSync(POPULATION_PATH, 'utf8'));
  const byDistrict = new Map((data.districts || []).map((district) => [district.name, district]));
  cache = { ...data, byDistrict };
  return cache;
}

function districtName(feature) {
  return feature?.properties?.DNAME
    || feature?.properties?.DISTRICT_N
    || feature?.properties?.NAME
    || feature?.properties?.name
    || '';
}

function estimateDistrictReach(serviceAreaFeature, districtFeature) {
  try {
    const districtArea = turf.area(districtFeature);
    if (!districtArea) return { overlapRatio: 0, overlapAreaSqKm: 0 };
    const clipped = turf.intersect(turf.featureCollection([serviceAreaFeature, districtFeature]));
    if (!clipped) return { overlapRatio: 0, overlapAreaSqKm: 0 };
    const overlapArea = turf.area(clipped);
    return {
      overlapRatio: Math.max(0, Math.min(1, overlapArea / districtArea)),
      overlapAreaSqKm: overlapArea / 1000000,
    };
  } catch {
    return { overlapRatio: 0, overlapAreaSqKm: 0 };
  }
}

function enrichDistrict(serviceAreaFeature, districtFeature) {
  const population = loadPopulation();
  const name = districtName(districtFeature);
  const districtPopulation = population?.byDistrict.get(name);
  const overlap = estimateDistrictReach(serviceAreaFeature, districtFeature);
  const total = Number(districtPopulation?.total || 0);
  return {
    populationTotal: total,
    populationReachedEstimate: Math.round(total * overlap.overlapRatio),
    overlapRatio: Number(overlap.overlapRatio.toFixed(4)),
    overlapAreaSqKm: Number(overlap.overlapAreaSqKm.toFixed(3)),
    populationReferenceYear: population?.referenceYear || null,
  };
}

function summarize(districts) {
  const population = loadPopulation();
  return {
    reachedEstimate: districts.reduce((sum, district) => sum + Number(district.populationReachedEstimate || 0), 0),
    coveredDistrictPopulation: districts.reduce((sum, district) => sum + Number(district.populationTotal || 0), 0),
    bangkokPopulation: Number(population?.total || 0),
    referenceYear: population?.referenceYear || null,
    method: 'district-area-weighted-estimate',
    caveat: 'ค่าประมาณจากสัดส่วนพื้นที่เขต ไม่ใช่จำนวนประชากรระดับอาคาร',
  };
}

function publicDataset() {
  const population = loadPopulation();
  if (!population) return null;
  const { byDistrict: _byDistrict, ...data } = population;
  return data;
}

module.exports = {
  POPULATION_PATH,
  loadPopulation,
  enrichDistrict,
  summarize,
  publicDataset,
};
