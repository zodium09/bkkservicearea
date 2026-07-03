const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const turf = require('@turf/turf');

const ROOT_DIR = path.resolve(__dirname, '..');
const ROADS_PATH = path.join(ROOT_DIR, 'data', 'processed', 'bma-layers', 'layer-7.geojson');
const POIS_PATH = path.join(ROOT_DIR, 'data', 'processed', 'bma-layers', 'layer-0.geojson');
const DISTRICTS_PATH = path.join(ROOT_DIR, 'data', 'processed', 'bma-layers', 'layer-13.geojson');
const OUTPUT_DIR = path.join(ROOT_DIR, 'data', 'processed', 'accessibility');
const TMP_DIR = path.join(ROOT_DIR, 'data', 'processed', 'accessibility', 'tmp');

// Ensure directories exist
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const CATEGORIES = {
  health: {
    name: 'โรงพยาบาลและสาธารณสุข',
    where: "(NAME LIKE '%โรงพยาบาล%' OR NAME LIKE '%ศูนย์บริการสาธารณสุข%' OR NAME LIKE '%รพ.%') AND NOT (NAME LIKE '%สัตว์%' OR NAME LIKE '%ฟัน%' OR NAME LIKE '%ทันต%')",
    localFilter: (f) => {
      const name = f.properties?.NAME || '';
      return (name.includes('โรงพยาบาล') || name.includes('ศูนย์บริการสาธารณสุข') || name.includes('รพ.')) && 
             !(name.includes('สัตว์') || name.includes('ฟัน') || name.includes('ทันต'));
    }
  },
  education: {
    name: 'โรงเรียนและสถานศึกษา',
    where: "(NAME LIKE '%โรงเรียน%' OR NAME LIKE '%วิทยาลัย%' OR NAME LIKE '%มหาวิทยาลัย%') AND NOT (NAME LIKE '%สอนขับ%' OR NAME LIKE '%มวย%' OR NAME LIKE '%กวดวิชา%' OR NAME LIKE '%สอนภาษา%')",
    localFilter: (f) => {
      const name = f.properties?.NAME || '';
      return (name.includes('โรงเรียน') || name.includes('วิทยาลัย') || name.includes('มหาวิทยาลัย')) && 
             !(name.includes('สอนขับ') || name.includes('มวย') || name.includes('กวดวิชา') || name.includes('สอนภาษา'));
    }
  },
  parks: {
    name: 'สวนสาธารณะและพื้นที่สีเขียว',
    where: "(NAME LIKE '%สวนสาธารณะ%' OR NAME LIKE '%สวนหย่อม%' OR NAME LIKE '%ลานกีฬา%' OR NAME LIKE '%สนามเด็กเล่น%') AND NOT (NAME LIKE '%อาหาร%' OR NAME LIKE '%หมูกระทะ%' OR NAME LIKE '%คาราโอเกะ%' OR NAME LIKE '%หมู่บ้าน%' OR NAME LIKE '%คอนโด%' OR NAME LIKE '%อพาร์ท%' OR NAME LIKE '%หอพัก%' OR NAME LIKE '%บ้านพัก%')",
    localFilter: (f) => {
      const name = f.properties?.NAME || '';
      const matchesInclude = name.includes('สวนสาธารณะ') || name.includes('สวนหย่อม') || name.includes('ลานกีฬา') || name.includes('สนามเด็กเล่น');
      const matchesExclude = ['อาหาร', 'หมูกระทะ', 'คาราโอเกะ', 'หมู่บ้าน', 'คอนโด', 'อพาร์ท', 'หอพัก', 'บ้านพัก'].some(w => name.includes(w));
      return matchesInclude && !matchesExclude;
    }
  },
  transit: {
    name: 'สถานีขนส่งสาธารณะ',
    where: "NAME LIKE '%สถานีรถไฟฟ้า%' OR NAME LIKE '%สถานีบีทีเอส%' OR NAME LIKE '%สถานี MRT%' OR NAME LIKE '%สถานี BTS%' OR NAME LIKE '%แอร์พอร์ตลิงก์%' OR NAME LIKE '%Airport Rail Link%'",
    localFilter: (f) => {
      const name = f.properties?.NAME || '';
      return name.includes('สถานีรถไฟฟ้า') || name.includes('สถานีบีทีเอส') || name.includes('สถานี MRT') || name.includes('สถานี BTS') || name.includes('แอร์พอร์ตลิงก์') || name.includes('Airport Rail Link');
    }
  }
};

