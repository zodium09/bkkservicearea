import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity,
  Bike,
  Building2,
  Compass,
  Download,
  Footprints,
  Layers,
  Layout,
  Loader2,
  MapPin,
  Moon,
  Play,
  Radar,
  RefreshCw,
  Route,
  Satellite,
  Search,
  Sun,
  Trash2,
} from 'lucide-react';
import './styles.css';

const BANGKOK_CENTER = [13.7563, 100.5018];
const BASEMAPS = {
  light: {
    name: 'OpenStreetMap Light',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  dark: {
    name: 'Carto Dark Matter',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  },
};

const BMA_LAYER_PALETTE = {
  0: '#ef4444',
  1: '#a16207',
  2: '#64748b',
  3: '#c026d3',
  4: '#78716c',
  5: '#f97316',
  6: '#7c3aed',
  7: '#0ea5e9',
  8: '#475569',
  9: '#f59e0b',
  10: '#0284c7',
  11: '#38bdf8',
  12: '#10b981',
  13: '#059669',
  14: '#16a34a',
};

const ACCESSIBILITY_PALETTE = {
  health: {
    primary: '#0d9488',
    light: '#2dd4bf',
    fill: '#0f766e',
    name: 'โรงพยาบาลและสาธารณสุข',
    emoji: '🏥',
  },
  education: {
    primary: '#ea580c',
    light: '#f97316',
    fill: '#c2410c',
    name: 'โรงเรียนและสถานศึกษา',
    emoji: '🏫',
  },
  parks: {
    primary: '#059669',
    light: '#10b981',
    fill: '#047857',
    name: 'สวนสาธารณะและพื้นที่สีเขียว',
    emoji: '🌳',
  },
  transit: {
    primary: '#7c3aed',
    light: '#a78bfa',
    fill: '#6d28d9',
    name: 'สถานีขนส่งสาธารณะ',
    emoji: '🚆',
  },
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createFacilityFromLatLng(latlng, index) {
  return {
    id: `svc-${Date.now()}-${index + 1}`,
    name: `จุดบริการ ${index + 1}`,
    type: 'custom',
    lat: Number(latlng.lat.toFixed(6)),
    lng: Number(latlng.lng.toFixed(6)),
  };
}

function App() {
  const mapRef = useRef(null);
  const activeToolRef = useRef('add');

  // Dual-mode toggle: 'dashboard' (Mode 1) or 'custom' (Mode 2)
  const [uiMode, setUiMode] = useState('dashboard');

  // Shared state
  const [basemapMode, setBasemapMode] = useState('dark');
  const [layerPanelOpen, setLayerPanelOpen] = useState(true);
  const [qgis, setQgis] = useState(null);
  const [basemapMeta, setBasemapMeta] = useState(null);
  const [layerCatalog, setLayerCatalog] = useState(null);
  const [visibleBmaLayers, setVisibleBmaLayers] = useState({});
  const [layerLoadStatus, setLayerLoadStatus] = useState({});
  const [message, setMessage] = useState('เมือง 15 นาที: เลือกชั้นข้อมูลและโหมดเพื่อวิเคราะห์การเข้าถึง');

  // Mode 1: 15-Minute City Dashboard State
  const [dashboardLayers, setDashboardLayers] = useState({
    health: true,
    education: false,
    parks: false,
    transit: false,
  });
  const [dashboardTravelMode, setDashboardTravelMode] = useState('walk'); // 'walk' or 'cycle'
  const [activeLeaderboardCategory, setActiveLeaderboardCategory] = useState('health');
  const [dashboardStats, setDashboardStats] = useState(null);
  const [districtsGeojson, setDistrictsGeojson] = useState(null);
  const [selectedDistrictCode, setSelectedDistrictCode] = useState(null);
  const [districtSearch, setDistrictSearch] = useState('');
  const [loadedAccessibilityData, setLoadedAccessibilityData] = useState({});
  const [loadingLayers, setLoadingLayers] = useState({});

  // Mode 2: Custom Service Area State
  const [facilities, setFacilities] = useState([]);
  const [travelMinutes, setTravelMinutes] = useState(15);
  const [speedKmh, setSpeedKmh] = useState(6);
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState('add');

  // Leaflet Layer References
  const layersRef = useRef({
    basemap: null,
    bma: {},
    districts: null,
    accessibility: {}, // category-mode -> L.geoJSON
    pois: {},         // category -> L.geoJSON
    customArea: null,
    customRoads: null,
    customPoints: null,
  });

  // Fetch initial data
  useEffect(() => {
    fetch('/api/qgis/status').then((r) => r.json()).then(setQgis).catch(() => setQgis({ found: false }));
    fetch('/api/basemap/metadata').then((r) => r.json()).then(setBasemapMeta).catch(() => null);
    fetch('/api/processed-layers/catalog').then((r) => r.json()).then(setLayerCatalog).catch(() => null);
    
    // Fetch precomputed stats
    fetch('/api/accessibility/stats')
      .then((r) => r.json())
      .then(setDashboardStats)
      .catch((e) => console.error('Failed to load accessibility stats:', e));
      
    // Fetch districts boundary
    fetch('/api/districts')
      .then((r) => r.json())
      .then(setDistrictsGeojson)
      .catch((e) => console.error('Failed to load districts boundary:', e));
  }, []);

  // Update active tool ref
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  // Load accessibility layer GeoJSON on demand
  const loadAccessibilityLayer = async (category, type) => {
    const key = `${category}-${type}`;
    if (loadedAccessibilityData[key]) return loadedAccessibilityData[key];
    
    setLoadingLayers(prev => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`/api/accessibility/layer/${category}/${type}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLoadedAccessibilityData(prev => ({
        ...prev,
        [key]: data
      }));
      setLoadingLayers(prev => ({ ...prev, [key]: false }));
      return data;
    } catch (e) {
      console.error(`Failed to load accessibility layer ${key}:`, e);
      setLoadingLayers(prev => ({ ...prev, [key]: false }));
      return null;
    }
  };

  // Trigger loading when dashboard layers are toggled
  useEffect(() => {
    if (uiMode !== 'dashboard') return;
    
    Object.entries(dashboardLayers).forEach(([category, visible]) => {
      if (visible) {
        loadAccessibilityLayer(category, `area-${dashboardTravelMode}`);
        loadAccessibilityLayer(category, 'pois');
      }
    });
  }, [uiMode, dashboardLayers, dashboardTravelMode]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map('map', {
      zoomControl: false,
      preferCanvas: true,
    }).setView(BANGKOK_CENTER, 11);

    // Create custom panes for proper layering
    map.createPane('bmaData');
    map.createPane('districts');
    map.createPane('analysisArea');
    map.createPane('analysisRoads');
    map.createPane('servicePoints');
    
    map.getPane('bmaData').style.zIndex = 410;
    map.getPane('districts').style.zIndex = 415;
    map.getPane('analysisArea').style.zIndex = 430;
    map.getPane('analysisRoads').style.zIndex = 440;
    map.getPane('servicePoints').style.zIndex = 455;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Map click handler for Custom Points mode
    map.on('click', (event) => {
      if (activeToolRef.current !== 'add') return;
      
      // Get current UI Mode inside the event using class/id checks if state isn't synced
      const isCustomMode = document.querySelector('.mode-tabs button.is-active')?.textContent.includes('วิเคราะห์จุดบริการ');
      if (!isCustomMode) return;

      setFacilities((items) => {
        const next = createFacilityFromLatLng(event.latlng, items.length);
        setMessage(`เพิ่ม ${next.name} แล้ว (คลิกปุ่มวิเคราะห์ด้านขวา)`);
        setAnalysis(null);
        return [...items, next];
      });
    });

    mapRef.current = map;
  }, []);

  // Update Basemap Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.basemap?.remove();
    const basemap = BASEMAPS[basemapMode];
    layersRef.current.basemap = L.tileLayer(basemap.url, {
      attribution: basemap.attribution,
      maxZoom: 20,
      className: `leaflet-basemap-${basemapMode}`,
    }).addTo(map);
  }, [basemapMode]);

  // Sync/Redraw Map Layers (Dashboard & Custom modes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // --- 1. Clean Up Old Layers ---
    layersRef.current.districts?.remove();
    layersRef.current.districts = null;

    Object.keys(layersRef.current.accessibility).forEach(key => {
      layersRef.current.accessibility[key]?.remove();
      delete layersRef.current.accessibility[key];
    });
    Object.keys(layersRef.current.pois).forEach(key => {
      layersRef.current.pois[key]?.remove();
      delete layersRef.current.pois[key];
    });

    layersRef.current.customArea?.remove();
    layersRef.current.customArea = null;
    layersRef.current.customRoads?.remove();
    layersRef.current.customRoads = null;
    layersRef.current.customPoints?.remove();
    layersRef.current.customPoints = null;

    // --- 2. Redraw layers based on UI Mode ---
    if (uiMode === 'dashboard') {
      // Draw district boundaries
      if (districtsGeojson && districtsGeojson.type === 'FeatureCollection') {
        layersRef.current.districts = L.geoJSON(districtsGeojson, {
          pane: 'districts',
          style: (feature) => {
            const code = feature.properties?.DCODE || feature.properties?.OBJECTID || feature.properties?.name;
            const isSelected = selectedDistrictCode === code;
            return {
              color: isSelected ? '#38bdf8' : basemapMode === 'dark' ? '#334155' : '#94a3b8',
              weight: isSelected ? 3.5 : 1,
              opacity: isSelected ? 1 : 0.6,
              fillColor: isSelected ? '#38bdf8' : 'transparent',
              fillOpacity: isSelected ? 0.15 : 0,
            };
          },
          onEachFeature: (feature, layer) => {
            const name = feature.properties?.DNAME || feature.properties?.DISTRICT_N || feature.properties?.NAME || 'เขต';
            const code = feature.properties?.DCODE || feature.properties?.OBJECTID || feature.properties?.name;
            
            // Get coverage percentage for active leaderboard category
            let pctText = 'ไม่มีข้อมูล';
            if (dashboardStats && dashboardStats.districts[code]) {
              const score = dashboardStats.districts[code].coverage[`${activeLeaderboardCategory}_${dashboardTravelMode}`];
              if (score !== undefined) {
                pctText = `${score}%`;
              }
            }

            layer.bindTooltip(`<strong>เขต${name}</strong><br>เข้าถึง ${ACCESSIBILITY_PALETTE[activeLeaderboardCategory].name}: ${pctText}`, {
              sticky: true,
              className: 'district-tooltip'
            });

            layer.on({
              mouseover: (e) => {
                if (selectedDistrictCode !== code) {
                  e.target.setStyle({
                    color: '#67e8f9',
                    weight: 2,
                    fillColor: '#67e8f9',
                    fillOpacity: 0.05
                  });
                }
              },
              mouseout: (e) => {
                if (selectedDistrictCode !== code) {
                  layersRef.current.districts?.resetStyle(e.target);
                }
              },
              click: (e) => {
                setSelectedDistrictCode(code);
                map.fitBounds(e.target.getBounds(), { padding: [40, 40] });
              }
            });
          }
        }).addTo(map);

        // If a district was selected, let's keep it highlighted
        if (selectedDistrictCode) {
          const matchLayer = Object.values(layersRef.current.districts._layers).find(
            (l) => {
              const code = l.feature.properties?.DCODE || l.feature.properties?.OBJECTID || l.feature.properties?.name;
              return code === selectedDistrictCode;
            }
          );
          if (matchLayer) {
            matchLayer.bringToFront();
          }
        }
      }

      // Draw Accessibility Polygons and POIs
      Object.entries(dashboardLayers).forEach(([category, visible]) => {
        if (!visible) return;

        const config = ACCESSIBILITY_PALETTE[category];
        const areaKey = `${category}-area-${dashboardTravelMode}`;
        const poisKey = `${category}-pois`;

        // Render Service Area Polygons
        const areaData = loadedAccessibilityData[areaKey];
        if (areaData) {
          layersRef.current.accessibility[areaKey] = L.geoJSON(areaData, {
            pane: 'analysisArea',
            style: {
              color: config.primary,
              weight: 1.5,
              opacity: 0.85,
              fillColor: config.light,
              fillOpacity: basemapMode === 'dark' ? 0.28 : 0.22,
            }
          }).addTo(map);
        }

        // Render POI point markers
        const poisData = loadedAccessibilityData[poisKey];
        if (poisData) {
          layersRef.current.pois[poisKey] = L.geoJSON(poisData, {
            pane: 'servicePoints',
            pointToLayer: (_, latlng) => {
              return L.circleMarker(latlng, {
                radius: 4.5,
                weight: 1,
                color: '#ffffff',
                opacity: 0.95,
                fillColor: config.primary,
                fillOpacity: 0.95,
              });
            },
            onEachFeature: (feature, layer) => {
              layer.bindTooltip(`<strong>${escapeHtml(feature.properties.name)}</strong><br>เขต${escapeHtml(feature.properties.district)}`, {
                direction: 'top'
              });
            }
          }).addTo(map);
        }
      });

    } else if (uiMode === 'custom') {
      // Custom route-analysis rendering
      if (facilities.length > 0) {
        layersRef.current.customPoints = L.layerGroup(
          facilities.map((facility) =>
            L.circleMarker([facility.lat, facility.lng], {
              pane: 'servicePoints',
              radius: 8,
              weight: 3,
              color: basemapMode === 'dark' ? '#f8fafc' : '#0f172a',
              fillColor: '#38bdf8',
              fillOpacity: 0.95,
            }).bindPopup(`<strong>${escapeHtml(facility.name)}</strong><br>${facility.lat}, ${facility.lng}`),
          ),
        ).addTo(map);
      }

      if (analysis) {
        layersRef.current.customArea = L.geoJSON(analysis.serviceArea, {
          pane: 'analysisArea',
          style: {
            color: '#0f766e',
            weight: 2,
            opacity: basemapMode === 'dark' ? 0.95 : 0.75,
            fillColor: basemapMode === 'dark' ? '#2dd4bf' : '#5eead4',
            fillOpacity: basemapMode === 'dark' ? 0.26 : 0.2,
          },
        }).addTo(map);

        layersRef.current.customRoads = L.geoJSON(analysis.reachableRoads, {
          pane: 'analysisRoads',
          style: {
            color: basemapMode === 'dark' ? '#22d3ee' : '#0891b2',
            weight: basemapMode === 'dark' ? 4.5 : 3.8,
            opacity: basemapMode === 'dark' ? 0.98 : 0.9,
          },
        }).addTo(map);

        // Autofit map to custom analysis area
        const fitLayer = layersRef.current.customRoads.getBounds().isValid() 
          ? layersRef.current.customRoads 
          : layersRef.current.customArea;
        if (fitLayer.getBounds().isValid()) {
          map.fitBounds(fitLayer.getBounds(), { padding: [32, 32] });
        }
      }
    }
  }, [uiMode, districtsGeojson, loadedAccessibilityData, dashboardLayers, dashboardTravelMode, activeLeaderboardCategory, selectedDistrictCode, basemapMode, facilities, analysis]);

  // Sync BMA catalog layers (Original background layers)
  const activeBmaLayerIds = useMemo(
    () => Object.entries(visibleBmaLayers).filter(([, visible]) => visible).map(([id]) => Number(id)),
    [visibleBmaLayers],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layerCatalog) return;

    layersRef.current.bma ||= {};
    let cancelled = false;

    const layerById = new Map(layerCatalog.layers.map((layer) => [layer.id, layer]));
    const removeLayer = (id) => {
      layersRef.current.bma?.[id]?.remove();
      delete layersRef.current.bma?.[id];
    };

    Object.keys(layersRef.current.bma || {}).forEach((id) => {
      if (!activeBmaLayerIds.includes(Number(id))) removeLayer(id);
    });

    async function loadVisibleLayer(layerId) {
      const layer = layerById.get(layerId);
      if (!layer) return;
      const bounds = map.getBounds();
      const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',');
      setLayerLoadStatus((status) => ({ ...status, [layerId]: { loading: true, returned: status[layerId]?.returned || 0 } }));
      
      try {
        const query = `bbox=${encodeURIComponent(bbox)}&maxFeatures=3000&pageSize=1000`;
        let response = await fetch(`/api/processed-layers/${layerId}/query?${query}`);
        let data = await response.json();
        if (!response.ok && response.status === 404) {
          response = await fetch(`/api/layers/${layerId}/query?${query}`);
          data = await response.json();
        }
        if (!response.ok) throw new Error(data.error || 'Layer load failed');
        if (cancelled) return;

        removeLayer(layerId);
        
        // style function
        const style = styleForBmaLayer(layer);
        const geoJsonLayer = L.geoJSON(data, {
          pane: 'bmaData',
          style: () => style,
          pointToLayer: (_, latlng) => L.circleMarker(latlng, { ...style, pane: 'bmaData' }),
          onEachFeature: (feature, featureLayer) => {
            // Popup
            const entries = Object.entries(feature.properties || {})
              .filter(([, value]) => value !== null && value !== undefined && value !== '')
              .slice(0, 6);
            const rows = entries
              .map(([key, val]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(val)}</td></tr>`)
              .join('');
            featureLayer.bindPopup(`<strong>${escapeHtml(layer.name)}</strong><table>${rows}</table>`);
          },
        }).addTo(map);

        layersRef.current.bma[layerId] = geoJsonLayer;
        setLayerLoadStatus((status) => ({
          ...status,
          [layerId]: {
            loading: false,
            returned: data.returned,
            exceeded: data.exceededTransferLimit,
            source: data.source || 'live-service',
          },
        }));
      } catch (error) {
        if (!cancelled) {
          setLayerLoadStatus((status) => ({
            ...status,
            [layerId]: { loading: false, returned: 0, error: error.message },
          }));
        }
      }
    }

    function styleForBmaLayer(layer) {
      const color = BMA_LAYER_PALETTE[layer.id] || '#0f766e';
      const darkBoost = basemapMode === 'dark';
      if (layer.geometryType === 'esriGeometryPolygon') {
        return {
          color,
          weight: darkBoost ? 2 : 1.5,
          opacity: darkBoost ? 0.92 : 0.78,
          fillColor: color,
          fillOpacity: darkBoost ? 0.18 : 0.12,
        };
      }
      if (layer.geometryType === 'esriGeometryPolyline') {
        return {
          color,
          weight: darkBoost ? 2.6 : 2,
          opacity: darkBoost ? 0.95 : 0.82,
        };
      }
      return {
        radius: darkBoost ? 5 : 4,
        weight: 1.5,
        color: darkBoost ? '#f8fafc' : '#0f172a',
        fillColor: color,
        fillOpacity: 0.9,
      };
    }

    const refreshActiveLayers = () => {
      activeBmaLayerIds.forEach(loadVisibleLayer);
    };

    refreshActiveLayers();
    map.on('moveend zoomend', refreshActiveLayers);

    return () => {
      cancelled = true;
      map.off('moveend zoomend', refreshActiveLayers);
    };
  }, [activeBmaLayerIds.join(','), basemapMode, layerCatalog]);

  // Mode 2: Run dynamic route analysis
  async function runCustomAnalysis() {
    if (!facilities.length) {
      setMessage('เพิ่มจุดบริการก่อนวิเคราะห์: คลิกบนแผนที่ หรือใช้ปุ่มด้านขวา');
      return;
    }

    setBusy(true);
    setMessage(`กำลังคำนวณโครงข่ายเข้าถึงใน ${travelMinutes} นาที...`);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facilities, travelMinutes, speedKmh }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysis(data);
      setMessage(`วิเคราะห์เครือข่าย ${travelMinutes} นาทีเสร็จสมบูรณ์`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function clearCustomAnalysis() {
    setFacilities([]);
    setAnalysis(null);
    setMessage('ล้างข้อมูลเรียบร้อย คลิกบนแผนที่เพื่อเพิ่มจุดวิเคราะห์ใหม่');
  }

  function addFacilityAtMapCenter() {
    const map = mapRef.current;
    if (!map) return;
    setFacilities((items) => {
      const next = createFacilityFromLatLng(map.getCenter(), items.length);
      setMessage(`เพิ่ม ${next.name} ที่กึ่งกลางแผนที่`);
      setAnalysis(null);
      return [...items, next];
    });
  }

  // Dashboard calculations for Sidebar
  const selectedCategoryStats = useMemo(() => {
    if (!dashboardStats) return null;
    return {
      overall: dashboardStats.overall[activeLeaderboardCategory]?.[dashboardTravelMode] || 0,
      name: ACCESSIBILITY_PALETTE[activeLeaderboardCategory].name,
      emoji: ACCESSIBILITY_PALETTE[activeLeaderboardCategory].emoji,
    };
  }, [dashboardStats, activeLeaderboardCategory, dashboardTravelMode]);

  const sortedDistrictRankings = useMemo(() => {
    if (!dashboardStats || !districtsGeojson) return [];
    
    const key = `${activeLeaderboardCategory}_${dashboardTravelMode}`;
    return Object.values(dashboardStats.districts)
      .map(d => ({
        code: d.code,
        name: d.name,
        score: d.coverage[key] || 0
      }))
      .filter(d => d.name.includes(districtSearch.trim()))
      .sort((a, b) => b.score - a.score);
  }, [dashboardStats, districtsGeojson, activeLeaderboardCategory, dashboardTravelMode, districtSearch]);

  const handleDistrictLeaderboardClick = (districtCode) => {
    setSelectedDistrictCode(districtCode);
    const map = mapRef.current;
    if (!map || !layersRef.current.districts) return;
    
    // Find the feature layer in leaflet districts group and zoom to it
    const layer = Object.values(layersRef.current.districts._layers).find(
      (l) => {
        const code = l.feature.properties?.DCODE || l.feature.properties?.OBJECTID || l.feature.properties?.name;
        return code === districtCode;
      }
    );
    if (layer) {
      map.fitBounds(layer.getBounds(), { padding: [40, 40] });
    }
  };

  const getDistrictScoreBadgeClass = (score) => {
    if (score >= 60) return 'badge-high';
    if (score >= 25) return 'badge-medium';
    return 'badge-low';
  };

  return (
    <main className={`app-shell ${basemapMode === 'dark' ? 'is-dark-map' : 'is-light-map'}`}>
      
      {/* MAP STAGE */}
      <section className="map-stage">
        <div id="map" aria-label="Bangkok service area map" />
        
        {/* Map float toolbar */}
        <div className="map-toolbar" aria-label="Map tools">
          {uiMode === 'custom' && (
            <button className={activeTool === 'add' ? 'is-active' : ''} onClick={() => setActiveTool('add')} title="เพิ่มจุดบริการ">
              <MapPin size={19} />
            </button>
          )}
          <button onClick={() => {
            setSelectedDistrictCode(null);
            mapRef.current?.setView(BANGKOK_CENTER, 11);
          }} title="กลับสู่มุมมองกรุงเทพฯ">
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => setBasemapMode((mode) => (mode === 'light' ? 'dark' : 'light'))}
            title={basemapMode === 'light' ? 'แผนที่ธีมมืด' : 'แผนที่ธีมสว่าง'}
          >
            {basemapMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {uiMode === 'custom' && (
            <button onClick={clearCustomAnalysis} title="ล้างข้อมูลวิเคราะห์">
              <Trash2 size={18} />
            </button>
          )}
        </div>
        <div className="map-mode-badge">
          {uiMode === 'dashboard' ? '📊 โหมดเมือง 15 นาที' : '📍 โหมดวิเคราะห์กำหนดเอง'}
        </div>
      </section>

      {/* CONTROL SIDEBAR */}
      <aside className="control-panel">
        
        {/* BRAND ROW */}
        <div className="brand-row">
          <div className="brand-mark">
            <Radar size={25} />
          </div>
          <div>
            <p className="eyebrow">Bangkok GIS Dashboard</p>
            <h1>เมือง 15 นาที (15-Min City)</h1>
          </div>
        </div>

        {/* DUAL MODE TABS */}
        <div className="mode-tabs">
          <button 
            className={uiMode === 'dashboard' ? 'is-active' : ''} 
            onClick={() => {
              setUiMode('dashboard');
              setMessage('เมือง 15 นาที: เลือกชั้นข้อมูลและโหมดเพื่อวิเคราะห์การเข้าถึง');
            }}
          >
            <Layout size={16} /> เมือง 15 นาที
          </button>
          <button 
            className={uiMode === 'custom' ? 'is-active' : ''} 
            onClick={() => {
              setUiMode('custom');
              setMessage('คลิกบนแผนที่เพื่อปักหมุดจุดบริการของคุณ');
            }}
          >
            <Compass size={16} /> วิเคราะห์จุดบริการ
          </button>
        </div>

        {/* STATUS STRIP */}
        <div className="status-strip">
          <span className={qgis?.found ? 'dot ok' : 'dot warn'} />
          <span>{qgis?.found ? 'QGIS Server Online' : 'ระบบใช้ JS network fallback'}</span>
        </div>

        {/* ============================================================== */}
        {/* MODE 1: 15-MINUTE CITY DASHBOARD CONTENT */}
        {/* ============================================================== */}
        {uiMode === 'dashboard' && (
          <>
            {/* TRAVEL MODE & ACCESSIBILITY LAYERS CONTROL */}
            <section className="workflow-card">
              <div className="section-header">
                <h2>1. โหมดและเวลาเดินทาง</h2>
              </div>
              <div className="travel-mode-selector">
                <button
                  className={dashboardTravelMode === 'walk' ? 'is-active' : ''}
                  onClick={() => setDashboardTravelMode('walk')}
                >
                  <Footprints size={18} />
                  <span>เดิน (15 นาที)</span>
                </button>
                <button
                  className={dashboardTravelMode === 'cycle' ? 'is-active' : ''}
                  onClick={() => setDashboardTravelMode('cycle')}
                >
                  <Bike size={18} />
                  <span>จักรยาน (15 นาที)</span>
                </button>
              </div>

              <div className="section-header" style={{ marginTop: '18px' }}>
                <h2>2. ชั้นข้อมูลความสะดวก (เลือกเพื่อแสดงบนแผนที่)</h2>
              </div>
              <div className="accessibility-layers-list">
                {Object.entries(ACCESSIBILITY_PALETTE).map(([key, config]) => {
                  const isVisible = dashboardLayers[key];
                  const isActive = activeLeaderboardCategory === key;
                  const isLayerLoading = loadingLayers[`${key}-area-${dashboardTravelMode}`] || loadingLayers[`${key}-pois`];
                  
                  return (
                    <div 
                      key={key} 
                      className={`acc-layer-item ${isActive ? 'is-active-row' : ''}`}
                      onClick={() => setActiveLeaderboardCategory(key)}
                      title="คลิกเพื่อเลือกดูตารางการจัดอันดับเขตด้านล่าง"
                    >
                      <label className="acc-layer-label" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={(e) => {
                            setDashboardLayers(prev => ({ ...prev, [key]: e.target.checked }));
                          }}
                        />
                        <span className="layer-dot" style={{ backgroundColor: config.primary }} />
                        <span className="layer-emoji">{config.emoji}</span>
                        <span className="layer-title">{config.name}</span>
                      </label>
                      
                      {isLayerLoading ? (
                        <Loader2 className="spin" size={14} style={{ color: '#64748b' }} />
                      ) : (
                        <div className="active-indicator-tag" style={{ opacity: isActive ? 1 : 0 }}>
                          Active Rank
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* OVERALL METRIC COVERAGE */}
            {selectedCategoryStats && (
              <section className="result-card coverage-summary-card">
                <div className="result-head">
                  <div>
                    <span>อัตราความครอบคลุมของกรุงเทพฯ</span>
                    <h2>{selectedCategoryStats.emoji} {selectedCategoryStats.name}</h2>
                  </div>
                  <strong style={{ backgroundColor: ACCESSIBILITY_PALETTE[activeLeaderboardCategory].light + '33', color: ACCESSIBILITY_PALETTE[activeLeaderboardCategory].fill }}>
                    {selectedCategoryStats.overall}%
                  </strong>
                </div>
                
                {/* Visual Progress Bar */}
                <div className="coverage-progress-bar-bg">
                  <div 
                    className="coverage-progress-bar-fill" 
                    style={{ 
                      width: `${selectedCategoryStats.overall}%`,
                      backgroundColor: ACCESSIBILITY_PALETTE[activeLeaderboardCategory].primary
                    }} 
                  />
                </div>
                <p className="coverage-description-text">
                  ประชากรในพื้นที่ระบายสีสามารถเดินทางด้วย{' '}
                  <strong>{dashboardTravelMode === 'walk' ? 'เท้า' : 'จักรยาน'}</strong>{' '}
                  ไปถึง{selectedCategoryStats.name}ที่ใกล้ที่สุดได้ภายใน 15 นาที
                </p>
              </section>
            )}

            {/* DISTRICT LEADERBOARD */}
            <section className="workflow-card district-ranking-card">
              <div className="district-ranking-header">
                <h2>จัดอันดับความครอบคลุมตามเขตการปกครอง</h2>
                <span>{sortedDistrictRankings.length} เขต</span>
              </div>
              
              {/* District Search */}
              <div className="search-box-container">
                <Search size={16} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="ค้นหาเขตในกรุงเทพฯ..." 
                  value={districtSearch}
                  onChange={(e) => setDistrictSearch(e.target.value)}
                />
                {districtSearch && (
                  <button className="clear-search-btn" onClick={() => setDistrictSearch('')}>×</button>
                )}
              </div>

              {/* Leaderboard List */}
              <div className="district-leaderboard-list">
                {sortedDistrictRankings.map((district, index) => {
                  const isSelected = selectedDistrictCode === district.code;
                  return (
                    <div 
                      key={district.code}
                      className={`leaderboard-item ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => handleDistrictLeaderboardClick(district.code)}
                    >
                      <span className="rank-num">#{index + 1}</span>
                      <span className="district-name">เขต{district.name}</span>
                      <span className={`score-badge ${getDistrictScoreBadgeClass(district.score)}`}>
                        {district.score}%
                      </span>
                    </div>
                  );
                })}
                {sortedDistrictRankings.length === 0 && (
                  <p className="empty-search-text">ไม่พบเขตที่ค้นหา</p>
                )}
              </div>
              {selectedDistrictCode && (
                <button 
                  className="reset-district-selection-btn"
                  onClick={() => setSelectedDistrictCode(null)}
                >
                  ล้างการเลือกเขต
                </button>
              )}
            </section>
          </>
        )}

        {/* ============================================================== */}
        {/* MODE 2: CUSTOM SERVICE AREA ANALYSIS CONTENT */}
        {/* ============================================================== */}
        {uiMode === 'custom' && (
          <>
            {/* WORKFLOW CARD */}
            <section className="workflow-card">
              <div className="workflow-head">
                <div>
                  <span>ขั้นตอนที่ 1</span>
                  <h2>กำหนดจุดบริการที่ต้องการวิเคราะห์</h2>
                </div>
                <strong>{facilities.length} จุด</strong>
              </div>

              <div className="compact-empty" hidden={facilities.length > 0}>
                <MapPin size={18} />
                <span>คลิกบนแผนที่เพื่อสร้างจุดบริการ</span>
                <button type="button" onClick={addFacilityAtMapCenter}>
                  สร้างจุดกลางแผนที่
                </button>
              </div>

              {facilities.length > 0 && (
                <div className="facility-chips">
                  {facilities.map((facility, idx) => (
                    <span key={facility.id} className="poi-chip">
                      {facility.name}
                      <button 
                        className="delete-chip-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFacilities(prev => prev.filter(f => f.id !== facility.id));
                          setAnalysis(null);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="time-control" style={{ marginTop: '20px' }}>
                <div className="section-title compact-title">
                  <Route size={18} />
                  <h2>เวลาในการเดินทางเข้าถึง</h2>
                  <strong>{travelMinutes} นาที</strong>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={travelMinutes}
                  onChange={(event) => setTravelMinutes(Number(event.target.value))}
                />
                <div className="range-row">
                  <span>5 นาที</span>
                  position: relative;
                  <strong>{travelMinutes} นาที</strong>
                  <span>60 นาที</span>
                </div>
                
                <div className="speed-control" style={{ marginTop: '16px' }}>
                  <label htmlFor="speed-kmh">ความเร็วเฉลี่ยเดินทาง</label>
                  <div>
                    <input
                      id="speed-kmh"
                      type="number"
                      min="1"
                      max="120"
                      step="1"
                      value={speedKmh}
                      onChange={(event) => setSpeedKmh(Number(event.target.value))}
                    />
                    <span>กม./ชม.</span>
                  </div>
                </div>
              </div>

              <button className="primary-action" onClick={runCustomAnalysis} disabled={busy} style={{ marginTop: '20px' }}>
                {busy ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
                คำนวณเครือข่ายเข้าถึง
              </button>
            </section>

            {/* RESULTS DETAILS */}
            {analysis ? (
              <section className="result-card">
                <div className="result-head">
                  <div>
                    <span>ผลลัพธ์บริการตามจริง</span>
                    <h2>วิเคราะห์ระยะเข้าถึงโครงข่าย</h2>
                  </div>
                  <strong>{analysis.metrics.reachedRoadLengthKm.toLocaleString()} กม.</strong>
                </div>
                <div className="action-row">
                  <button onClick={() => downloadJson('bangkok-custom-service-area.geojson', analysis.serviceArea)}>
                    ส่งออก Area
                  </button>
                  <button onClick={() => downloadJson('bangkok-custom-reachable-roads.geojson', analysis.reachableRoads)}>
                    ส่งออก Roads
                  </button>
                </div>
                <div className="result-metrics">
                  <span>จำนวนถนนที่โหลด: {analysis.metrics.roadFeaturesLoaded.toLocaleString()}</span>
                  <span>ระยะทางเครือข่ายสูงสุด: {Math.round(analysis.metrics.distanceMeters).toLocaleString()} ม.</span>
                  <span>ค่าเฉลี่ยสแนปถนน: {analysis.metrics.averageSnapDistanceMeters.toLocaleString()} ม.</span>
                </div>
                {analysis.intersectingDistricts?.length > 0 && (
                  <div className="districts compact-districts">
                    <h2>เขตพื้นที่อยู่ในขอบเขตบริการ ({analysis.intersectingDistricts.length} เขต)</h2>
                    <div>
                      {analysis.intersectingDistricts.slice(0, 15).map((district) => (
                        <span key={`${district.id}-${district.name}`}>{district.name}</span>
                      ))}
                      {analysis.intersectingDistricts.length > 15 && <span>...และอีก {analysis.intersectingDistricts.length - 15} เขต</span>}
                    </div>
                  </div>
                )}
              </section>
            ) : (
              <section className="muted-result">
                <Download size={18} />
                <span>ผลลัพธ์และแผนที่เข้าถึงจะแสดงหลังจากรันการวิเคราะห์</span>
              </section>
            )}
          </>
        )}

        {/* OTHER BMA LAYERS TOGGLE DRAWER */}
        <section className={`layer-drawer ${layerPanelOpen ? 'is-open' : ''}`} style={{ marginTop: 'auto' }}>
          <button className="layer-drawer-toggle" onClick={() => setLayerPanelOpen((open) => !open)}>
            <span><Layers size={18} /> ชั้นข้อมูลพื้นฐานกทม.</span>
            <strong>{activeBmaLayerIds.length} เปิดอยู่ {layerPanelOpen ? '−' : '+'}</strong>
          </button>

          {layerPanelOpen && (
            <div className="layer-drawer-body">
              <div className="layer-source-grid">
                <div className="layer-source-item">
                  <Satellite size={16} />
                  <div>
                    <span>Basemap</span>
                    <strong>{BASEMAPS[basemapMode].name}</strong>
                  </div>
                </div>
                <div className="layer-source-item">
                  <Building2 size={16} />
                  <div>
                    <span>ข้อมูลฐาน</span>
                    <strong>{layerCatalog?.prepared ? 'QGIS BMA CityMap' : 'Live MapServer'}</strong>
                  </div>
                </div>
                <div className="layer-source-item">
                  <Activity size={16} />
                  <div>
                    <span>ถนนโครงข่าย</span>
                    <strong>Layer 7 (เส้นกึ่งกลางถนน)</strong>
                  </div>
                </div>
              </div>

              <div className="layer-actions">
                <button onClick={() => {
                  const next = {};
                  (layerCatalog?.layers || []).forEach(l => next[l.id] = true);
                  setVisibleBmaLayers(next);
                }} disabled={!layerCatalog}>เปิดทั้งหมด</button>
                <button onClick={() => setVisibleBmaLayers({})} disabled={!layerCatalog}>ปิดทั้งหมด</button>
              </div>

              <div className="dimension-list">
                {(layerCatalog?.dimensions || []).map((dimension) => (
                  <details key={dimension.name}>
                    <summary>
                      <span>{dimension.name}</span>
                      <small>{dimension.layers.length} layers</small>
                    </summary>
                    <div className="layer-toggle-list">
                      {dimension.layers.map((layer) => {
                        const status = layerLoadStatus[layer.id];
                        return (
                          <label className="layer-toggle" key={layer.id}>
                            <input
                              type="checkbox"
                              checked={Boolean(visibleBmaLayers[layer.id])}
                              onChange={() => {
                                setVisibleBmaLayers(prev => ({ ...prev, [layer.id]: !prev[layer.id] }));
                              }}
                            />
                            <span className="layer-swatch" style={{ backgroundColor: BMA_LAYER_PALETTE[layer.id] || '#0f766e' }} />
                            <span className="layer-name">{layer.name}</span>
                            <small>
                              {status?.loading ? 'loading' : status ? `${status.returned.toLocaleString()}${status.exceeded ? '+' : ''}` : layer.geometryType?.replace('esriGeometry', '')}
                            </small>
                          </label>
                        );
                      })}
                    </div>
                  </details>
                ))}
                {!layerCatalog && <p className="empty">กำลังโหลด catalog ผังเมือง...</p>}
              </div>
            </div>
          )}
        </section>

        <p className="message">{message}</p>
      </aside>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
