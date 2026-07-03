import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_CENTER, MAP_BOUNDS } from './data.js';

// Custom SVG Icons
const SVG_ICONS = {
  transit: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-inner">
      <rect x="4" y="3" width="16" height="16" rx="2"></rect>
      <path d="M4 11h16"></path>
      <path d="M12 3v8"></path>
      <path d="m8 19-2 3"></path>
      <path d="m16 19 2 3"></path>
    </svg>`,
  park: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-inner">
      <path d="M12 19V5g-7 6h7c5.2 0 7-3.8 7-3.8S17.2 11 12 11h7"></path>
    </svg>`,
  health: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-inner">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
    </svg>`,
  safety: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="icon-inner">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
    </svg>`,
  inspect: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none" class="icon-inner-inspect">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>`
};

function createDivIcon(type) {
  const svgMarkup = SVG_ICONS[type] || '';
  return L.divIcon({
    html: `<div class="custom-map-icon icon-${type}">${svgMarkup}</div>`,
    className: 'custom-div-icon-wrapper',
    iconSize: type === 'inspect' ? [36, 36] : [28, 28],
    iconAnchor: type === 'inspect' ? [18, 36] : [14, 14],
    popupAnchor: type === 'inspect' ? [0, -32] : [0, -10]
  });
}

export class AppMap {
  constructor(containerId, onLocationInspect, onMapMove) {
    this.containerId = containerId;
    this.onLocationInspect = onLocationInspect;
    this.onMapMove = onMapMove;
    this.map = null;
    this.inspectMarker = null;
    
    // Operational Layers
    this.layers = {
      allServiceAreas: L.layerGroup(),
      isochrones: L.layerGroup(),
      heatmapGrid: L.layerGroup(),
      roads: L.layerGroup(),
      transit: L.layerGroup(),
      parks: L.layerGroup(),
      health: L.layerGroup(),
      safety: L.layerGroup(),
      floodZones: L.layerGroup(),
      demographics: L.layerGroup()
    };
    
    this.routeGlowLine = null;
    this.routeMainLine = null;
    
    this.initMap();
  }

  initMap() {
    this.map = L.map(this.containerId, {
      center: MAP_CENTER,
      zoom: 13,
      minZoom: 10,
      maxZoom: 17,
      maxBounds: MAP_BOUNDS,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);

    // Tiles
    const darkMatter = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    });

