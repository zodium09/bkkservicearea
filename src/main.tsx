import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Bike,
  Footprints,
  Loader2,
  Moon,
  Radar,
  RefreshCw,
  Search,
  Sun,
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

  // 15-Minute City Dashboard State
  const [dashboardLayers, setDashboardLayers] = useState<Record<string, boolean>>({
    health: true,
    education: false,
    parks: false,
    transit: false,
  });
  const [dashboardTravelMode, setDashboardTravelMode] = useState<'walk' | 'cycle'>('walk');
  const [activeLeaderboardCategory, setActiveLeaderboardCategory] = useState<string>('health');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [districtsGeojson, setDistrictsGeojson] = useState<any>(null);
  const [selectedDistrictCode, setSelectedDistrictCode] = useState<string | number | null>(null);
  const [districtSearch, setDistrictSearch] = useState<string>('');
  const [loadedAccessibilityData, setLoadedAccessibilityData] = useState<Record<string, any>>({});
  const [loadingLayers, setLoadingLayers] = useState<Record<string, boolean>>({});

  // Leaflet Layer References
  const layersRef = useRef<{
    basemap: L.TileLayer | null;
    districts: L.GeoJSON | null;
    accessibility: Record<string, L.GeoJSON>;
    pois: Record<string, L.GeoJSON>;
  }>({
    basemap: null,
    districts: null,
    accessibility: {},
    pois: {},
  });

  // Fetch initial data directly from static assets
  useEffect(() => {
    // Fetch precomputed stats
    fetch('/data/processed/accessibility/stats.json')
      .then((r) => r.json())
      .then(setDashboardStats)
      .catch((e) => console.error('Failed to load accessibility stats:', e));

    // Fetch districts boundary
    fetch('/data/processed/bma-layers/layer-13.geojson')
      .then((r) => r.json())
      .then(setDistrictsGeojson)
      .catch((e) => console.error('Failed to load districts boundary:', e));
  }, []);

  // Load accessibility layer GeoJSON on demand from static assets
  const loadAccessibilityLayer = async (category: string, type: string) => {
    const key = `${category}-${type}`;
    if (loadedAccessibilityData[key]) return loadedAccessibilityData[key];

    setLoadingLayers((prev) => ({ ...prev, [key]: true }));
    try {
      const response = await fetch(`/data/processed/accessibility/${category}-${type}.geojson`);
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

  // Sync/Redraw Map Layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // --- 1. Clean Up Old Layers ---
    layersRef.current.districts?.remove();
    layersRef.current.districts = null;

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
          onEachFeature: (feature, layer: L.Layer) => {
            layer.bindTooltip(`<strong>${escapeHtml(feature.properties.name)}</strong><br>เขต${escapeHtml(feature.properties.district)}`, {
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
  ]);

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
        <div id="map" aria-label="Bangkok 15-Minute City Map" />

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
        <div className="map-mode-badge">📊 โหมดเมือง 15 นาที (15-Min City)</div>
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
          </div>

          <div className="section-header" style={{ marginTop: '18px' }}>
            <h2>2. ชั้นข้อมูลความสะดวก (เลือกเพื่อแสดงบนแผนที่)</h2>
          </div>
          <div className="accessibility-layers-list">
            {Object.entries(ACCESSIBILITY_PALETTE).map(([key, config]) => {
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
                >
                  <label className="acc-layer-label" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={(e) => {
                        setDashboardLayers((prev) => ({ ...prev, [key]: e.target.checked }));
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

            {/* Visual Progress Bar */}
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
              <button className="clear-search-btn" onClick={() => setDistrictSearch('')}>
                ×
              </button>
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

        <p className="message">{message}</p>
      </aside>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
