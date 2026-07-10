import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import { booleanPointInPolygon } from '@turf/turf';
import 'leaflet/dist/leaflet.css';
import {
  Bike,
  BarChart3,
  Footprints,
  Car,
  Loader2,
  Moon,
  Radar,
  RefreshCw,
  Search,
  Sun,
  MapPin,
  Download,
  Activity,
  ExternalLink,
  Layers,
  X,
} from 'lucide-react';
import './styles.css';
import './executive.css';
import {
  AccessibilityConfig,
} from './types';
import {
  analyzeServiceArea,
  analyzeServiceAreaContours,
  getTrafficSegments,
  getTrafficStatus,
} from './services/api';
import { AnalyzePanel } from './components/AnalyzePanel';
import { LayerControl } from './components/LayerControl';
import {
  ACCESSIBILITY_DOMAINS,
  domainCoverageFromRecord,
  ExecutiveDashboard,
} from './components/ExecutiveDashboard';
import { NearbyPlaces } from './components/NearbyPlaces';
import type { AnalyzeResponse, CostType, TrafficStatus, TravelMode } from './types/gis';
import type { AccessibilityStats, DashboardTravelMode } from './types/dashboard';
import type { NearbyPlace } from './types/nearby';

const BANGKOK_CENTER: L.LatLngExpression = [13.7563, 100.5018];
const BANGKOK_SEARCH_VIEWBOX = '100.327,13.955,100.938,13.494';
const BANGKOK_BOUNDS = {
  minLat: 13.49,
  maxLat: 13.96,
  minLng: 100.32,
  maxLng: 100.94,
};
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

const DEFAULT_ANALYSIS_PLACE_LAYERS = Object.fromEntries(
  Object.keys(ACCESSIBILITY_PALETTE).map((category) => [category, false]),
);

function contourLayerKey(minutes: number): string {
  return `contour_${minutes}`;
}

function escapeHtml(value: any): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isFeatureCollection(value: any): boolean {
  return value?.type === 'FeatureCollection' && Array.isArray(value.features);
}

function districtStatsCode(feature: any): string {
  return String(feature?.properties?.OBJECTID ?? feature?.properties?.ADMIN_ID ?? feature?.id ?? '');
}

function coverageColor(value: number): string {
  if (value >= 80) return '#14b8a6';
  if (value >= 60) return '#38bdf8';
  if (value >= 40) return '#facc15';
  if (value >= 20) return '#fb923c';
  return '#ef4444';
}

