import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Bike,
  Footprints,
  Car,
  Loader2,
  Moon,
  Radar,
  RefreshCw,
  Search,
  Sun,
  MapPin,
  Sliders,
  Download,
  Database,
} from 'lucide-react';
import './styles.css';
import {
  DashboardStats,
  AccessibilityConfig,
  DistrictLeaderboardItem,
} from './types';

const BANGKOK_CENTER: L.LatLngExpression = [13.7563, 100.5018];
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

const ACCESSIBILITY_PALETTE: Record<string, AccessibilityConfig> = {
  // Medical & Health Services Group
  bkk_hospitals: {
    primary: '#059669', // Emerald
    light: '#34d399',
    fill: '#047857',
    name: 'โรงพยาบาลสังกัด กทม.',
    emoji: '🏥',
  },
  gov_hospitals: {
    primary: '#2563eb', // Blue
    light: '#60a5fa',
    fill: '#1d4ed8',
    name: 'โรงพยาบาลรัฐอื่นๆ',
    emoji: '🏥',
  },
  private_hospitals: {
    primary: '#0ea5e9', // Sky Blue
    light: '#38bdf8',
    fill: '#0369a1',
    name: 'โรงพยาบาลเอกชน',
    emoji: '🏥',
  },
  health_centers: {
    primary: '#0d9488', // Teal
    light: '#2dd4bf',
    fill: '#0f766e',
    name: 'ศูนย์บริการสาธารณสุข (ศบส.)',
    emoji: '🩺',
  },
  // Schools & Education Group
  schools_bkk: {
    primary: '#ea580c', // Orange
    light: '#f97316',
    fill: '#c2410c',
    name: 'โรงเรียนสังกัด กทม.',
    emoji: '🏫',
  },
  schools_obec: {
    primary: '#d97706', // Amber
    light: '#fbbf24',
    fill: '#b45309',
    name: 'โรงเรียนสังกัด สพฐ. (รัฐบาล)',
    emoji: '🏫',
  },
  schools_private: {
    primary: '#b45309', // Brown
    light: '#f59e0b',
    fill: '#78350f',
    name: 'โรงเรียนเอกชน',
    emoji: '🏫',
  },
  // Public Transit Group
  transit_train: {
    primary: '#7c3aed', // Purple
    light: '#a78bfa',
    fill: '#6d28d9',
    name: 'รถไฟฟ้า (BTS/MRT)',
    emoji: '🚆',
  },
  transit_boat: {
    primary: '#0284c7', // Sky Blue
    light: '#38bdf8',
    fill: '#0369a1',
    name: 'เรือโดยสาร',
    emoji: '🚢',
  },
  transit_bus: {
    primary: '#8b5cf6', // Violet
    light: '#c084fc',
    fill: '#5b21b6',
    name: 'ป้ายรถประจำทาง',
    emoji: '🚌',
  },
  // Safety & Disaster Relief Group
  fire_stations: {
    primary: '#ef4444', // Red
    light: '#fca5a5',
    fill: '#b91c1c',
    name: 'สถานีดับเพลิงและกู้ภัย',
    emoji: '🚒',
  },
  police_stations: {
    primary: '#1e3a8a', // Dark Blue
    light: '#3b82f6',
    fill: '#172554',
    name: 'สถานีตำรวจ',
    emoji: '👮',
  },
  communities: {
    primary: '#d97706', // Amber
    light: '#fcd34d',
    fill: '#78350f',
    name: 'พื้นที่ชุมชน',
    emoji: '🏘️',
  },
};

const ACCESSIBILITY_GROUPS = [
  {
    id: 'medical',
    name: '🏥 บริการทางการแพทย์และสาธารณสุข',
    categories: ['bkk_hospitals', 'gov_hospitals', 'private_hospitals', 'health_centers']
  },
  {
    id: 'schools',
    name: '🏫 โรงเรียนและสถานศึกษา',
    categories: ['schools_bkk', 'schools_obec', 'schools_private']
  },
  {
    id: 'transit',
    name: '🚆 ระบบขนส่งสาธารณะ',
    categories: ['transit_train', 'transit_boat', 'transit_bus']
  },
  {
    id: 'safety_disaster',
    name: '🚨 ความปลอดภัยและบรรเทาสาธารณภัย',
    categories: ['fire_stations', 'police_stations', 'communities']
  }
];