const MODES = {
  walk: {
    name: 'เดิน 15 นาที (1.25 กม.)',
    cutoff: 1250, // 15 mins at 5 km/h
    bufferRadius: 0.15, // km (fallback)
    qgisBufferDeg: 0.00072 // ~80m in degrees
  },
  cycle: {
    name: 'ปั่นจักรยาน 15 นาที (3.75 กม.)',
    cutoff: 3750, // 15 mins at 15 km/h
    bufferRadius: 0.25, // km (fallback)
    qgisBufferDeg: 0.00090 // ~100m in degrees
  }
};

// Min priority queue / Binary heap helper for Dijkstra
function pushHeap(heap, item) {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].distance <= item.distance) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = item;
}

function popHeap(heap) {
  if (heap.length === 1) return heap.pop();
  const top = heap[0];
  const item = heap.pop();
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const child = right < heap.length && heap[right].distance < heap[left].distance ? right : left;
    if (heap[child].distance >= item.distance) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = item;
  return top;
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const isBatch = /\.(bat|cmd)$/i.test(command);
    const executable = isBatch ? process.env.ComSpec || 'cmd.exe' : command;
    const executableArgs = isBatch ? ['/c', command, ...args] : args;
    execFile(executable, executableArgs, { timeout: 120000, windowsHide: true, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, error, stdout, stderr });
    });
  });
}