function trafficColor(properties: Record<string, any> = {}): string {
  const explicit = String(properties.color || '');
  if (/^#[0-9a-f]{6}$/i.test(explicit)) return explicit;
  const level = String(properties.congestion || properties.level || properties.status || '').toLowerCase();
  if (['severe', 'heavy', 'jam', 'ติดขัดมาก'].some((value) => level.includes(value))) return '#ef4444';
  if (['moderate', 'slow', 'ติดขัด', 'ช้า'].some((value) => level.includes(value))) return '#f59e0b';
  const speed = Number(properties.speed_kph ?? properties.speed ?? properties.current_speed);
  if (Number.isFinite(speed)) return speed < 15 ? '#ef4444' : speed < 30 ? '#f59e0b' : '#22c55e';
  return '#22c55e';
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function geometryBounds(geometry: any): [number, number, number, number] | null {
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (coordinates: any): void => {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      bounds[0] = Math.min(bounds[0], coordinates[0]);
      bounds[1] = Math.min(bounds[1], coordinates[1]);
      bounds[2] = Math.max(bounds[2], coordinates[0]);
      bounds[3] = Math.max(bounds[3], coordinates[1]);
      return;
    }
    coordinates.forEach(visit);
  };
  visit(geometry?.coordinates);
  return Number.isFinite(bounds[0]) ? bounds : null;
}

interface PlaceSearchResult {
  place_id: number | string;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  address?: Record<string, string>;
}

function App() {
  const mapRef = useRef<L.Map | null>(null);

  // Theme states
  const [basemapMode, setBasemapMode] = useState<'light' | 'dark'>('dark');
  const [message, setMessage] = useState<string>('ค้นหาสถานที่หรือคลิกบนแผนที่เพื่อเริ่มวิเคราะห์การเข้าถึง');
  const [currentZoom, setCurrentZoom] = useState<number>(11);
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState<boolean>(false);

  // Tab State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analyze'>('dashboard');

  // 15-Minute City Dashboard State
  const [dashboardLayers, setDashboardLayers] = useState<Record<string, boolean>>({
    bkk_hospitals: false,
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
  });
  const [dashboardTravelMode, setDashboardTravelMode] = useState<DashboardTravelMode>('walk');
  const [dashboardStats, setDashboardStats] = useState<AccessibilityStats | null>(null);
  const [dashboardFocusDomain, setDashboardFocusDomain] = useState<string>('health');
  const [showDistrictCoverage, setShowDistrictCoverage] = useState<boolean>(false);
  const [selectedDistrictCode, setSelectedDistrictCode] = useState<string | null>(null);
  const [districtsGeojson, setDistrictsGeojson] = useState<any>(null);
  const [loadedAccessibilityData, setLoadedAccessibilityData] = useState<Record<string, any>>({});
  const [loadingLayers, setLoadingLayers] = useState<Record<string, boolean>>({});

  // Global POI marker visibility
  const [showPoiMarkers, setShowPoiMarkers] = useState<boolean>(false);

  // Dynamic analysis states
  const [inspectCoords, setInspectCoords] = useState<L.LatLng | null>(null);
  const [selectedPlaceName, setSelectedPlaceName] = useState<string>('');
  const [placeQuery, setPlaceQuery] = useState<string>('');
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [isSearchingPlace, setIsSearchingPlace] = useState<boolean>(false);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);
  const [analyzeDistance, setAnalyzeDistance] = useState<number>(1000);
  const [analysisMode, setAnalysisMode] = useState<TravelMode>('walk');
  const [analysisCostType, setAnalysisCostType] = useState<CostType>('time');
  const [analysisLimit, setAnalysisLimit] = useState<number>(900);
  const [analysisLayers, setAnalysisLayers] = useState<Record<string, boolean>>({
    serviceArea: true,
    reachableRoads: false,
    startPoint: true,
    snappedNode: false,
    contour_10: false,
    contour_15: true,
    contour_30: false,
    barriers: false,
    onewayRoads: false,
  });
  const [analysisPlaceLayers, setAnalysisPlaceLayers] = useState<Record<string, boolean>>(
    DEFAULT_ANALYSIS_PLACE_LAYERS,
  );
  const [analyzeResults, setAnalyzeResults] = useState<any>(null);
  const [contourResults, setContourResults] = useState<Array<{ minutes: number; result: AnalyzeResponse }>>([]);
  const [trafficStatus, setTrafficStatus] = useState<TrafficStatus | null>(null);
  const [trafficData, setTrafficData] = useState<any>(null);
  const [showTraffic, setShowTraffic] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const placeSearchRequestRef = useRef<number>(0);

  // Leaflet Layer References
  const layersRef = useRef<{
    basemap: L.TileLayer | null;
    districts: L.GeoJSON | null;
    accessibility: Record<string, L.GeoJSON>;
    pois: Record<string, L.GeoJSON>;
    busRoutes: L.GeoJSON | null;
    dynamicMarker: L.Marker | null;
    dynamicSnappedNode: L.GeoJSON | null;
    dynamicServiceArea: L.GeoJSON | null;
    dynamicReachableRoads: L.GeoJSON | null;
    dynamicNearbyPlaces: L.LayerGroup | null;
    traffic: L.GeoJSON | null;
  }>({
    basemap: null,
    districts: null,
    accessibility: {},
    pois: {},
    busRoutes: null,
    dynamicMarker: null,
    dynamicSnappedNode: null,
    dynamicServiceArea: null,
    dynamicReachableRoads: null,
    dynamicNearbyPlaces: null,
    traffic: null,
  });

  // Fetch initial data directly from static assets
  useEffect(() => {
    // Fetch districts boundary
    fetch('/data/processed/bma-layers/layer-13.geojson')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!isFeatureCollection(data)) throw new Error('District layer is not a valid FeatureCollection');
        setDistrictsGeojson(data);
      })
      .catch((e) => console.error('Failed to load districts boundary:', e));

    fetch('/data/processed/accessibility/stats.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!data?.overall || !data?.districts) throw new Error('Accessibility statistics are invalid');
        setDashboardStats(data as AccessibilityStats);
      })
      .catch((e) => console.error('Failed to load accessibility statistics:', e));

    getTrafficStatus()
      .then(async (status) => {
        setTrafficStatus(status);
        if (status.available) {
          const segments = await getTrafficSegments();
          if (isFeatureCollection(segments)) {
            setTrafficData(segments);
          }
        }
      })
      .catch(() => {
        setTrafficStatus({
          configured: false,
          available: false,
          provider: 'bma-public-viewer',
          viewerUrl: 'https://cpudapp.bangkok.go.th/bmatraffic/',
          lastUpdated: null,
          featureCount: 0,
          refreshSeconds: 60,
        });
      });

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
      if (!isFeatureCollection(data)) throw new Error('Invalid GeoJSON FeatureCollection');
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

  // Once an analysis is available, lazily load every service-point layer so nearby
  // places can be tested against the resulting network polygon.
  useEffect(() => {
    if (activeTab !== 'analyze' || !analyzeResults) return;
    Object.keys(ACCESSIBILITY_PALETTE).forEach((category) => {
      loadAccessibilityLayer(category, 'pois');
    });
  }, [activeTab, analyzeResults]);

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
    map.createPane('traffic');

    map.getPane('districts')!.style.zIndex = '415';
    map.getPane('analysisArea')!.style.zIndex = '430';
    map.getPane('servicePoints')!.style.zIndex = '455';
    map.getPane('traffic')!.style.zIndex = '445';

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Sync zoom level changes
    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (activeTabRef.current === 'analyze') {
        setInspectCoords(e.latlng);
        setSelectedPlaceName('ตำแหน่งที่เลือกบนแผนที่');
        setPlaceResults([]);
        setPlaceSearchError(null);
        setAnalyzeResults(null);
        setContourResults([]);
        setAnalyzeError(null);
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

  useEffect(() => {
    const map = mapRef.current;
    layersRef.current.traffic?.remove();
    layersRef.current.traffic = null;
    if (!map || !showTraffic || !isFeatureCollection(trafficData)) return;
    layersRef.current.traffic = L.geoJSON(trafficData, {
      pane: 'traffic',
      style: (feature) => ({
        color: trafficColor(feature?.properties || {}),
        weight: 5,
        opacity: 0.86,
      }),
      onEachFeature: (feature, layer) => {
        const name = feature.properties?.name || feature.properties?.road_name || 'สภาพจราจร';
        const speed = Number(feature.properties?.speed_kph ?? feature.properties?.speed ?? feature.properties?.current_speed);
        const detail = Number.isFinite(speed) ? `<br>ความเร็ว ${Math.round(speed)} กม./ชม.` : '';
        layer.bindTooltip(`<strong>${escapeHtml(name)}</strong>${detail}`, { sticky: true });
      },
    }).addTo(map);
  }, [showTraffic, trafficData]);

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
    if (isFeatureCollection(districtsGeojson)) {
      layersRef.current.districts = L.geoJSON(districtsGeojson, {
        pane: 'districts',
        style: (feature) => {
          const code = districtStatsCode(feature);
          const coverageRecord = dashboardStats?.districts[code]?.coverage;
          const coverage = coverageRecord
            ? domainCoverageFromRecord(coverageRecord, dashboardFocusDomain, dashboardTravelMode)
            : 0;
          const selected = activeTab === 'dashboard' && code === selectedDistrictCode;
          return {
            color: selected ? '#f8fafc' : basemapMode === 'dark' ? '#475569' : '#cbd5e1',
            weight: selected ? 3 : 1,
            opacity: activeTab === 'dashboard' ? 0.95 : 0.6,
            fillColor: activeTab === 'dashboard' && showDistrictCoverage ? coverageColor(coverage) : 'transparent',
            fillOpacity: activeTab === 'dashboard' && showDistrictCoverage ? (selected ? 0.68 : 0.42) : 0,
          };
        },
        onEachFeature: (feature, layer: L.Layer) => {
          const name = feature.properties?.DNAME || feature.properties?.DISTRICT_N || feature.properties?.NAME || 'เขต';
          const code = districtStatsCode(feature);
          const coverageRecord = dashboardStats?.districts[code]?.coverage;
          const coverage = coverageRecord
            ? domainCoverageFromRecord(coverageRecord, dashboardFocusDomain, dashboardTravelMode)
            : undefined;
          const tooltipMetric = activeTab === 'dashboard' && showDistrictCoverage && Number.isFinite(coverage)
            ? `<br><span>ความครอบคลุม <strong>${Number(coverage).toFixed(1)}%</strong></span>`
            : '';
          layer.bindTooltip(`<strong>เขต${escapeHtml(name)}</strong>${tooltipMetric}`, {
            sticky: true,
            className: 'district-tooltip',
          });

          layer.on({
            mouseover: (e: L.LeafletMouseEvent) => {
              (e.target as L.Path).setStyle({
                color: '#67e8f9',
                weight: 2,
                fillColor: '#67e8f9',
                fillOpacity: 0.05,
              });
            },
            mouseout: (e: L.LeafletMouseEvent) => {
              layersRef.current.districts?.resetStyle(e.target);
            },
            click: (e: L.LeafletMouseEvent) => {
              if (activeTabRef.current !== 'dashboard') return;
              L.DomEvent.stopPropagation(e);
              setSelectedDistrictCode(code);
              map.fitBounds((e.target as L.Path & { getBounds: () => L.LatLngBounds }).getBounds(), {
                padding: [44, 44],
                maxZoom: 13,
              });
            },
          });
        },
      }).addTo(map);
    }


    // Draw dashboard accessibility polygons and POIs only in dashboard mode.
    if (activeTab === 'dashboard') {
      Object.entries(dashboardLayers).forEach(([category, visible]) => {
        if (!visible) return;

        const config = ACCESSIBILITY_PALETTE[category];
        const domain = ACCESSIBILITY_DOMAINS.find((item) => item.categoryKeys.includes(category));
        const domainColor = domain?.color ?? config.primary;
        const areaKey = `${category}-area-${dashboardTravelMode}`;
        const poisKey = `${category}-pois`;

        // Render Service Area Polygons
        const areaData = loadedAccessibilityData[areaKey];
        if (isFeatureCollection(areaData)) {
          layersRef.current.accessibility[areaKey] = L.geoJSON(areaData, {
            pane: 'analysisArea',
            style: {
              color: domainColor,
              weight: 1.5,
              opacity: 0.85,
              fillColor: domainColor,
              fillOpacity: basemapMode === 'dark' ? 0.18 : 0.14,
            },
          }).addTo(map);
        }

        // Render POI point markers
        const poisData = loadedAccessibilityData[poisKey];
        if (isFeatureCollection(poisData) && showPoiMarkers) {
          layersRef.current.pois[poisKey] = L.geoJSON(poisData, {
            pane: 'servicePoints',
            pointToLayer: (feature, latlng) => {
              const name = feature.properties.name || 'จุดบริการ';
              let color = domainColor;

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
    }
  }, [
    districtsGeojson,
    loadedAccessibilityData,
    dashboardLayers,
    dashboardTravelMode,
    dashboardStats,
    dashboardFocusDomain,
    showDistrictCoverage,
    selectedDistrictCode,
    basemapMode,
    activeTab,
    useCircleMarkers,
    showPoiMarkers,
  ]);

  // Clean up dynamic analysis when switching tabs
  useEffect(() => {
    if (activeTab === 'dashboard') {
      setInspectCoords(null);
      setAnalyzeResults(null);
      setContourResults([]);
      setAnalyzeError(null);
      
      const map = mapRef.current;
      if (map) {
        layersRef.current.dynamicMarker?.remove();
        layersRef.current.dynamicMarker = null;
        layersRef.current.dynamicServiceArea?.remove();
        layersRef.current.dynamicServiceArea = null;
        layersRef.current.dynamicReachableRoads?.remove();
        layersRef.current.dynamicReachableRoads = null;
        layersRef.current.dynamicSnappedNode?.remove();
        layersRef.current.dynamicSnappedNode = null;
        layersRef.current.dynamicNearbyPlaces?.remove();
        layersRef.current.dynamicNearbyPlaces = null;
      }
    }
  }, [activeTab]);

  // Render Inspect Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.dynamicMarker?.remove();
    layersRef.current.dynamicMarker = null;

    if (inspectCoords && analysisLayers.startPoint) {
      layersRef.current.dynamicMarker = L.marker(inspectCoords, {
        draggable: true,
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
      layersRef.current.dynamicMarker.on('dragend', (event: L.DragEndEvent) => {
        const position = (event.target as L.Marker).getLatLng();
        setInspectCoords(position);
        setSelectedPlaceName('ตำแหน่งที่ปรับจากการลากหมุด');
        setAnalyzeResults(null);
        setContourResults([]);
        setAnalyzeError(null);
        setMessage('ปรับจุดวิเคราะห์แล้ว กดวิเคราะห์อีกครั้งเพื่อคำนวณพื้นที่บริการใหม่');
      });
      map.panTo(inspectCoords);
    }
  }, [inspectCoords, analysisLayers.startPoint]);

  // Render Dynamic Analysis results
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.dynamicServiceArea?.remove();
    layersRef.current.dynamicServiceArea = null;
    layersRef.current.dynamicReachableRoads?.remove();
    layersRef.current.dynamicReachableRoads = null;
    layersRef.current.dynamicSnappedNode?.remove();
    layersRef.current.dynamicSnappedNode = null;

    if (activeTab === 'analyze' && analyzeResults) {
      const drawnBounds: L.LatLngBounds[] = [];
      const visibleContours = contourResults
        .filter((contour) => analysisLayers[contourLayerKey(contour.minutes)] ?? false)
        .sort((left, right) => right.minutes - left.minutes);
      const contourCollection = analysisCostType === 'time' && contourResults.length
        ? {
            type: 'FeatureCollection',
            features: visibleContours.flatMap((contour) => (contour.result.serviceArea?.features || []).map((feature: any) => ({
              ...feature,
              properties: { ...(feature.properties || {}), contourMinutes: contour.minutes },
            }))),
          }
        : analyzeResults.serviceArea;
      const shouldDrawServiceArea = analysisCostType === 'time'
        ? visibleContours.length > 0
        : analysisLayers.serviceArea;
      if (shouldDrawServiceArea && contourCollection?.type === 'FeatureCollection' && contourCollection.features?.length) {
        layersRef.current.dynamicServiceArea = L.geoJSON(contourCollection as any, {
          pane: 'analysisArea',
          style: (feature) => {
            const minutes = Number(feature?.properties?.contourMinutes || analysisLimit / 60);
            const color = minutes === 10 ? '#14b8a6' : minutes === 15 ? '#38bdf8' : '#8b5cf6';
            const selected = minutes === analysisLimit / 60;
            return {
              color,
              weight: selected ? 3 : 1.8,
              opacity: selected ? 1 : 0.72,
              fillColor: color,
              fillOpacity: selected ? 0.24 : 0.1,
            };
          },
          onEachFeature: (feature, layer) => {
            const minutes = feature.properties?.contourMinutes;
            if (minutes) layer.bindTooltip(`พื้นที่ที่เข้าถึงได้ภายใน ${minutes} นาที`, { sticky: true });
          },
        }).addTo(map);
        drawnBounds.push(layersRef.current.dynamicServiceArea.getBounds());
      }

      if (analysisLayers.reachableRoads && analyzeResults.reachableRoads?.type === 'FeatureCollection' && analyzeResults.reachableRoads.features?.length) {
        layersRef.current.dynamicReachableRoads = L.geoJSON(analyzeResults.reachableRoads, {
          pane: 'analysisArea',
          style: {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8,
            dashArray: '4, 6'
          }
        }).addTo(map);
        drawnBounds.push(layersRef.current.dynamicReachableRoads.getBounds());
      }

      if (analysisLayers.snappedNode && analyzeResults.snappedFacilities?.type === 'FeatureCollection' && analyzeResults.snappedFacilities.features?.length) {
        layersRef.current.dynamicSnappedNode = L.geoJSON(analyzeResults.snappedFacilities, {
          pane: 'servicePoints',
          pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
            pane: 'servicePoints',
            radius: 6,
            fillColor: '#f59e0b',
            color: '#ffffff',
            weight: 2,
            fillOpacity: 0.95,
          }),
        }).addTo(map);
      }

      const validBounds = drawnBounds.filter((bounds) => bounds.isValid());
      if (validBounds.length) {
        const combined = validBounds.reduce((bounds, next) => bounds.extend(next), validBounds[0]);
        map.fitBounds(combined, { padding: [36, 36], maxZoom: 15 });
      }
    }
  }, [analyzeResults, activeTab, analysisLayers, contourResults, analysisCostType, analysisLimit]);

  const handleAnalyze = async () => {
    if (!inspectCoords) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeResults(null);
    setContourResults([]);

    try {
      const request = {
        facilities: [
          {
            lat: inspectCoords.lat,
            lng: inspectCoords.lng,
            name: 'จุดวิเคราะห์หลัก',
            type: 'inspect'
          }
        ],
        mode: analysisMode,
        costType: analysisCostType,
        limit: analysisCostType === 'time' ? analysisLimit : analyzeDistance
      };
      if (analysisCostType === 'time') {
        const response = await analyzeServiceAreaContours(request);
        if (!response.contours.length || response.contours.some((contour) => (
          contour.result.analysisQuality !== 'network'
          || !isFeatureCollection(contour.result.reachableRoads)
          || contour.result.reachableRoads.features.length === 0
        ))) {
          throw new Error('ROAD_NETWORK_REQUIRED');
        }
        setContourResults(response.contours);
        const selectedMinutes = analysisLimit / 60;
        const selected = response.contours.find((contour) => contour.minutes === selectedMinutes)
          || response.contours.find((contour) => contour.minutes === 15)
          || response.contours[0];
        if (selected) {
          setAnalysisLayers((previous) => ({
            ...previous,
            contour_10: false,
            contour_15: false,
            contour_30: false,
            [contourLayerKey(selected.minutes)]: true,
          }));
        }
        setAnalyzeResults(selected?.result || null);
        if (response.traffic) setTrafficStatus(response.traffic);
      } else {
        const data = await analyzeServiceArea(request);
        if (data.analysisQuality !== 'network' || !isFeatureCollection(data.reachableRoads) || !data.reachableRoads.features.length) {
          throw new Error('ROAD_NETWORK_REQUIRED');
        }
        setAnalyzeResults(data);
      }
      const label = analysisCostType === 'time' ? `${Math.round(analysisLimit / 60)} นาที` : `${analyzeDistance} ม.`;
      setMessage(`แสดงพื้นที่ที่เข้าถึงได้ภายใน ${label} พร้อมสถานที่สำคัญในบริเวณแล้ว`);
    } catch (e: any) {
      console.error('Analysis failed:', e);
      setAnalyzeError('ยังไม่พบโครงข่ายถนนที่พร้อมคำนวณจากจุดนี้ กรุณาลองอีกครั้ง');
      setMessage('ยังไม่สามารถคำนวณบนโครงข่ายถนนได้ กรุณาลองอีกครั้ง');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleExportGeoJSON = () => {
    if (!analyzeResults || !analyzeResults.serviceArea) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(analyzeResults.serviceArea));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    const suffix = analysisCostType === 'time' ? `${analysisMode}-${analysisLimit}s` : `${analysisMode}-${analyzeDistance}m`;
    downloadAnchor.setAttribute("download", `service-area-${suffix}.geojson`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const visibleDashboardDomainCount = useMemo(
    () => ACCESSIBILITY_DOMAINS.filter((domain) => (
      domain.categoryKeys.some((category) => dashboardLayers[category])
    )).length,
    [dashboardLayers],
  );

  const visibleDashboardLayerCount = visibleDashboardDomainCount
    + (showDistrictCoverage ? 1 : 0)
    + (showPoiMarkers && visibleDashboardDomainCount > 0 ? 1 : 0);

  const setDashboardDomainVisibility = (domainKey: string, visible: boolean) => {
    const domain = ACCESSIBILITY_DOMAINS.find((item) => item.key === domainKey);
    if (!domain) return;
    setDashboardLayers((current) => ({
      ...current,
      ...Object.fromEntries(domain.categoryKeys.map((category) => [category, visible])),
    }));
  };

  const nearbyPlaces = useMemo<NearbyPlace[]>(() => {
    if (!inspectCoords || !isFeatureCollection(analyzeResults?.serviceArea)) return [];
    const serviceAreas = analyzeResults.serviceArea.features
      .filter((feature: any) => feature?.geometry && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type))
      .map((feature: any) => ({ feature, bounds: geometryBounds(feature.geometry) }))
      .filter((item: any) => item.bounds);
    if (!serviceAreas.length) return [];

    const places: NearbyPlace[] = [];
    Object.entries(ACCESSIBILITY_PALETTE).forEach(([category, config]) => {
      const collection = loadedAccessibilityData[`${category}-pois`];
      if (!isFeatureCollection(collection)) return;
      collection.features.forEach((feature: any, index: number) => {
        if (feature?.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) return;
        const [lng, lat] = feature.geometry.coordinates.map(Number);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const inside = serviceAreas.some(({ feature: polygon, bounds }: any) => (
          lng >= bounds[0] && lng <= bounds[2] && lat >= bounds[1] && lat <= bounds[3]
          && booleanPointInPolygon(feature, polygon)
        ));
        if (!inside) return;
        places.push({
          id: `${category}-${feature.id ?? feature.properties?.id ?? index}`,
          name: feature.properties?.name || config.name,
          district: feature.properties?.district || '',
          category,
          categoryName: config.name,
          color: config.primary,
          emoji: config.emoji,
          lat,
          lng,
          distanceKm: haversineKm(inspectCoords.lat, inspectCoords.lng, lat, lng),
        });
      });
    });
    return places.sort((left, right) => left.distanceKm - right.distanceKm);
  }, [analyzeResults, inspectCoords, loadedAccessibilityData]);

  const analysisPlaceOptions = useMemo(() => {
    const counts = nearbyPlaces.reduce((result, place) => {
      result[place.category] = (result[place.category] || 0) + 1;
      return result;
    }, {} as Record<string, number>);
    return Object.entries(ACCESSIBILITY_PALETTE)
      .filter(([category]) => (counts[category] || 0) > 0)
      .map(([key, config]) => ({
        key,
        name: config.name,
        emoji: config.emoji,
        color: config.primary,
        count: counts[key],
      }));
  }, [nearbyPlaces]);

  const visibleNearbyPlaces = useMemo(
    () => nearbyPlaces.filter((place) => analysisPlaceLayers[place.category] ?? false),
    [analysisPlaceLayers, nearbyPlaces],
  );

  const visibleAnalysisLayerCount = useMemo(() => {
    const baseCount = (inspectCoords && analysisLayers.startPoint ? 1 : 0)
      + (analyzeResults && analysisLayers.reachableRoads ? 1 : 0)
      + (analyzeResults && analysisLayers.snappedNode ? 1 : 0);
    const contourCount = contourResults.filter((contour) => analysisLayers[contourLayerKey(contour.minutes)]).length;
    const placeCount = analysisPlaceOptions.filter((option) => analysisPlaceLayers[option.key]).length;
    const distanceAreaCount = analysisCostType === 'distance' && analysisLayers.serviceArea ? 1 : 0;
    return baseCount + contourCount + placeCount + distanceAreaCount;
  }, [analysisCostType, analysisLayers, analysisPlaceLayers, analysisPlaceOptions, analyzeResults, contourResults, inspectCoords]);

  const isLoadingNearbyPlaces = Boolean(analyzeResults) && Object.keys(ACCESSIBILITY_PALETTE).some((category) => (
    loadingLayers[`${category}-pois`] || !loadedAccessibilityData[`${category}-pois`]
  ));

  const isBangkokCoordinate = (lat: number, lng: number) => (
    lat >= BANGKOK_BOUNDS.minLat &&
    lat <= BANGKOK_BOUNDS.maxLat &&
    lng >= BANGKOK_BOUNDS.minLng &&
    lng <= BANGKOK_BOUNDS.maxLng
  );

  const getPlaceLabel = (place: PlaceSearchResult) => {
    const parts = place.display_name.split(',').map((part) => part.trim()).filter(Boolean);
    return parts.slice(0, 3).join(', ') || place.display_name;
  };

  const handlePlaceSearch = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const query = placeQuery.trim();
    if (!query) {
      setPlaceResults([]);
      setPlaceSearchError('พิมพ์ชื่อสถานที่ก่อนค้นหา');
      return;
    }

    const requestId = placeSearchRequestRef.current + 1;
    placeSearchRequestRef.current = requestId;
    setIsSearchingPlace(true);
    setPlaceSearchError(null);

    try {
      const params = new URLSearchParams({
        format: 'jsonv2',
        q: `${query} กรุงเทพมหานคร`,
        limit: '6',
        addressdetails: '1',
        bounded: '1',
        viewbox: BANGKOK_SEARCH_VIEWBOX,
        countrycodes: 'th',
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'th,en',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as PlaceSearchResult[];
      if (placeSearchRequestRef.current !== requestId) return;

      const bangkokResults = data.filter((place) => {
        const lat = Number(place.lat);
        const lng = Number(place.lon);
        return Number.isFinite(lat) && Number.isFinite(lng) && isBangkokCoordinate(lat, lng);
      });

      setPlaceResults(bangkokResults);
      if (!bangkokResults.length) {
        setPlaceSearchError('ไม่พบสถานที่ในกรุงเทพฯ');
      }
    } catch (error) {
      console.error('Place search failed:', error);
      if (placeSearchRequestRef.current === requestId) {
        setPlaceResults([]);
        setPlaceSearchError('ค้นหาสถานที่ไม่สำเร็จ');
      }
    } finally {
      if (placeSearchRequestRef.current === requestId) {
        setIsSearchingPlace(false);
      }
    }
  };

  useEffect(() => {
    if (analysisCostType !== 'time' || !contourResults.length) return;
    const selected = contourResults.find((contour) => contour.minutes === analysisLimit / 60);
    if (selected) setAnalyzeResults(selected.result);
  }, [analysisCostType, analysisLimit, contourResults]);

  const handleSelectPlace = (place: PlaceSearchResult) => {
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const coords = L.latLng(lat, lng);
    const label = getPlaceLabel(place);
    setInspectCoords(coords);
    setSelectedPlaceName(label);
    setPlaceQuery(label);
    setPlaceResults([]);
    setPlaceSearchError(null);
    setAnalyzeResults(null);
    setContourResults([]);
    setAnalyzeError(null);
    mapRef.current?.setView(coords, 16);
    setMessage(`กำหนดจุดวิเคราะห์: ${label}`);
  };

  const handleClearAnalysisPoint = () => {
    setInspectCoords(null);
    setSelectedPlaceName('');
    setAnalyzeResults(null);
    setContourResults([]);
    setAnalyzeError(null);
    setPlaceSearchError(null);
    setMessage('เลือกสถานที่หรือคลิกบนแผนที่เพื่อเริ่มวิเคราะห์การเข้าถึง');
  };

  const handleUseMapCenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    setInspectCoords(center);
    setSelectedPlaceName('จุดกึ่งกลางแผนที่');
    setPlaceResults([]);
    setPlaceSearchError(null);
    setAnalyzeResults(null);
    setContourResults([]);
    setAnalyzeError(null);
    setMessage('วางจุดวิเคราะห์ที่กึ่งกลางแผนที่แล้ว');
  };

  const handleZoomDistrict = (code: string) => {
    if (!isFeatureCollection(districtsGeojson) || !mapRef.current) return;
    const feature = districtsGeojson.features.find((item: any) => districtStatsCode(item) === code);
    if (!feature) return;
    const bounds = L.geoJSON(feature).getBounds();
    if (bounds.isValid()) {
      setSelectedDistrictCode(code);
      mapRef.current.fitBounds(bounds, { padding: [44, 44], maxZoom: 13 });
    }
  };

  const handleSelectNearbyPlace = (place: NearbyPlace) => {
    const map = mapRef.current;
    if (!map) return;
    const location = L.latLng(place.lat, place.lng);
    map.setView(location, Math.max(map.getZoom(), 16));
    L.popup({ className: 'nearby-place-popup', closeButton: true })
      .setLatLng(location)
      .setContent(`<strong>${escapeHtml(place.name)}</strong><br><span>${escapeHtml(place.categoryName)} · เขต${escapeHtml(place.district || 'ไม่ระบุ')}</span>`)
      .openOn(map);
  };

  useEffect(() => {
    const map = mapRef.current;
    layersRef.current.dynamicNearbyPlaces?.remove();
    layersRef.current.dynamicNearbyPlaces = null;
    if (!map || activeTab !== 'analyze' || !visibleNearbyPlaces.length) return;

    const markers = visibleNearbyPlaces.map((place) => {
      const marker = L.marker([place.lat, place.lng], {
        pane: 'servicePoints',
        icon: L.divIcon({
          className: 'nearby-map-marker-wrap',
          html: `<div class="nearby-map-marker" style="--marker-color:${place.color}"><span>${place.emoji}</span></div>`,
          iconSize: [26, 30],
          iconAnchor: [13, 28],
          tooltipAnchor: [0, -24],
        }),
      });
      marker.bindTooltip(
        `<strong>${escapeHtml(place.name)}</strong><br><span>${escapeHtml(place.categoryName)} · เขต${escapeHtml(place.district || 'ไม่ระบุ')}</span>`,
        { direction: 'top', className: 'nearby-map-tooltip' },
      );
      marker.on('click', () => handleSelectNearbyPlace(place));
      return marker;
    });
    layersRef.current.dynamicNearbyPlaces = L.layerGroup(markers).addTo(map);
  }, [activeTab, visibleNearbyPlaces]);

  return (
    <main className={`app-shell ${basemapMode === 'dark' ? 'is-dark-map' : 'is-light-map'}`}>
      {/* MAP STAGE */}
      <section className="map-stage">
        <div
          id="map"
          className={`zoom-${currentZoom} ${activeTab === 'analyze' && !inspectCoords ? 'is-picking-point' : ''}`}
          aria-label="แผนที่วิเคราะห์พื้นที่บริการครบ 50 เขต กรุงเทพมหานคร"
        />

        {activeTab === 'analyze' && !inspectCoords && (
          <div className="map-pick-guide" aria-live="polite">
            <span className="map-pick-guide-icon"><MapPin size={24} /></span>
            <div>
              <strong>คลิกบนแผนที่เพื่อวางจุดเริ่มต้น</strong>
              <small>หรือค้นหาสถานที่จากช่องด้านซ้ายบน</small>
            </div>
          </div>
        )}

        {/* Map float toolbar */}
        <div className="map-toolbar" aria-label="Map tools">
          <button
            onClick={() => {
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
          {trafficStatus?.available ? (
            <button
              type="button"
              className={showTraffic ? 'is-active' : ''}
              onClick={() => setShowTraffic((visible) => !visible)}
              title={showTraffic ? 'ซ่อนสภาพจราจรสด' : 'แสดงสภาพจราจรสด'}
            >
              <Activity size={18} />
            </button>
          ) : (
            <a
              href={trafficStatus?.viewerUrl || 'https://cpudapp.bangkok.go.th/bmatraffic/'}
              target="_blank"
              rel="noreferrer"
              title="เปิด BMA Traffic"
            >
              <Activity size={18} />
              <ExternalLink size={10} />
            </a>
          )}
        </div>

        <div className={`webmap-control-stack ${activeTab === 'analyze' ? 'has-search' : 'only-layers'}`}>
          {activeTab === 'analyze' && (
            <div className="webmap-search-panel">
              <form className="place-search-form is-map-control" onSubmit={handlePlaceSearch}>
                <div className="place-search-input-wrap">
                  <Search size={16} />
                  <input
                    type="search"
                    placeholder="ค้นหาสถานที่ในกรุงเทพฯ"
                    value={placeQuery}
                    onChange={(event) => setPlaceQuery(event.target.value)}
                  />
                </div>
                <button type="submit" disabled={isSearchingPlace}>
                  {isSearchingPlace ? <Loader2 className="spin" size={15} /> : <Search size={15} />}
                  <span>{isSearchingPlace ? 'ค้นหา...' : 'ค้นหา'}</span>
                </button>
              </form>

              {placeSearchError && <p className="place-search-error">{placeSearchError}</p>}

              {placeResults.length > 0 && (
                <div className="place-results-list is-map-control">
                  {placeResults.map((place) => (
                    <button
                      key={place.place_id}
                      type="button"
                      className="place-result-item"
                      onClick={() => handleSelectPlace(place)}
                    >
                      <MapPin size={15} />
                      <span>{getPlaceLabel(place)}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className={`selected-point-card is-map-control ${inspectCoords ? 'has-point' : 'is-awaiting'}`} aria-live="polite">
                <MapPin size={20} />
                <div>
                  <span>{inspectCoords ? 'จุดเริ่มต้นที่เลือก' : 'ขั้นตอนที่ 1 · เลือกจุดเริ่มต้น'}</span>
                  <strong>
                    {inspectCoords
                      ? selectedPlaceName || `${inspectCoords.lat.toFixed(6)}, ${inspectCoords.lng.toFixed(6)}`
                      : 'คลิกตำแหน่งบนแผนที่ หรือค้นหาสถานที่'}
                  </strong>
                  <small>
                    {inspectCoords
                      ? `${inspectCoords.lat.toFixed(6)}, ${inspectCoords.lng.toFixed(6)} · ลากหมุดเพื่อปรับได้`
                      : 'เลื่อนแผนที่แล้วใช้จุดกึ่งกลางก็ได้'}
                  </small>
                </div>
                {inspectCoords && (
                  <button type="button" onClick={handleClearAnalysisPoint}>
                    ล้าง
                  </button>
                )}
              </div>
            </div>
          )}

          <div className={`webmap-layer-widget ${isLayerPanelOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="webmap-layer-toggle"
              onClick={() => setIsLayerPanelOpen((open) => !open)}
              aria-expanded={isLayerPanelOpen}
              title="เปิด/ปิดชั้นข้อมูล"
            >
              <Layers size={18} />
              <span>ชั้นข้อมูล</span>
              <strong>{activeTab === 'dashboard' ? visibleDashboardLayerCount : visibleAnalysisLayerCount}</strong>
            </button>

            {isLayerPanelOpen && (
              <div className="webmap-layer-panel">
                <div className="webmap-panel-header">
                  <div>
                    <span>การแสดงผล</span>
                    <h2>{activeTab === 'dashboard' ? 'ชั้นข้อมูลบริการ' : 'ชั้นข้อมูลผลวิเคราะห์'}</h2>
                  </div>
                  <button type="button" onClick={() => setIsLayerPanelOpen(false)} title="ปิดแผงชั้นข้อมูล">
                    <X size={16} />
                  </button>
                </div>

                {activeTab === 'dashboard' ? (
                  <>
                    <div className="travel-mode-selector is-map-control">
                      <button className={dashboardTravelMode === 'walk' ? 'is-active' : ''} onClick={() => setDashboardTravelMode('walk')} type="button">
                        <Footprints size={16} />
                        <span>เดิน</span>
                      </button>
                      <button className={dashboardTravelMode === 'cycle' ? 'is-active' : ''} onClick={() => setDashboardTravelMode('cycle')} type="button">
                        <Bike size={16} />
                        <span>จักรยาน</span>
                      </button>
                      <button className={dashboardTravelMode === 'drive' ? 'is-active' : ''} onClick={() => setDashboardTravelMode('drive')} type="button">
                        <Car size={16} />
                        <span>รถยนต์</span>
                      </button>
                    </div>

                    <div className="dashboard-map-options">
                      <label className="webmap-poi-toggle is-primary-map-layer">
                        <input
                          type="checkbox"
                          checked={showDistrictCoverage}
                          onChange={(event) => setShowDistrictCoverage(event.target.checked)}
                        />
                        <span>
                          <strong>สีเปรียบเทียบรายเขต</strong>
                          <small>{ACCESSIBILITY_DOMAINS.find((domain) => domain.key === dashboardFocusDomain)?.name}</small>
                        </span>
                      </label>

                      <div className="map-layer-divider">
                        <span>พื้นที่เข้าถึง 15 นาที</span>
                        <small>ปิดไว้เมื่อเริ่มใช้งาน</small>
                      </div>

                      <div className="domain-layer-options is-map-control">
                        {ACCESSIBILITY_DOMAINS.map((domain) => {
                          const isVisible = domain.categoryKeys.every((category) => dashboardLayers[category]);
                          const isLoading = domain.categoryKeys.some((category) => (
                            loadingLayers[`${category}-area-${dashboardTravelMode}`]
                            || loadingLayers[`${category}-pois`]
                          ));
                          return (
                            <label key={domain.key} className="domain-layer-row">
                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={(event) => setDashboardDomainVisibility(domain.key, event.target.checked)}
                              />
                              <i style={{ backgroundColor: domain.color }} />
                              <span>
                                <strong>{domain.name}</strong>
                                <small>{domain.categoryKeys.length} ชุดข้อมูล</small>
                              </span>
                              {isLoading && <Loader2 className="spin" size={13} />}
                            </label>
                          );
                        })}
                      </div>

                      <label className="webmap-poi-toggle">
                        <input
                          type="checkbox"
                          checked={showPoiMarkers}
                          disabled={visibleDashboardDomainCount === 0}
                          onChange={(event) => setShowPoiMarkers(event.target.checked)}
                        />
                        <span>
                          <strong>หมุดสถานที่</strong>
                          <small>{visibleDashboardDomainCount ? 'แสดงเฉพาะด้านที่เปิดอยู่' : 'เปิดด้านบริการก่อน'}</small>
                        </span>
                      </label>
                    </div>
                  </>
                ) : (
                  <LayerControl
                    layers={analysisLayers}
                    contours={contourResults.map((contour) => contour.minutes)}
                    placeLayers={analysisPlaceLayers}
                    placeOptions={analysisPlaceOptions}
                    onChange={setAnalysisLayers}
                    onPlaceChange={setAnalysisPlaceLayers}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <div className="map-mode-badge">
          {activeTab === 'dashboard'
            ? (visibleDashboardLayerCount > 0 ? 'เปิดชั้นวิเคราะห์การเข้าถึงแล้ว' : 'แผนที่ฐานกรุงเทพฯ ไม่มีชั้นวิเคราะห์')
            : 'พื้นที่เข้าถึงจากจุดที่เลือก'}
        </div>

        {activeTab === 'analyze' && analyzeResults && (
          <div className="analysis-map-summary" aria-label="สรุปผลบนแผนที่">
            <span>{analysisCostType === 'time' ? `${Math.round(analysisLimit / 60)} นาที` : `${analyzeDistance.toLocaleString()} เมตร`}</span>
            <strong>{Number(analyzeResults.metrics.serviceAreaSqKm || 0).toLocaleString()} ตร.กม.</strong>
            <small>{nearbyPlaces.length.toLocaleString()} สถานที่ · {analyzeResults.intersectingDistricts.length} เขต</small>
          </div>
        )}

        {activeTab === 'dashboard' && showDistrictCoverage && (
          <div className="coverage-map-legend" aria-label="คำอธิบายสีความครอบคลุม">
            <div><span>สัดส่วนพื้นที่ครอบคลุมเฉลี่ย</span><strong>{ACCESSIBILITY_DOMAINS.find((domain) => domain.key === dashboardFocusDomain)?.name}</strong></div>
            <ul>
              <li><i style={{ background: '#ef4444' }} />0–20</li>
              <li><i style={{ background: '#fb923c' }} />20–40</li>
              <li><i style={{ background: '#facc15' }} />40–60</li>
              <li><i style={{ background: '#38bdf8' }} />60–80</li>
              <li><i style={{ background: '#14b8a6' }} />80–100%</li>
            </ul>
          </div>
        )}

        {activeTab === 'analyze' && contourResults.some((contour) => analysisLayers[contourLayerKey(contour.minutes)]) && (
          <div className="contour-map-legend" aria-label="ช่วงเวลาพื้นที่เข้าถึง">
            <strong>พื้นที่ตามเวลา</strong>
            {contourResults
              .filter((contour) => analysisLayers[contourLayerKey(contour.minutes)])
              .map((contour) => (
                <span key={contour.minutes}>
                  <i style={{ background: contour.minutes === 10 ? '#14b8a6' : contour.minutes === 15 ? '#38bdf8' : '#8b5cf6' }} />
                  {contour.minutes} นาที
                </span>
              ))}
          </div>
        )}
      </section>

      {/* CONTROL SIDEBAR */}
      <aside className="control-panel">
        {/* BRAND ROW */}
        <div className="brand-row">
          <div className="brand-mark">
            <Radar size={25} />
          </div>
          <div>
            <p className="eyebrow">ระบบวางแผนการเข้าถึงบริการ</p>
            <h1>เมืองเข้าถึงได้ กรุงเทพฯ</h1>
          </div>
          <span className="brand-version">v2.0</span>
        </div>

        {/* TAB SWITCHER */}
        <div className="tab-switcher">
          <button 
            className={`tab-btn ${activeTab === 'dashboard' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <BarChart3 size={16} />
            <span>ภาพรวมผู้บริหาร</span>
          </button>
          <button 
            className={`tab-btn ${activeTab === 'analyze' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('analyze')}
          >
            <MapPin size={16} />
            <span>วิเคราะห์รายจุด</span>
          </button>
        </div>

        {activeTab === 'dashboard' && (
          <ExecutiveDashboard
            stats={dashboardStats}
            mode={dashboardTravelMode}
            focusDomain={dashboardFocusDomain}
            selectedDistrictCode={selectedDistrictCode}
            onModeChange={setDashboardTravelMode}
            onFocusDomainChange={setDashboardFocusDomain}
            onSelectDistrict={setSelectedDistrictCode}
            onZoomDistrict={handleZoomDistrict}
          />
        )}

        {activeTab === 'analyze' && (
          /* DYNAMIC ANALYSIS PANEL */
          <>
            <section className={`point-workflow-card ${inspectCoords ? 'is-ready' : ''}`}>
              <span className="section-step">1</span>
              <div className="point-workflow-content">
                <span>{inspectCoords ? 'พร้อมวิเคราะห์' : 'เริ่มจากเลือกตำแหน่ง'}</span>
                <strong>
                  {inspectCoords
                    ? selectedPlaceName || 'จุดที่เลือกบนแผนที่'
                    : 'เลือกจุดเริ่มต้นให้ชัดเจน'}
                </strong>
                <small>
                  {inspectCoords
                    ? `${inspectCoords.lat.toFixed(5)}, ${inspectCoords.lng.toFixed(5)}`
                    : 'คลิกแผนที่ ค้นหาสถานที่ หรือวางหมุดที่กึ่งกลางแผนที่'}
                </small>
              </div>
              <button
                type="button"
                onClick={inspectCoords ? handleClearAnalysisPoint : handleUseMapCenter}
              >
                <MapPin size={15} />
                {inspectCoords ? 'เลือกใหม่' : 'ใช้จุดกึ่งกลาง'}
              </button>
            </section>

            <section className="workflow-card">
              <div className="section-header">
                <div>
                  <span className="section-step">2</span>
                  <div>
                    <h2>กำหนดการเดินทาง</h2>
                    <p>{inspectCoords ? 'เลือกวิธีเดินทางและระยะเวลาที่ต้องการ' : 'เลือกจุดเริ่มต้นก่อน แล้วจึงกำหนดการเดินทาง'}</p>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '8px' }}>
                <AnalyzePanel
                  mode={analysisMode}
                  costType={analysisCostType}
                  limit={analysisCostType === 'time' ? analysisLimit : analyzeDistance}
                  disabled={!inspectCoords}
                  loading={isAnalyzing}
                  onModeChange={setAnalysisMode}
                  onCostTypeChange={setAnalysisCostType}
                  onLimitChange={(value) => {
                    if (analysisCostType === 'time') setAnalysisLimit(value);
                    else setAnalyzeDistance(value);
                  }}
                  onAnalyze={handleAnalyze}
                />
              </div>

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
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>สรุปพื้นที่ที่เดินทางไปถึงได้</span>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, marginTop: '2px' }}>
                      📍 ภายใน {analysisCostType === 'time' ? `${Math.round(analysisLimit / 60)} นาที` : `${analyzeDistance} เมตร`}
                    </h2>
                  </div>
                </div>

                {contourResults.length > 0 && (
                  <div className="contour-result-selector" aria-label="เลือกช่วงเวลาสรุปผล">
                    {contourResults.map((contour) => (
                      <button
                        key={contour.minutes}
                        type="button"
                        className={analysisLimit / 60 === contour.minutes ? 'is-active' : ''}
                        onClick={() => setAnalysisLimit(contour.minutes * 60)}
                      >
                        <strong>{contour.minutes}</strong>
                        <span>นาที</span>
                      </button>
                    ))}
                  </div>
                )}

                {analyzeResults.population?.reachedEstimate > 0 && (
                  <div className="population-impact-card">
                    <div>
                      <span>ประชากรที่คาดว่าเข้าถึงได้</span>
                      <strong>{Number(analyzeResults.population.reachedEstimate).toLocaleString()} <i>คน</i></strong>
                    </div>
                    <div className="population-impact-share">
                      <strong>
                        {analyzeResults.population.bangkokPopulation
                          ? ((analyzeResults.population.reachedEstimate / analyzeResults.population.bangkokPopulation) * 100).toFixed(1)
                          : '0.0'}%
                      </strong>
                      <span>ของประชากรทะเบียน กทม.</span>
                    </div>
                    <small>ค่าประมาณจากประชากรรายเขต ปี {analyzeResults.population.referenceYear} และสัดส่วนพื้นที่ที่ครอบคลุม</small>
                  </div>
                )}

                <div className="analysis-overview-grid">
                  <div className="analysis-overview-item is-area">
                    <span>ขนาดพื้นที่</span>
                    <strong>{analyzeResults.metrics.serviceAreaSqKm} <i>ตร.กม.</i></strong>
                  </div>
                  <div className="analysis-overview-item is-road">
                    <span>ระยะถนนที่ครอบคลุม</span>
                    <strong>{analyzeResults.metrics.reachedRoadLengthKm} <i>กม.</i></strong>
                  </div>
                  <div className="analysis-overview-item is-place">
                    <span>สถานที่ในพื้นที่</span>
                    <strong>{nearbyPlaces.length.toLocaleString()} <i>แห่ง</i></strong>
                  </div>
                  <div className="analysis-overview-item is-district">
                    <span>เขตที่ครอบคลุม</span>
                    <strong>{analyzeResults.intersectingDistricts.length} <i>เขต</i></strong>
                  </div>
                </div>

                <div className="result-subsection-head">
                  <h2>เขตที่ครอบคลุม</h2>
                </div>
                <div className="covered-district-list">
                  {analyzeResults.intersectingDistricts.map((d: any, index: number) => (
                    <span key={`${d.id ?? 'district'}-${d.name}-${index}`}>เขต{d.name}</span>
                  ))}
                  {analyzeResults.intersectingDistricts.length === 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ไม่พาดผ่านเขตใด</span>
                  )}
                </div>

                <NearbyPlaces
                  places={nearbyPlaces}
                  loading={isLoadingNearbyPlaces}
                  onSelect={handleSelectNearbyPlace}
                />

                <button
                  onClick={handleExportGeoJSON}
                  className="export-area-button"
                >
                  <Download size={14} />
                  <span>ดาวน์โหลดขอบเขตพื้นที่</span>
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
