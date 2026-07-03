const fs = require('fs');
const path = require('path');

const url = 'https://citymap.bangkok.go.th/citymap/rest/services/Basemap_Service/Basemap1000_32647_H/MapServer/7/query';
const outputPath = path.join(__dirname, '..', 'data', 'processed', 'bma-layers', 'layer-7.geojson');

async function downloadRoads() {
  console.log('=== STARTING ROAD NETWORK DOWNLOAD ===');
  const startTime = Date.now();
  const features = [];
  const pageSize = 2000;
  
  // Ensure directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      f: 'geojson',
      where: '1=1',
      outFields: 'OBJECTID',
      returnGeometry: 'true',
      outSR: '4326',
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      orderByFields: 'OBJECTID'
    });

    try {
      process.stdout.write(`Fetching features ${offset.toLocaleString()}... `);
      const res = await fetch(`${url}?${params.toString()}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (!res.ok) {
        console.error(`\nFailed to fetch at offset ${offset}: ${res.status}`);
        break;
      }
      
      const data = await res.json();
      const pageFeatures = data.features || [];
      features.push(...pageFeatures);
      
      console.log(`got ${pageFeatures.length} features (Total: ${features.length.toLocaleString()})`);
      
      if (!data.exceededTransferLimit && pageFeatures.length < pageSize) {
        break;
      }
      if (pageFeatures.length === 0) {
        break;
      }
    } catch (e) {
      console.error(`\nError fetching at offset ${offset}:`, e.message);
      // Wait a bit and retry
      console.log('Retrying in 2 seconds...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      offset -= pageSize; // retry same page
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nFinished download in ${duration}s. Total features: ${features.length.toLocaleString()}`);

  const collection = {
    type: 'FeatureCollection',
    layerId: 7,
    name: 'คมนาคม',
    source: 'https://citymap.bangkok.go.th/citymap/rest/services/Basemap_Service/Basemap1000_32647_H/MapServer/7',
    features
  };

  console.log(`Writing data to ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(collection), 'utf8');
  console.log(`Successfully wrote ${outputPath} (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB)`);
}

downloadRoads().catch(console.error);
