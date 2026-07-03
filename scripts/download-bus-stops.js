const fs = require('fs');
const path = require('path');

const bbox = '13.48,100.32,13.98,100.94';
const query = `[out:json][timeout:60];node["highway"="bus_stop"](${bbox});out;`;
const url = `https://overpass.kumi.systems/api/interpreter?data=${encodeURIComponent(query)}`;
const outputPath = path.join(__dirname, '..', 'data', 'processed', 'accessibility', 'osm-bus-stops.geojson');

async function download() {
  console.log('Fetching Bangkok bus stops from OSM Overpass API...');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    if (!res.ok) {
      console.error(`Overpass API returned HTTP status ${res.status}`);
      return;
    }
    const data = await res.json();
    const elements = data.elements || [];
    console.log(`Successfully fetched ${elements.length} bus stops.`);

    const geojson = {
      type: 'FeatureCollection',
      features: elements.map(el => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [el.lon, el.lat]
        },
        properties: {
          OBJECTID: el.id,
          NAME: el.tags.name || 'ป้ายรถประจำทาง',
          DISTRICT: ''
        }
      }))
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2), 'utf8');
    console.log(`Saved local bus stops to ${outputPath}`);
  } catch (e) {
    console.error('Download failed:', e.message);
  }
}
download();