    const positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    });

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });

    darkMatter.addTo(this.map);
    
    this.baseLayers = {
      'Dark': darkMatter,
      'Light': positron,
      'Streets': osm
    };

    // Add layers to map (in order defined in constructor)
    Object.values(this.layers).forEach(layer => layer.addTo(this.map));

    // Glowing Shortest Path Polylines
    this.routeGlowLine = L.polyline([], {
      color: '#6366f1',
      weight: 10,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.map);

    this.routeMainLine = L.polyline([], {
      color: '#a5b4fc',
      weight: 4.5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.map);

    // Click trigger
    this.map.on('click', (e) => {
      this.setInspectLocation(e.latlng);
    });

    this.map.on('moveend', () => {
      if (this.onMapMove) {
        this.onMapMove();
      }
    });
  }

  switchBaseMap(name) {
    if (this.baseLayers[name]) {
      Object.values(this.baseLayers).forEach(layer => this.map.removeLayer(layer));
      this.baseLayers[name].addTo(this.map);
    }
  }

  setInspectLocation(latlng) {
    if (this.inspectMarker) {
      this.inspectMarker.setLatLng(latlng);
    } else {
      this.inspectMarker = L.marker(latlng, {
        icon: createDivIcon('inspect'),
        draggable: true
      }).addTo(this.map);
      
      this.inspectMarker.on('dragend', () => {
        const pos = this.inspectMarker.getLatLng();
        this.onLocationInspect(pos);
      });
    }
    this.onLocationInspect(latlng);
  }

  clearInspectLocation() {
    if (this.inspectMarker) {
      this.map.removeLayer(this.inspectMarker);
      this.inspectMarker = null;
    }
    this.clearRoute();
  }

  updateAllServiceAreasLayer(geojson, activeCategory, bufferRanges) {
    this.layers.allServiceAreas.clearLayers();
    if (!geojson || !geojson.features || geojson.features.length === 0) {
      return;
    }

    // Filter by active category
    const filteredFeatures = geojson.features.filter(f => f.properties.category === activeCategory);

    // Filter by buffer ranges (5, 10, 15 minutes)
    const limitKm = bufferRanges[activeCategory === 'parks' ? 'park' : activeCategory === 'health' ? 'health' : activeCategory === 'safety' ? 'safety' : 'transit'];

    const displayFeatures = filteredFeatures.filter(f => {
      const r = f.properties.range;
      if (r === 'green') return limitKm >= 0.45;
      if (r === 'yellow') return limitKm >= 0.90;
      if (r === 'red') return limitKm >= 1.40;
      return true;
    });

    L.geoJSON({ type: "FeatureCollection", features: displayFeatures }, {
      style: (feature) => {
        const range = feature.properties.range;
        let color = '#ef4444'; // default red
        let fillOpacity = 0.03;
        
        if (range === 'green') {
          color = '#10b981';
          fillOpacity = 0.08;
        } else if (range === 'yellow') {
          color = '#f59e0b';
          fillOpacity = 0.05;
        }

        return {
          color: color,
          weight: 1.0,
          opacity: 0.3,
          dashArray: '2, 3',
          fillColor: color,
          fillOpacity: fillOpacity
        };
      }
    }).bindPopup((layer) => {
      const p = layer.feature.properties;
      return `<b>พื้นที่บริการ: ${p.amenityName}</b><br>${p.label}`;
    }).addTo(this.layers.allServiceAreas);

    // Make sure markers and route lines render above service areas
    if (this.layers.transit) this.layers.transit.eachLayer(l => { if (l.bringToFront) l.bringToFront(); });
    if (this.layers.parks) this.layers.parks.eachLayer(l => { if (l.bringToFront) l.bringToFront(); });
    if (this.layers.health) this.layers.health.eachLayer(l => { if (l.bringToFront) l.bringToFront(); });
    if (this.layers.safety) this.layers.safety.eachLayer(l => { if (l.bringToFront) l.bringToFront(); });
    if (this.inspectMarker) this.inspectMarker.bringToFront();
  }

  updateIsochronesLayer(geojson) {
    this.layers.isochrones.clearLayers();
    if (!geojson || !geojson.features || geojson.features.length === 0) {
      return;
    }

    L.geoJSON(geojson, {
      style: (feature) => {
        const range = feature.properties.range;
        let color = '#ef4444'; // default red
        let fillOpacity = 0.12;
        
        if (range === 'green') {
          color = '#10b981';
          fillOpacity = 0.28;
        } else if (range === 'yellow') {
          color = '#f59e0b';
          fillOpacity = 0.22;
        }

        return {
          color: color,
          weight: 1.5,
          opacity: 0.7,
          dashArray: '3, 4',
          fillColor: color,
          fillOpacity: fillOpacity
        };
      }
    }).bindPopup((layer) => {
      const p = layer.feature.properties;
      return `<b>${p.label}</b><br>ขอบเขตเวลาวิเคราะห์แบบโครงข่ายถนนจริง`;
    }).addTo(this.layers.isochrones);

    // Make sure markers and route lines render above isochrones
    if (this.layers.transit) this.layers.transit.eachLayer(l => { if (l.bringToFront) l.bringToFront(); });
    if (this.layers.parks) this.layers.parks.eachLayer(l => { if (l.bringToFront) l.bringToFront(); });
    if (this.layers.health) this.layers.health.eachLayer(l => { if (l.bringToFront) l.bringToFront(); });
    if (this.layers.safety) this.layers.safety.eachLayer(l => { if (l.bringToFront) l.bringToFront(); });
    if (this.inspectMarker) this.inspectMarker.bringToFront();
  }

  // Draw Shortest Path Route
  drawRoute(coordinates) {
    if (!coordinates || coordinates.length === 0) {
      this.clearRoute();
      return;
    }

    // Convert GeoJSON [lng, lat] to Leaflet [lat, lng]
    const latlngs = coordinates.map(c => [c[1], c[0]]);
    this.routeGlowLine.setLatLngs(latlngs);
    this.routeMainLine.setLatLngs(latlngs);
    
    // Bring route to front
    this.routeGlowLine.bringToFront();
    this.routeMainLine.bringToFront();
  }

  clearRoute() {
    this.routeGlowLine.setLatLngs([]);
    this.routeMainLine.setLatLngs([]);
  }

  // Viewport Hexagonal Grid Heatmap Rendering
  updateHeatmapGridLayer(geojson) {
    this.layers.heatmapGrid.clearLayers();
    if (!geojson || !geojson.features || geojson.features.length === 0) {
      return;
    }

    L.geoJSON(geojson, {
      style: (feature) => {
        const score = feature.properties.score || 0;
        let color = '#475569';
        let fillOpacity = 0.05; // very transparent default
        
        if (score > 0) {
          fillOpacity = 0.28;
          if (score >= 80) color = '#10b981'; // Green
          else if (score >= 50) color = '#f59e0b'; // Yellow (Amber)
          else color = '#ef4444'; // Red
        }

        return {
          color: 'rgba(255, 255, 255, 0.02)', // almost invisible edges
          weight: 0.8,
          fillColor: color,
          fillOpacity: fillOpacity
        };
      }
    }).bindPopup((layer) => {
      const p = layer.feature.properties;
      let rating = "เข้าถึงยาก (Poor)";
      if (p.score >= 80) rating = "ยอดเยี่ยม (Good)";
      else if (p.score >= 50) rating = "ปานกลาง (Moderate)";
      return `
        <div class="map-popup-card">
          <h4>ผลวิเคราะห์ตารางเข้าถึงเชิงพื้นที่</h4>
          <p><b>หมวดหมู่:</b> ${p.category === 'transit' ? '🚌 ขนส่งสาธารณะ' : p.category === 'parks' ? '🌳 สวนสาธารณะ' : p.category === 'health' ? '🏥 สาธารณสุข' : '🚨 ความปลอดภัย'}</p>
          <p><b>คะแนนดัชนี:</b> ${p.score} / 100</p>
          <p><b>ระดับการประเมิน:</b> ${rating}</p>
        </div>
      `;
    }).addTo(this.layers.heatmapGrid);
  }

  // Draw Backbone road network
  updateRoadsLayer(roadsGeojson) {
    this.layers.roads.clearLayers();
    L.geoJSON(roadsGeojson, {
      style: {
        color: '#475569',
        weight: 1.5,
        opacity: 0.3,
        dashArray: '3, 3'
      }
    }).addTo(this.layers.roads);
  }

  updateTransitLayer(geojson) {
    this.layers.transit.clearLayers();
    L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const m = L.marker(latlng, { icon: createDivIcon('transit') });
        m.bindPopup(`
          <div class="map-popup-card">
            <h4>${feature.properties.name}</h4>
            <p><b>ประเภท:</b> ${feature.properties.type}</p>
            <p><b>เส้นทาง:</b> ${feature.properties.lines ? feature.properties.lines.join(', ') : 'สายหลัก'}</p>
            <p><b>ผู้ใช้บริการ/วัน:</b> ${feature.properties.passengersDaily.toLocaleString()} เที่ยว</p>
          </div>
        `);
        return m;
      }
    }).addTo(this.layers.transit);
  }

  updateParksLayer(geojson) {
    this.layers.parks.clearLayers();
    L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const m = L.marker(latlng, { icon: createDivIcon('park') });
        m.bindPopup(`
          <div class="map-popup-card">
            <h4>${feature.properties.name}</h4>
            <p><b>ประเภท:</b> ${feature.properties.type}</p>
            <p><b>ขนาดพื้นที่:</b> ${feature.properties.areaRai} ไร่</p>
            <p><b>สิ่งอำนวยความสะดวก:</b> ${feature.properties.facilities.join(', ')}</p>
          </div>
        `);
        return m;
      }
    }).addTo(this.layers.parks);
  }

  updateHealthLayer(geojson) {
    this.layers.health.clearLayers();
    L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const m = L.marker(latlng, { icon: createDivIcon('health') });
        const specText = feature.properties.spec ? `<p><b>ความเชี่ยวชาญ:</b> ${feature.properties.spec}</p>` : '';
        m.bindPopup(`
          <div class="map-popup-card">
            <h4>${feature.properties.name}</h4>
            <p><b>ระดับบริการ:</b> ${feature.properties.type === 'Tertiary' ? 'โรงพยาบาลตติยภูมิ (ใหญ่)' : 'โรงพยาบาลทั่วไป'}</p>
            <p><b>ขนาด:</b> ${feature.properties.beds > 0 ? `${feature.properties.beds} เตียง` : 'ไม่มีเตียงรับผู้ป่วยค้างคืน'}</p>
            ${specText}
            <p><b>การบริหาร:</b> ${feature.properties.ownership}</p>
          </div>
        `);
        return m;
      }
    }).addTo(this.layers.health);
  }

  updateSafetyLayer(geojson, floodZonesGeojson) {
    this.layers.safety.clearLayers();
    this.layers.floodZones.clearLayers();

    L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const m = L.marker(latlng, { icon: createDivIcon('safety') });
        m.bindPopup(`
          <div class="map-popup-card">
            <h4>${feature.properties.name}</h4>
            <p><b>รถดับเพลิง:</b> ${feature.properties.fireTrucks} คัน</p>
            <p><b>เจ้าหน้าที่ประจำการ:</b> ${feature.properties.personnel} นาย</p>
          </div>
        `);
        return m;
      }
    }).addTo(this.layers.safety);

    L.geoJSON(floodZonesGeojson, {
      style: (feature) => {
        const color = feature.properties.riskLevel === 'High' ? '#ef4444' : '#f59e0b';
        return {
          color: color,
          fillColor: color,
          fillOpacity: 0.15,
          weight: 1.5,
          dashArray: '5, 5'
        };
      }
    }).bindPopup((layer) => {
      const p = layer.feature.properties;
      return `
        <div class="map-popup-card">
          <h4 class="text-error">${p.name}</h4>
          <p><b>ระดับความเสี่ยง:</b> ${p.riskLevel === 'High' ? '🔴 สูงมาก' : '🟡 ปานกลาง'}</p>
          <p><b>ระดับน้ำท่วมขังเฉลี่ย:</b> ${p.avgFloodDepthCm} ซม.</p>
          <p><b>ระยะเวลาระบายน้ำ:</b> ${p.drainTimeMins} นาที</p>
        </div>
      `;
    }).addTo(this.layers.floodZones);
  }

  updateDemographicsGrid(populationGrid) {
    this.layers.demographics.clearLayers();
    L.geoJSON(populationGrid, {
      pointToLayer: (feature, latlng) => {
        const pop = feature.properties.population;
        let radius = 4;
        let color = '#64748b';

        if (pop > 6000) { radius = 9; color = '#f43f5e'; } // rose-500
        else if (pop > 3500) { radius = 7; color = '#f59e0b'; } // amber-500
        else if (pop > 1500) { radius = 5; color = '#10b981'; } // emerald-500
        
        return L.circleMarker(latlng, {
          radius: radius,
          fillColor: color,
          fillOpacity: 0.2,
          color: color,
          weight: 0.8,
          opacity: 0.3
        }).bindPopup(`<b>จุดความหนาแน่นประชากรจริง (จำลองขนาด)</b><br>ประชากร: ${pop.toLocaleString()} คน`);
      }
    }).addTo(this.layers.demographics);
  }

  toggleLayerVisibility(layerName, visible) {
    if (this.layers[layerName]) {
      if (visible) {
        this.map.addLayer(this.layers[layerName]);
      } else {
        this.map.removeLayer(this.layers[layerName]);
      }
    }
  }

  getVisibleFeatures(geojsonCollection) {
    if (!geojsonCollection || !geojsonCollection.features) return [];
    
    const bounds = this.map.getBounds();
    return geojsonCollection.features.filter(feature => {
      const coords = feature.geometry.coordinates;
      const latlng = L.latLng(coords[1], coords[0]);
      return bounds.contains(latlng);
    });
  }

  getVisiblePopulationCollection(populationGridCollection) {
    const visibleFeatures = this.getVisibleFeatures(populationGridCollection);
    return {
      type: "FeatureCollection",
      features: visibleFeatures
    };
  }

  getViewportBBox() {
    const bounds = this.map.getBounds();
    return {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth()
    };
  }
}
