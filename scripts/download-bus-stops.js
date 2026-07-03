const fs = require('fs');
const path = require('path');

const query = `[out:json][timeout:180];
area["ISO3166-2"="TH-10"]->.searchArea;
(
  node["highway"="bus_stop"](area.searchArea);
  node["public_transport"="platform"](area.searchArea);
  node["highway"="platform"](area.searchArea);
  node["amenity"="bus_station"](area.searchArea);
);
out;`;
const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
const outputPath = path.join(__dirname, '..', 'data', 'processed', 'accessibility', 'osm-bus-stops.geojson');

async function download() {
  console.log('Fetching Bangkok bus stops from OSM Overpass API...');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'BKKServiceAreaBot/1.0 (accessibility-dashboard@bangkok.go.th)'
      }
    });
    if (!res.ok) {
      console.error(`Overpass API returned HTTP status ${res.status}`);
      return;
    }
    const data = await res.json();
    const elements = data.elements || [];
    
    // Deduplicate by OSM element ID
    const seenIds = new Set();
    const uniqueElements = [];
    for (const el of elements) {
      if (el.lat && el.lon && !seenIds.has(el.id)) {
        seenIds.add(el.id);
        uniqueElements.push(el);
      }
    }
    console.log(`Successfully fetched ${uniqueElements.length} unique bus stops.`);

    const geojson = {
      type: 'FeatureCollection',
      features: uniqueElements.map(el => ({
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