async function findQgisProcess() {
  if (process.env.QGIS_PROCESS) {
    const probe = await runCommand(process.env.QGIS_PROCESS, ['--version']);
    return { found: probe.ok, command: process.env.QGIS_PROCESS, version: probe.stdout.trim() || probe.stderr.trim() };
  }

  const probe = await runCommand('where.exe', ['qgis_process']);
  const command = probe.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  const candidates = [];
  if (command) candidates.push(command);

  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  candidates.push(
    path.join(programFiles, 'QGIS 4.0.1', 'bin', 'qgis_process-qgis.bat'),
    path.join(programFiles, 'QGIS 4.0.0', 'bin', 'qgis_process-qgis.bat'),
    path.join(programFiles, 'QGIS 3.34.12', 'bin', 'qgis_process-qgis-ltr.bat'),
  );

  for (const candidate of candidates) {
    const version = await runCommand(candidate, ['--version']);
    if (version.ok) {
      return { found: true, command: candidate, version: version.stdout.trim() || version.stderr.trim() };
    }
  }

  return { found: false, command: null, version: null };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Bangkok-Service-Area-Analysis/1.0',
      accept: 'application/json, */*',
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function main() {
  console.log('=== STARTING 15-MINUTE CITY REAL PRECOMPUTATION ===');
  const startTime = Date.now();

  // Find QGIS
  const qgis = await findQgisProcess();
  console.log(qgis.found ? `QGIS Found: ${qgis.command}` : 'QGIS not found. Using JS fallback.');

  // 1. Load Road Network
  console.log('\n[1/7] Loading road networks...');
  if (!fs.existsSync(ROADS_PATH)) {
    console.error(`Road network file not found at ${ROADS_PATH}. Run npm run prepare:data first.`);
    process.exit(1);
  }
  const roads = JSON.parse(fs.readFileSync(ROADS_PATH, 'utf8'));
  console.log(`Loaded ${roads.features.length} road features.`);

  // 2. Build Road Graph
  console.log('\n[2/7] Building road network graph...');
  const graph = { nodes: new Map(), edges: [] };
  
  function nodeKey(coord) {
    return `${Number(coord[0]).toFixed(6)},${Number(coord[1]).toFixed(6)}`;
  }

  function addNode(graph, coord) {
    const key = nodeKey(coord);
    if (!graph.nodes.has(key)) {
      graph.nodes.set(key, { key, coord, edges: [] });
    }
    return graph.nodes.get(key);
  }

  function eachLineCoords(feature) {
    if (feature.geometry?.type === 'LineString') return [feature.geometry.coordinates];
    if (feature.geometry?.type === 'MultiLineString') return feature.geometry.coordinates;
    return [];
  }

  for (const feature of roads.features || []) {
    for (const line of eachLineCoords(feature)) {
      for (let index = 0; index < line.length - 1; index += 1) {
        const start = line[index];
        const end = line[index + 1];
        if (!start || !end || (start[0] === end[0] && start[1] === end[1])) continue;
        const a = addNode(graph, start);
        const b = addNode(graph, end);
        const lengthMeters = turf.distance(turf.point(start), turf.point(end), { units: 'kilometers' }) * 1000;
        if (!Number.isFinite(lengthMeters) || lengthMeters <= 0) continue;
        const edge = {
          id: `${feature.id || feature.properties?.OBJECTID || 'road'}-${index}`,
          a: a.key,
          b: b.key,
          lengthMeters,
          coordinates: [start, end],
          properties: feature.properties || {},
        };
        graph.edges.push(edge);
        a.edges.push({ to: b.key, edge });
        b.edges.push({ to: a.key, edge });
      }
    }
  }
  console.log(`Graph built: ${graph.nodes.size.toLocaleString()} nodes, ${graph.edges.length.toLocaleString()} edges.`);

  // 3. Build Grid Index for fast snapping
  console.log('\n[3/7] Building spatial grid index for snapping...');
  const grid = {};
  const gridSize = 0.01; // ~1.1km
  for (const node of graph.nodes.values()) {
    const cellX = Math.floor(node.coord[0] / gridSize);
    const cellY = Math.floor(node.coord[1] / gridSize);
    const key = `${cellX},${cellY}`;
    if (!grid[key]) grid[key] = [];
    grid[key].push(node);
  }
  console.log('Grid index created.');

  function fastNearestRoadNode(lat, lng) {
    const point = turf.point([lng, lat]);
    const cellX = Math.floor(lng / gridSize);
    const cellY = Math.floor(lat / gridSize);
    
    let nearest = null;
    let searchRadius = 1;
    
    while (nearest === null || (nearest.distanceMeters > searchRadius * gridSize * 111000)) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
          if (Math.abs(dx) < searchRadius && Math.abs(dy) < searchRadius && searchRadius > 1) continue;
          const key = `${cellX + dx},${cellY + dy}`;
          const nodes = grid[key] || [];
          for (const node of nodes) {
            const distanceMeters = turf.distance(point, turf.point(node.coord), { units: 'kilometers' }) * 1000;
            if (!nearest || distanceMeters < nearest.distanceMeters) {
              nearest = { nodeKey: node.key, coord: node.coord, distanceMeters };
            }
          }
        }
      }
      if (nearest && nearest.distanceMeters <= searchRadius * gridSize * 111000) {
        break;
      }
      searchRadius++;
      if (searchRadius > 10) break;
    }
    return nearest;
  }

  // 4. Load Districts
  console.log('\n[4/7] Loading district boundaries...');
  if (!fs.existsSync(DISTRICTS_PATH)) {
    console.error(`District boundary file not found at ${DISTRICTS_PATH}. Run npm run prepare:data first.`);
    process.exit(1);
  }
  const districts = JSON.parse(fs.readFileSync(DISTRICTS_PATH, 'utf8'));
  console.log(`Loaded ${districts.features.length} districts.`);

  // 5. Run Precomputations for each Category and Mode
  const stats = {
    generatedAt: new Date().toISOString(),
    overall: {},
    districts: {}
  };

  districts.features.forEach(district => {
    const code = district.properties?.DCODE || district.properties?.OBJECTID || district.properties?.name;
    const name = district.properties?.DNAME || district.properties?.DISTRICT_N || district.properties?.NAME || 'ไม่ทราบชื่อเขต';
    stats.districts[code] = {
      code,
      name,
      coverage: {}
    };
  });

  const mapserverUrl = 'https://citymap.bangkok.go.th/citymap/rest/services/Basemap_Service/Basemap1000_32647_H/MapServer/0/query';

  for (const [catKey, catConfig] of Object.entries(CATEGORIES)) {
    console.log(`\n--------------------------------------------`);
    console.log(`Category: ${catConfig.name} (${catKey})`);
    console.log(`--------------------------------------------`);

    // Fetch POIs
    let catPois = null;
    try {
      console.log(`Fetching POIs from MapServer...`);
      const params = new URLSearchParams({
        f: 'geojson',
        where: catConfig.where,
        outFields: 'OBJECTID,NAME,NAME_ENG,STREET,DISTRICT,SUB_DISTRICT',
        returnGeometry: 'true',
        outSR: '4326',
      });
      catPois = await fetchJson(`${mapserverUrl}?${params.toString()}`);
    } catch (e) {
      console.log(`MapServer fetch failed (${e.message}). Falling back to local catalog...`);
      if (!fs.existsSync(POIS_PATH)) {
        console.error(`Local POIs file not found at ${POIS_PATH}.`);
        continue;
      }
      const localPois = JSON.parse(fs.readFileSync(POIS_PATH, 'utf8'));
      catPois = {
        type: 'FeatureCollection',
        features: localPois.features.filter(catConfig.localFilter)
      };
    }

    console.log(`Total POIs found: ${catPois.features.length}`);

    // Snap POIs
    console.log(`Snapping POIs to road network...`);
    const sourceKeys = [];
    const snappedFeatures = [];
    const seenNames = new Set();

    catPois.features.forEach(f => {
      const name = f.properties?.NAME || '';
      if (catKey === 'transit') {
        const baseName = name.split(' ประตู ')[0].split(' ทางเข้า ')[0].trim();
        if (seenNames.has(baseName)) return;
        seenNames.add(baseName);
      }

      const [lng, lat] = f.geometry.coordinates;
      const snap = fastNearestRoadNode(lat, lng);
      if (snap && snap.distanceMeters < 750) {
        sourceKeys.push(snap.nodeKey);
        snappedFeatures.push(turf.point(snap.coord, {
          id: f.properties?.OBJECTID || `poi-${snappedFeatures.length}`,
          name: f.properties?.NAME || `สถานที่สำคัญ ${snappedFeatures.length + 1}`,
          district: f.properties?.DISTRICT || '',
          snapDistanceMeters: Number(snap.distanceMeters.toFixed(2))
        }));
      }
    });

    const snappedCollection = turf.featureCollection(snappedFeatures);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${catKey}-pois.geojson`), JSON.stringify(snappedCollection));
    console.log(`Successfully snapped and saved ${snappedFeatures.length} POIs.`);

    if (snappedFeatures.length === 0) {
      console.log(`No POIs snapped. Skipping this category.`);
      continue;
    }

    stats.overall[catKey] = {};

    for (const [modeKey, modeConfig] of Object.entries(MODES)) {
      console.log(`Running accessibility analysis for mode: ${modeConfig.name}...`);
      
      // Dijkstra
      const distances = new Map();
      const queue = [];
      for (const key of sourceKeys) {
        distances.set(key, 0);
        pushHeap(queue, { key, distance: 0 });
      }
      
      while (queue.length) {
        const current = popHeap(queue);
        if (current.distance !== distances.get(current.key)) continue;
        if (current.distance > modeConfig.cutoff) continue;

        const node = graph.nodes.get(current.key);
        if (!node) continue;
        
        for (const adjacent of node.edges) {
          const nextDistance = current.distance + adjacent.edge.lengthMeters;
          if (nextDistance > modeConfig.cutoff) continue;
          if (!distances.has(adjacent.to) || nextDistance < distances.get(adjacent.to)) {
            distances.set(adjacent.to, nextDistance);
            pushHeap(queue, { key: adjacent.to, distance: nextDistance });
          }
        }
      }

      console.log(`- Reachable nodes: ${distances.size}`);

      // Collect Reachable Roads (LineStrings)
      const walkRoads = graph.edges
        .filter(edge => distances.has(edge.a) && distances.has(edge.b));
      console.log(`- Reachable road segments: ${walkRoads.length}`);

      let serviceArea = null;

      // Try using QGIS buffer for actual roads (Non-simulated, highly accurate)
      if (qgis.found && walkRoads.length > 0) {
        console.log(`- Calculating buffer using QGIS CLI (accurate road corridor)...`);
        
        const tmpRoadsPath = path.join(TMP_DIR, `roads-${catKey}-${modeKey}.geojson`);
        const tmpBufferPath = path.join(TMP_DIR, `buffer-${catKey}-${modeKey}.geojson`);
        
        // Write roads to temporary file
        const featureList = walkRoads.map(r => turf.lineString(r.coordinates));
        fs.writeFileSync(tmpRoadsPath, JSON.stringify(turf.featureCollection(featureList)));

        const qgisArgs = [
          'run',
          'native:buffer',
          '--',
          `INPUT=${tmpRoadsPath}`,
          `DISTANCE=${modeConfig.qgisBufferDeg}`,
          'SEGMENTS=5',
          'END_CAP_STYLE=0',
          'JOIN_STYLE=0',
          'MITER_LIMIT=2',
          'DISSOLVE=true',
          `OUTPUT=${tmpBufferPath}`
        ];

        const qgisRun = await runCommand(qgis.command, qgisArgs);
        if (qgisRun.ok && fs.existsSync(tmpBufferPath)) {
          try {
            serviceArea = JSON.parse(fs.readFileSync(tmpBufferPath, 'utf8'));
            // Simplify slightly to optimize file size and UI rendering speed
            if (serviceArea) {
              serviceArea = turf.simplify(serviceArea, { tolerance: 0.00004, highQuality: false });
            }
            console.log(`- QGIS buffer completed successfully. Output size: ${(fs.statSync(tmpBufferPath).size / 1024).toFixed(1)} KB`);
          } catch (e) {
            console.error('Failed to parse QGIS buffer output:', e.message);
            serviceArea = null;
          }
        } else {
          console.warn('QGIS buffer call failed. Falling back to JS sampled buffer.');
          console.warn('QGIS Output:', qgisRun.stdout, qgisRun.stderr);
        }

        // Cleanup temp files
        try {
          if (fs.existsSync(tmpRoadsPath)) fs.unlinkSync(tmpRoadsPath);
          if (fs.existsSync(tmpBufferPath)) fs.unlinkSync(tmpBufferPath);
        } catch (cleanupErr) {}
      }

      // JS Fallback: Sampled points buffer
      if (!serviceArea && walkRoads.length > 0) {
        console.log(`- Calculating buffer using JS sampled points fallback...`);
        const reachedCoords = [];
        let counter = 0;
        const sampleRate = Math.max(1, Math.floor(distances.size / 2000));
        
        for (const key of distances.keys()) {
          counter++;
          if (counter % sampleRate === 0) {
            const node = graph.nodes.get(key);
            reachedCoords.push(turf.point(node.coord));
          }
        }

        if (reachedCoords.length > 0) {
          const pointsCollection = turf.featureCollection(reachedCoords);
          const buffered = turf.buffer(pointsCollection, modeConfig.bufferRadius, { units: 'kilometers' });
          
          try {
            serviceArea = turf.union(buffered);
          } catch (unionErr) {
            const simplified = buffered.features.map(f => turf.simplify(f, { tolerance: 0.0002, highQuality: false }));
            try {
              serviceArea = turf.union(turf.featureCollection(simplified));
            } catch (retryErr) {
              serviceArea = buffered;
            }
          }
        }
      }

      // Save service area polygon
      const finalServiceArea = serviceArea || turf.featureCollection([]);
      fs.writeFileSync(path.join(OUTPUT_DIR, `${catKey}-area-${modeKey}.geojson`), JSON.stringify(finalServiceArea));

      // Calculate coverage statistics
      console.log(`- Calculating district coverage percentages...`);
      let totalBmaArea = 0;
      let totalCoveredArea = 0;

      districts.features.forEach(district => {
        const code = district.properties?.DCODE || district.properties?.OBJECTID || district.properties?.name;
        const distArea = turf.area(district);
        totalBmaArea += distArea;

        let coveredArea = 0;
        if (serviceArea && distArea > 0) {
          try {
            // Simplify geometries to accelerate intersection
            const simpDistrict = turf.simplify(district, { tolerance: 0.0001, highQuality: false });
            const simpServiceArea = turf.simplify(serviceArea, { tolerance: 0.0001, highQuality: false });
            const intersection = turf.intersect(turf.featureCollection([simpDistrict, simpServiceArea]));
            if (intersection) {
              coveredArea = turf.area(intersection);
            }
          } catch (intersectErr) {
            // Fallback estimation
            let pointsInside = 0;
            const step = Math.max(1, Math.floor(walkRoads.length / 500));
            let totalChecked = 0;
            for (let i = 0; i < walkRoads.length; i += step) {
              const p = turf.point(walkRoads[i].coordinates[0]);
              if (turf.booleanPointInPolygon(p, district)) {
                pointsInside++;
              }
              totalChecked++;
            }
            const fraction = totalChecked > 0 ? pointsInside / totalChecked : 0;
            coveredArea = distArea * Math.min(1, fraction * 1.5);
          }
        }

        totalCoveredArea += coveredArea;
        const pct = distArea > 0 ? (coveredArea / distArea) * 100 : 0;
        stats.districts[code].coverage[`${catKey}_${modeKey}`] = Number(Math.min(100, pct).toFixed(2));
      });

      const overallPct = totalBmaArea > 0 ? (totalCoveredArea / totalBmaArea) * 100 : 0;
      stats.overall[catKey][modeKey] = Number(Math.min(100, overallPct).toFixed(2));
      console.log(`- Overall Bangkok coverage: ${stats.overall[catKey][modeKey]}%`);
    }
  }

  // Cleanup temp dir
  try {
    fs.rmdirSync(TMP_DIR);
  } catch (err) {}

  // Write stats file
  fs.writeFileSync(path.join(OUTPUT_DIR, 'stats.json'), JSON.stringify(stats, null, 2));
  console.log('\n[6/7] Saved statistics file stats.json.');

  console.log('\n[7/7] Precomputation completed successfully!');
  console.log(`Total execution time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  console.log(`Outputs generated in: ${OUTPUT_DIR}`);
}

main().catch(console.error);