function escapeHtml(value: any): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function App() {
  const mapRef = useRef<L.Map | null>(null);

  // Theme states
  const [basemapMode, setBasemapMode] = useState<'light' | 'dark'>('dark');
  const [message, setMessage] = useState<string>('เมือง 15 นาที: เลือกชั้นข้อมูลและโหมดเพื่อวิเคราะห์การเข้าถึง');
  const [currentZoom, setCurrentZoom] = useState<number>(11);

  // Tab State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analyze'>('dashboard');

  // Engine status
  const [engineStatus, setEngineStatus] = useState<any>(null);

  // 15-Minute City Dashboard State
  const [dashboardLayers, setDashboardLayers] = useState<Record<string, boolean>>({
    bkk_hospitals: true,
    gov_hospitals: false,
    private_hospitals: false,
    health_centers: false,
    schools_bkk: false,
    schools_obec: false,
    schools_private: false,
    transit_train: false,
    transit_boat: false,
    transit_bus: false,
    fire_stations: false,
    police_stations: false,
    communities: false,
  });
  const [dashboardTravelMode, setDashboardTravelMode] = useState<'walk' | 'cycle' | 'drive'>('walk');
  const [activeLeaderboardCategory, setActiveLeaderboardCategory] = useState<string>('bkk_hospitals');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [districtsGeojson, setDistrictsGeojson] = useState<any>(null);
  const [selectedDistrictCode, setSelectedDistrictCode] = useState<string | number | null>(null);
  const [districtSearch, setDistrictSearch] = useState<string>('');
  const [loadedAccessibilityData, setLoadedAccessibilityData] = useState<Record<string, any>>({});
  const [loadingLayers, setLoadingLayers] = useState<Record<string, boolean>>({});

  // Global POI marker visibility
  const [showPoiMarkers, setShowPoiMarkers] = useState<boolean>(true);

  // Auto-sync Active Rank category based on displayed layers
  const prevLayersRef = useRef(dashboardLayers);
  useEffect(() => {
    const newlyChecked = Object.keys(dashboardLayers).find(
      key => dashboardLayers[key] && !prevLayersRef.current[key]
    );
    if (newlyChecked) {
      setActiveLeaderboardCategory(newlyChecked);
    } else {
      if (!dashboardLayers[activeLeaderboardCategory]) {
        const firstChecked = Object.keys(dashboardLayers).find(key => dashboardLayers[key]);
        if (firstChecked) {
          setActiveLeaderboardCategory(firstChecked);
        }
      }
    }
    prevLayersRef.current = dashboardLayers;
  }, [dashboardLayers, activeLeaderboardCategory]);


  // Dynamic analysis states
  const [inspectCoords, setInspectCoords] = useState<L.LatLng | null>(null);
  const [analyzeDistance, setAnalyzeDistance] = useState<number>(1000);
  const [analyzeResults, setAnalyzeResults] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Leaflet Layer References
  const layersRef = useRef<{
    basemap: L.TileLayer | null;
    districts: L.GeoJSON | null;
    accessibility: Record<string, L.GeoJSON>;
    pois: Record<string, L.GeoJSON>;
    busRoutes: L.GeoJSON | null;
    dynamicMarker: L.Marker | null;
    dynamicServiceArea: L.GeoJSON | null;
    dynamicReachableRoads: L.GeoJSON | null;
  }>({
    basemap: null,
    districts: null,
    accessibility: {},
    pois: {},
    busRoutes: null,
    dynamicMarker: null,
    dynamicServiceArea: null,
    dynamicReachableRoads: null,
  });

  // Fetch initial data directly from static assets
  useEffect(() => {
    // Fetch precomputed stats
    fetch('/data/processed/accessibility/stats.json?t=' + Date.now())
      .then((r) => r.json())
      .then(setDashboardStats)
      .catch((e) => console.error('Failed to load accessibility stats:', e));

    // Fetch districts boundary
    fetch('/data/processed/bma-layers/layer-13.geojson')
      .then((r) => r.json())
      .then(setDistrictsGeojson)
      .catch((e) => console.error('Failed to load districts boundary:', e));


    // Fetch engine health status
    fetch('/api/engine/status')
      .then((r) => r.json())
      .then(setEngineStatus)
      .catch((e) => console.error('Failed to load engine status:', e));
  }, []);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Load accessibility layer GeoJSON on demand from static assets
  const loadAccessibilityLayer = async (category: string, type: string) => {
    const key = `${category}-${type}`;
    if (loadedAccessibilityData[key]) return loadedAccessibilityData[key];

    setLoadingLayers((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`/data/processed/accessibility/${category}-${type}.geojson?t=${Date.now()}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setLoadedAccessibilityData((prev) => ({
        ...prev,
        [key]: data,
      }));
      setLoadingLayers((prev) => ({ ...prev, [key]: false }));
      return data;
    } catch (e) {
      console.error(`Failed to load accessibility layer ${key}:`, e);
      setLoadingLayers((prev) => ({ ...prev, [key]: false }));
      return null;
    }
  };

  // Trigger loading when dashboard layers are toggled
  useEffect(() => {
    Object.entries(dashboardLayers).forEach(([category, visible]) => {
      if (visible) {
        loadAccessibilityLayer(category, `area-${dashboardTravelMode}`);
        loadAccessibilityLayer(category, 'pois');
      }
    });
  }, [dashboardLayers, dashboardTravelMode]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map('map', {
      zoomControl: false,
      preferCanvas: true,
    }).setView(BANGKOK_CENTER, 11);

    // Create custom panes for proper layering
    map.createPane('districts');
    map.createPane('analysisArea');
    map.createPane('servicePoints');

    map.getPane('districts')!.style.zIndex = '415';
    map.getPane('analysisArea')!.style.zIndex = '430';
    map.getPane('servicePoints')!.style.zIndex = '455';

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Sync zoom level changes
    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (activeTabRef.current === 'analyze') {
        setInspectCoords(e.latlng);
      }
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

  const useCircleMarkers = useMemo(() => currentZoom < 14, [currentZoom]);

  // Sync/Redraw Map Layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // --- 1. Clean Up Old Layers ---
    layersRef.current.districts?.remove();
    layersRef.current.districts = null;
    layersRef.current.busRoutes?.remove();
    layersRef.current.busRoutes = null;

    Object.keys(layersRef.current.accessibility).forEach((key) => {
      layersRef.current.accessibility[key]?.remove();
      delete layersRef.current.accessibility[key];
    });
    Object.keys(layersRef.current.pois).forEach((key) => {
      layersRef.current.pois[key]?.remove();
      delete layersRef.current.pois[key];
    });

    // --- 2. Redraw layers ---
    if (districtsGeojson && districtsGeojson.type === 'FeatureCollection') {
      layersRef.current.districts = L.geoJSON(districtsGeojson, {
        pane: 'districts',
        style: (feature) => {
          const code = feature?.properties?.DCODE || feature?.properties?.OBJECTID || feature?.properties?.name;
          const isSelected = selectedDistrictCode === code;
          return {
            color: isSelected ? '#38bdf8' : basemapMode === 'dark' ? '#334155' : '#94a3b8',
            weight: isSelected ? 3.5 : 1,
            opacity: isSelected ? 1 : 0.6,
            fillColor: isSelected ? '#38bdf8' : 'transparent',
            fillOpacity: isSelected ? 0.15 : 0,
          };
        },
        onEachFeature: (feature, layer: L.Layer) => {
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
            className: 'district-tooltip',
          });

          layer.on({
            mouseover: (e: L.LeafletMouseEvent) => {
              if (selectedDistrictCode !== code) {
                (e.target as L.Path).setStyle({
                  color: '#67e8f9',
                  weight: 2,
                  fillColor: '#67e8f9',
                  fillOpacity: 0.05,
                });
              }
            },
            mouseout: (e: L.LeafletMouseEvent) => {
              if (selectedDistrictCode !== code) {
                layersRef.current.districts?.resetStyle(e.target);
              }
            },
            click: (e: L.LeafletMouseEvent) => {
              setSelectedDistrictCode(code);
              map.fitBounds((e.target as L.FeatureGroup).getBounds(), { padding: [40, 40] });
            },
          });
        },
      }).addTo(map);

      // If a district was selected, let's keep it highlighted
      if (selectedDistrictCode) {
        const matchLayer = Object.values((layersRef.current.districts as any)._layers).find((l: any) => {
          const code = l.feature.properties?.DCODE || l.feature.properties?.OBJECTID || l.feature.properties?.name;
          return code === selectedDistrictCode;
        }) as any;
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
          },
        }).addTo(map);
      }

      // Render POI point markers
      const poisData = loadedAccessibilityData[poisKey];
      if (poisData && showPoiMarkers) {
        layersRef.current.pois[poisKey] = L.geoJSON(poisData, {
          pane: 'servicePoints',
          pointToLayer: (feature, latlng) => {
            const name = feature.properties.name || 'จุดบริการ';
            let color = config.primary;

            // LOD Optimization: Use canvas CircleMarkers at lower zooms to prevent browser freezing
            if (useCircleMarkers) {
              return L.circleMarker(latlng, {
                pane: 'servicePoints',
                radius: 4.5,
                fillColor: color,
                color: '#ffffff',
                weight: 1,
                fillOpacity: 0.9,
              });
            }

            let shortName = name;
            let emoji = config.emoji;

            if (category.startsWith('schools_')) {
              shortName = name.replace('โรงเรียน', 'รร.');
            } else if (category === 'health_centers') {
              shortName = name.replace('ศูนย์บริการสาธารณสุข', 'ศบส.');
            } else if (category.endsWith('_hospitals')) {
              shortName = name.replace('โรงพยาบาล', 'รพ.');
            } else if (category === 'transit_train') {
              shortName = name.replace('สถานีรถไฟฟ้าเอ็มอาร์ที', 'MRT ').replace('สถานีรถไฟฟ้าบีทีเอส', 'BTS ');
              emoji = '🚆';
            } else if (category === 'transit_boat') {
              shortName = name.replace('ท่าเรือโดยสาร', 'ท่า').replace('ท่าเรือ', 'ท่า');
              emoji = '🚢';
            } else if (category === 'transit_bus') {
              shortName = name.replace('ป้ายรถประจำทาง', 'ป้าย').replace('ป้ายรถเมล์', 'ป้าย');
              emoji = '🚌';
            } else if (category === 'fire_stations') {
              shortName = name.replace('สถานีดับเพลิงและกู้ภัย', 'ดับเพลิง').replace('สถานีดับเพลิง', 'ดับเพลิง');
              emoji = '🚒';
            } else if (category === 'police_stations') {
              shortName = name.replace('สถานีตำรวจนครบาล', 'สน.').replace('สถานีตำรวจภูธร', 'สภ.').replace('สถานีตำรวจ', 'ตำรวจ');
              emoji = '👮';
            } else if (category === 'communities') {
              shortName = name.replace('ชุมชน', 'ชช.');
              emoji = '🏘️';
            }

            const iconHtml = `
              <div class="poi-marker-container category-${category}">
                <div class="poi-marker-icon" style="background-color: ${color};">
                  <span class="poi-marker-emoji">${emoji}</span>
                </div>
                <span class="poi-map-label">${escapeHtml(shortName)}</span>
              </div>
            `;

            const icon = L.divIcon({
              html: iconHtml,
              className: 'custom-poi-icon',
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            });

            return L.marker(latlng, { icon });
          },
          onEachFeature: (feature, layer: L.Layer) => {
            let tooltipContent = `<strong>${escapeHtml(feature.properties.name)}</strong>`;
            if (feature.properties.school_type) {
              tooltipContent += `<br><span style="display:inline-block; margin-top:4px; padding:2px 6px; font-size:0.72rem; font-weight:bold; background-color:#e0f2fe; color:#0369a1; border-radius:4px; border:1px solid #bae6fd;">${escapeHtml(feature.properties.school_type)}</span>`;
            }
            tooltipContent += `<br>เขต${escapeHtml(feature.properties.district || 'ไม่ระบุ')}`;

            layer.bindTooltip(tooltipContent, {
              direction: 'top',
            });
          },
        }).addTo(map);
      }
    });
  }, [
    districtsGeojson,
    loadedAccessibilityData,
    dashboardLayers,
    dashboardTravelMode,
    activeLeaderboardCategory,
    selectedDistrictCode,
    basemapMode,
    useCircleMarkers,
    showPoiMarkers,
  ]);

  // Clean up dynamic analysis when switching tabs
  useEffect(() => {
    if (activeTab === 'dashboard') {
      setInspectCoords(null);
      setAnalyzeResults(null);
      setAnalyzeError(null);
      
      const map = mapRef.current;
      if (map) {
        layersRef.current.dynamicMarker?.remove();
        layersRef.current.dynamicMarker = null;
        layersRef.current.dynamicServiceArea?.remove();
        layersRef.current.dynamicServiceArea = null;
        layersRef.current.dynamicReachableRoads?.remove();
        layersRef.current.dynamicReachableRoads = null;
      }
    }
  }, [activeTab]);

  // Render Inspect Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.dynamicMarker?.remove();
    layersRef.current.dynamicMarker = null;

    if (inspectCoords) {
      layersRef.current.dynamicMarker = L.marker(inspectCoords, {
        icon: L.divIcon({
          html: `
            <div class="poi-marker-container inspect-marker">
              <div class="poi-marker-icon" style="background-color: #ef4444; border: 2px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.5); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                <span class="poi-marker-emoji" style="font-size: 16px;">📍</span>
              </div>
            </div>
          `,
          className: 'custom-poi-icon',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })
      }).addTo(map);
      map.panTo(inspectCoords);
    }
  }, [inspectCoords]);

  // Render Dynamic Analysis results
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.dynamicServiceArea?.remove();
    layersRef.current.dynamicServiceArea = null;
    layersRef.current.dynamicReachableRoads?.remove();
    layersRef.current.dynamicReachableRoads = null;

    if (activeTab === 'analyze' && analyzeResults) {
      if (analyzeResults.serviceArea && analyzeResults.serviceArea.features?.length) {
        layersRef.current.dynamicServiceArea = L.geoJSON(analyzeResults.serviceArea, {
          pane: 'analysisArea',
          style: {
            color: '#7c3aed',
            weight: 2.5,
            opacity: 0.9,
            fillColor: '#a78bfa',
            fillOpacity: 0.25,
          }
        }).addTo(map);
      }

      if (analyzeResults.reachableRoads && analyzeResults.reachableRoads.features?.length) {
        layersRef.current.dynamicReachableRoads = L.geoJSON(analyzeResults.reachableRoads, {
          pane: 'analysisArea',
          style: {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8,
            dashArray: '4, 6'
          }
        }).addTo(map);
      }
    }
  }, [analyzeResults, activeTab]);

  const handleAnalyze = async () => {
    if (!inspectCoords) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeResults(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          facilities: [
            {
              lat: inspectCoords.lat,
              lng: inspectCoords.lng,
              name: 'จุดวิเคราะห์หลัก',
              type: 'inspect'
            }
          ],
          distanceMeters: analyzeDistance
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      setAnalyzeResults(data);
      setMessage(`วิเคราะห์ระยะทาง ${analyzeDistance} ม. สำเร็จ (Engine: ${data.engine})`);
    } catch (e: any) {
      console.error('Analysis failed:', e);
      setAnalyzeError(e.message || 'การวิเคราะห์ล้มเหลว');
      setMessage('การวิเคราะห์เครือข่ายถนนล้มเหลว');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportGeoJSON = () => {
    if (!analyzeResults || !analyzeResults.serviceArea) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(analyzeResults.serviceArea));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `service-area-${analyzeDistance}m.geojson`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Dashboard calculations for Sidebar
  const selectedCategoryStats = useMemo(() => {
    if (!dashboardStats) return null;
    return {
      overall: dashboardStats.overall[activeLeaderboardCategory]?.[dashboardTravelMode] || 0,
      name: ACCESSIBILITY_PALETTE[activeLeaderboardCategory].name,
      emoji: ACCESSIBILITY_PALETTE[activeLeaderboardCategory].emoji,
    };
  }, [dashboardStats, activeLeaderboardCategory, dashboardTravelMode]);

  const sortedDistrictRankings = useMemo<DistrictLeaderboardItem[]>(() => {
    if (!dashboardStats || !districtsGeojson) return [];

    const key = `${activeLeaderboardCategory}_${dashboardTravelMode}`;
    return Object.values(dashboardStats.districts)
      .map((d) => ({
        code: d.code,
        name: d.name,
        score: d.coverage[key] || 0,
      }))
      .filter((d) => d.name.includes(districtSearch.trim()))
      .sort((a, b) => b.score - a.score);
  }, [dashboardStats, districtsGeojson, activeLeaderboardCategory, dashboardTravelMode, districtSearch]);

  const handleDistrictLeaderboardClick = (districtCode: string | number) => {
    setSelectedDistrictCode(districtCode);
    const map = mapRef.current;
    if (!map || !layersRef.current.districts) return;

    // Find the feature layer in leaflet districts group and zoom to it
    const layer = Object.values((layersRef.current.districts as any)._layers).find((l: any) => {
      const code = l.feature.properties?.DCODE || l.feature.properties?.OBJECTID || l.feature.properties?.name;
      return code === districtCode;
    }) as any;
    if (layer) {
      map.fitBounds(layer.getBounds(), { padding: [40, 40] });
    }
  };

  const getDistrictScoreBadgeClass = (score: number) => {
    if (score >= 60) return 'badge-high';
    if (score >= 25) return 'badge-medium';
    return 'badge-low';
  };

  return (
    <main className={`app-shell ${basemapMode === 'dark' ? 'is-dark-map' : 'is-light-map'}`}>
      {/* MAP STAGE */}
      <section className="map-stage">
        <div id="map" className={`zoom-${currentZoom}`} aria-label="Bangkok 15-Minute City Map" />

        {/* Map float toolbar */}
        <div className="map-toolbar" aria-label="Map tools">
          <button
            onClick={() => {
              setSelectedDistrictCode(null);
              mapRef.current?.setView(BANGKOK_CENTER, 11);
            }}
            title="กลับสู่มุมมองกรุงเทพฯ"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => setBasemapMode((mode) => (mode === 'light' ? 'dark' : 'light'))}
            title={basemapMode === 'light' ? 'แผนที่ธีมมืด' : 'แผนที่ธีมสว่าง'}
          >
            {basemapMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
        <div className="map-mode-badge">
          {activeTab === 'dashboard' ? '📊 โหมดเมือง 15 นาที (15-Min City)' : '📍 โหมดวิเคราะห์เข้าถึงรายจุด (pgRouting)'}
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

        {/* TAB SWITCHER */}
        <div className="tab-switcher" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.82rem',
              backgroundColor: activeTab === 'dashboard' ? '#0f766e' : basemapMode === 'dark' ? '#1e293b' : '#e2e8f0',
              color: activeTab === 'dashboard' ? 'white' : basemapMode === 'dark' ? '#94a3b8' : '#64748b',
              transition: 'all 0.2s ease',
            }}
          >
            🗺️ แผนที่ 15 นาที
          </button>
          <button 
            className={`tab-btn ${activeTab === 'analyze' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('analyze')}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.82rem',
              backgroundColor: activeTab === 'analyze' ? '#0f766e' : basemapMode === 'dark' ? '#1e293b' : '#e2e8f0',
              color: activeTab === 'analyze' ? 'white' : basemapMode === 'dark' ? '#94a3b8' : '#64748b',
              transition: 'all 0.2s ease',
            }}
          >
            📍 วิเคราะห์รายจุด
          </button>
        </div>

        {activeTab === 'dashboard' ? (
          <>
            {/* TRAVEL MODE & ACCESSIBILITY LAYERS CONTROL */}
            <section className="workflow-card">
              <div className="section-header">
                <h2>1. โหมดและเวลาเดินทาง</h2>
              </div>
              <div className="travel-mode-selector">
                <button className={dashboardTravelMode === 'walk' ? 'is-active' : ''} onClick={() => setDashboardTravelMode('walk')}>
                  <Footprints size={18} />
                  <span>เดิน (15 นาที)</span>
                </button>
                <button className={dashboardTravelMode === 'cycle' ? 'is-active' : ''} onClick={() => setDashboardTravelMode('cycle')}>
                  <Bike size={18} />
                  <span>จักรยาน (15 นาที)</span>
                </button>
                <button className={dashboardTravelMode === 'drive' ? 'is-active' : ''} onClick={() => setDashboardTravelMode('drive')}>
                  <Car size={18} />
                  <span>รถยนต์ (15 นาที)</span>
                </button>
              </div>

              <div className="section-header" style={{ marginTop: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>2. ชั้นข้อมูลความสะดวก</h2>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, color: '#0f766e' }}>
                  <input
                    type="checkbox"
                    checked={showPoiMarkers}
                    onChange={(e) => setShowPoiMarkers(e.target.checked)}
                  />
                  <span>📍 แสดงหมุดบริการ</span>
                </label>
              </div>
              <div className="accessibility-layers-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {ACCESSIBILITY_GROUPS.map((group) => {
                  return (
                    <div key={group.id} className="layer-group-container" style={{
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: basemapMode === 'dark' ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                      border: basemapMode === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
                    }}>
                      <div className="layer-group-header" style={{
                        fontSize: '0.82rem',
                        fontWeight: 'bold',
                        color: basemapMode === 'dark' ? '#f1f5f9' : '#0f172a',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        {group.name}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {group.categories.map((key) => {
                          const config = ACCESSIBILITY_PALETTE[key];
                          if (!config) return null;
                          const isVisible = dashboardLayers[key];
                          const isActive = activeLeaderboardCategory === key;
                          const isLayerLoading =
                            loadingLayers[`${key}-area-${dashboardTravelMode}`] || loadingLayers[`${key}-pois`];

                          return (
                            <div
                              key={key}
                              className={`acc-layer-item ${isActive ? 'is-active-row' : ''}`}
                              onClick={() => setActiveLeaderboardCategory(key)}
                              title="คลิกเพื่อเลือกดูตารางการจัดอันดับเขตด้านล่าง"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                backgroundColor: isActive 
                                  ? (basemapMode === 'dark' ? '#334155' : '#e2e8f0') 
                                  : 'transparent',
                                borderLeft: isActive ? `3px solid ${config.primary}` : '3px solid transparent'
                              }}
                            >
                              <label className="acc-layer-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1 }} onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isVisible}
                                  onChange={(e) => {
                                    setDashboardLayers((prev) => ({ ...prev, [key]: e.target.checked }));
                                  }}
                                />
                                <span className="layer-dot" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: config.primary }} />
                                <span className="layer-emoji" style={{ fontSize: '1rem' }}>{config.emoji}</span>
                                <span className="layer-title" style={{ fontSize: '0.8rem', fontWeight: 500, color: basemapMode === 'dark' ? '#e2e8f0' : '#1e293b' }}>{config.name}</span>
                              </label>

                              {isLayerLoading ? (
                                <Loader2 className="spin" size={12} style={{ color: '#64748b' }} />
                              ) : (
                                <div className="active-indicator-tag" style={{ 
                                  opacity: isActive ? 1 : 0,
                                  fontSize: '0.65rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: config.primary,
                                  color: 'white',
                                  fontWeight: 'bold'
                                }}>
                                  Active Rank
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* SUMMARY OF ALL ASPECTS */}
            <section className="workflow-card all-aspects-summary-card">
              <div className="section-header">
                <h2>📊 สรุปความครอบคลุมรายด้าน (ทั้งกรุงเทพฯ)</h2>
              </div>
              <div className="aspects-summary-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                {Object.entries(ACCESSIBILITY_PALETTE).map(([key, config]) => {
                  const score = dashboardStats?.overall[key]?.[dashboardTravelMode] ?? 0;
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: basemapMode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: '8px', border: basemapMode === 'dark' ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>{config.emoji}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: basemapMode === 'dark' ? '#f8fafc' : '#0f172a' }}>{config.name}</span>
                      </div>
                      <strong style={{ fontSize: '0.9rem', color: config.primary }}>{score}%</strong>
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
                    <h2>
                      {selectedCategoryStats.emoji} {selectedCategoryStats.name}
                    </h2>
                  </div>
                  <strong
                    style={{
                      backgroundColor: ACCESSIBILITY_PALETTE[activeLeaderboardCategory].light + '33',
                      color: ACCESSIBILITY_PALETTE[activeLeaderboardCategory].fill,
                    }}
                  >
                    {selectedCategoryStats.overall}%
                  </strong>
                </div>

                <div className="coverage-progress-bar-bg">
                  <div
                    className="coverage-progress-bar-fill"
                    style={{
                      width: `${selectedCategoryStats.overall}%`,
                      backgroundColor: ACCESSIBILITY_PALETTE[activeLeaderboardCategory].primary,
                    }}
                  />
                </div>
                <p className="coverage-description-text">
                  ประชากรในพื้นที่ระบายสีสามารถเดินทางด้วย{' '}
                  <strong>{dashboardTravelMode === 'walk' ? 'เท้า' : dashboardTravelMode === 'cycle' ? 'จักรยาน' : 'รถยนต์'}</strong>{' '}
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

              <div className="search-box-container">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="ค้นหาเขตในกรุงเทพฯ..."
                  value={districtSearch}
                  onChange={(e) => setDistrictSearch(e.target.value)}
                />
                {districtSearch && (
                  <button className="clear-search-btn" onClick={() => setDistrictSearch('')}>
                    ×
                  </button>
                )}
              </div>

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
                      <span className={`score-badge ${getDistrictScoreBadgeClass(district.score)}`}>{district.score}%</span>
                    </div>
                  );
                })}
                {sortedDistrictRankings.length === 0 && <p className="empty-search-text">ไม่พบเขตที่ค้นหา</p>}
              </div>
              {selectedDistrictCode && (
                <button className="reset-district-selection-btn" onClick={() => setSelectedDistrictCode(null)}>
                  ล้างการเลือกเขต
                </button>
              )}
            </section>
          </>
        ) : (
          /* DYNAMIC ANALYSIS PANEL */
          <>
            <section className="workflow-card">
              <div className="section-header">
                <h2>🛰️ สถานะระบบประมวลผล (Engine)</h2>
              </div>
              {engineStatus?.database ? (
                <div style={{ padding: '10px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, marginTop: '8px' }}>
                  <Database size={16} />
                  <span>Engine: PostGIS + pgRouting พร้อมใช้งาน</span>
                </div>
              ) : (
                <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, marginTop: '8px' }}>
                  <Database size={16} />
                  <span>PostGIS ออฟไลน์ - ใช้ระบบประมวลผลสำรอง (JS Fallback)</span>
                </div>
              )}

              <div className="section-header" style={{ marginTop: '18px' }}>
                <h2>1. เลือกจุดบริการบนแผนที่</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', padding: '12px', background: basemapMode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: basemapMode === 'dark' ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.05)', borderRadius: '8px' }}>
                <MapPin size={20} style={{ color: inspectCoords ? '#ef4444' : '#64748b' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>ตำแหน่งปักหมุด</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: basemapMode === 'dark' ? '#f8fafc' : '#0f172a' }}>
                    {inspectCoords ? `${inspectCoords.lat.toFixed(6)}, ${inspectCoords.lng.toFixed(6)}` : 'คลิกบนแผนที่เพื่อปักหมุด 📍'}
                  </span>
                </div>
              </div>

              <div className="section-header" style={{ marginTop: '18px' }}>
                <h2>2. ตั้งค่าระยะทางบนเครือข่ายถนน</h2>
              </div>
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                  <span>ระยะวิเคราะห์</span>
                  <span style={{ color: '#0f766e' }}>{analyzeDistance.toLocaleString()} เมตร</span>
                </div>
                <input
                  type="range"
                  min="300"
                  max="5000"
                  step="100"
                  value={analyzeDistance}
                  onChange={(e) => setAnalyzeDistance(Number(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: '#0f766e' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>
                  <span>300 ม.</span>
                  <span>5,000 ม. (5 กม.)</span>
                </div>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || !inspectCoords}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: isAnalyzing || !inspectCoords ? '#64748b' : '#0f766e',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: isAnalyzing || !inspectCoords ? 'not-allowed' : 'pointer',
                  marginTop: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 6px rgba(15,118,110,0.2)',
                  transition: 'all 0.2s ease'
                }}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="spin" size={18} />
                    <span>กำลังประมวลผล pgRouting...</span>
                  </>
                ) : (
                  <>
                    <Sliders size={18} />
                    <span>วิเคราะห์พื้นที่บริการ (Analyze)</span>
                  </>
                )}
              </button>

              {analyzeError && (
                <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', color: '#ef4444', fontSize: '0.78rem' }}>
                  <strong>เกิดข้อผิดพลาด:</strong> {analyzeError}
                </div>
              )}
            </section>

            {/* RESULTS */}
            {analyzeResults && (
              <section className="result-card">
                <div className="result-head" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ผลลัพธ์การวิเคราะห์พื้นที่เข้าถึง</span>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, marginTop: '2px' }}>📍 ขอบเขตระยะ {analyzeDistance} เมตร</h2>
                  </div>
                  <strong style={{ background: '#7c3aed22', color: '#a78bfa', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem' }}>
                    {analyzeResults.engine === 'postgis-pgrouting' ? 'pgRouting' : 'JS Fallback'}
                  </strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ background: basemapMode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)', padding: '10px', borderRadius: '6px', border: basemapMode === 'dark' ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.03)' }}>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block' }}>ขนาดพื้นที่บริการ</span>
                    <strong style={{ fontSize: '1.05rem', color: '#a78bfa' }}>{analyzeResults.metrics.serviceAreaSqKm} ตร.กม.</strong>
                  </div>
                  <div style={{ background: basemapMode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)', padding: '10px', borderRadius: '6px', border: basemapMode === 'dark' ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.02)' }}>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block' }}>ความยาวถนนที่เข้าถึง</span>
                    <strong style={{ fontSize: '1.05rem', color: '#3b82f6' }}>{analyzeResults.metrics.reachedRoadLengthKm} กม.</strong>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ background: basemapMode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)', padding: '10px', borderRadius: '6px', border: basemapMode === 'dark' ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.03)' }}>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block' }}>จำนวนทางร่วมแยก</span>
                    <strong style={{ fontSize: '1.05rem', color: '#10b981' }}>{analyzeResults.metrics.networkNodesReached} จุด</strong>
                  </div>
                  <div style={{ background: basemapMode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)', padding: '10px', borderRadius: '6px', border: basemapMode === 'dark' ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.03)' }}>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block' }}>ระยะ Snap ถนน</span>
                    <strong style={{ fontSize: '1.05rem', color: '#f59e0b' }}>{analyzeResults.metrics.averageSnapDistanceMeters} ม.</strong>
                  </div>
                </div>

                <div className="section-header">
                  <h2>🗺️ เขตที่พื้นที่พาดผ่าน ({analyzeResults.intersectingDistricts.length})</h2>
                </div>
                <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', paddingRight: '4px' }}>
                  {analyzeResults.intersectingDistricts.map((d: any) => (
                    <div key={d.id} style={{ fontSize: '0.78rem', padding: '6px 10px', background: basemapMode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: '4px', border: basemapMode === 'dark' ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.03)' }}>
                      เขต{d.name}
                    </div>
                  ))}
                  {analyzeResults.intersectingDistricts.length === 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ไม่พาดผ่านเขตใด</span>
                  )}
                </div>

                <button
                  onClick={handleExportGeoJSON}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: basemapMode === 'dark' ? '1px solid #7c3aed' : '1px solid #c084fc',
                    backgroundColor: 'transparent',
                    color: basemapMode === 'dark' ? '#c084fc' : '#7c3aed',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    marginTop: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Download size={14} />
                  <span>📥 Export GeoJSON (ขอบเขตบริการ)</span>
                </button>
              </section>
            )}
          </>
        )}

        <p className="message">{message}</p>
      </aside>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
