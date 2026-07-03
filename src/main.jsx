import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity,
  Building2,
  Download,
  Layers,
  Loader2,
  MapPin,
  Moon,
  Play,
  Radar,
  RefreshCw,
  Route,
  Satellite,
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

const LAYER_PRESETS = [
  {
    id: 'rapid-transit',
    name: 'รถไฟฟ้า',
    description: 'แนวรถไฟฟ้า',
    layerIds: [3],
  },
  {
    id: 'public-transport',
    name: 'ขนส่งสาธารณะ',
    description: 'รถไฟฟ้า รถไฟ และโครงข่ายถนน',
    layerIds: [3, 6, 7],
  },
  {
    id: 'service-network',
    name: 'โครงข่ายวิเคราะห์',
    description: 'ถนนและขอบเขตเขต',
    layerIds: [7, 13],
  },
  {
    id: 'district-context',
    name: 'เขตพื้นที่',
    description: 'เขต แขวง และเส้นเขต',
    layerIds: [2, 12, 13],
  },
];

function styleForBmaLayer(layer, basemapMode) {
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function popupHtml(feature, layerName) {
  const entries = Object.entries(feature.properties || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 6);
  const rows = entries
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');
  return `<strong>${escapeHtml(layerName)}</strong><table>${rows}</table>`;
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
  const layersRef = useRef({});
  const basemapLayerRef = useRef(null);
  const activeToolRef = useRef('add');
  const [facilities, setFacilities] = useState([]);
  const [travelMinutes, setTravelMinutes] = useState(15);
  const [speedKmh, setSpeedKmh] = useState(6);
  const [analysis, setAnalysis] = useState(null);
  const [qgis, setQgis] = useState(null);
  const [basemapMeta, setBasemapMeta] = useState(null);
  const [layerCatalog, setLayerCatalog] = useState(null);
  const [visibleBmaLayers, setVisibleBmaLayers] = useState({});
  const [layerLoadStatus, setLayerLoadStatus] = useState({});
  const [basemapMode, setBasemapMode] = useState('dark');
  const [layerPanelOpen, setLayerPanelOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState('add');
  const [message, setMessage] = useState('คลิกบนแผนที่เพื่อเพิ่มจุดบริการ');

  const summary = useMemo(() => {
    if (!analysis) {
      return [
        { label: 'จุดบริการ', value: facilities.length },
        { label: 'เวลาเดินทาง', value: `${travelMinutes} นาที` },
        { label: 'Engine', value: qgis?.found ? 'QGIS ready' : 'Network JS' },
      ];
    }

    return [
      { label: 'จุดบริการ', value: analysis.metrics.facilities },
      { label: 'ถนนเข้าถึง', value: `${analysis.metrics.reachedRoadLengthKm.toLocaleString()} กม.` },
      { label: 'เวลา', value: `${analysis.metrics.travelMinutes} นาที` },
    ];
  }, [analysis, facilities.length, qgis, travelMinutes]);

  useEffect(() => {
    fetch('/api/qgis/status').then((r) => r.json()).then(setQgis).catch(() => setQgis({ found: false }));
    fetch('/api/basemap/metadata').then((r) => r.json()).then(setBasemapMeta).catch(() => null);
    fetch('/api/processed-layers/catalog').then((r) => r.json()).then(setLayerCatalog).catch(() => null);
  }, []);

  const activeBmaLayerIds = useMemo(
    () => Object.entries(visibleBmaLayers).filter(([, visible]) => visible).map(([id]) => Number(id)),
    [visibleBmaLayers],
  );

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map('map', {
      zoomControl: false,
      preferCanvas: true,
    }).setView(BANGKOK_CENTER, 11);

    map.createPane('bmaData');
    map.createPane('analysisArea');
    map.createPane('analysisRoads');
    map.createPane('servicePoints');
    map.getPane('bmaData').style.zIndex = 410;
    map.getPane('analysisArea').style.zIndex = 430;
    map.getPane('analysisRoads').style.zIndex = 440;
    map.getPane('servicePoints').style.zIndex = 455;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.on('click', (event) => {
      if (activeToolRef.current !== 'add') return;
      setFacilities((items) => {
        const next = createFacilityFromLatLng(event.latlng, items.length);
        setMessage(`เพิ่ม ${next.name} แล้ว`);
        setAnalysis(null);
        return [...items, next];
      });
    });

    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    basemapLayerRef.current?.remove();
    const basemap = BASEMAPS[basemapMode];
    basemapLayerRef.current = L.tileLayer(basemap.url, {
      attribution: basemap.attribution,
      maxZoom: 20,
      className: `leaflet-basemap-${basemapMode}`,
    }).addTo(map);
  }, [basemapMode]);

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
        const style = styleForBmaLayer(layer, basemapMode);
        const geoJsonLayer = L.geoJSON(data, {
          pane: 'bmaData',
          style: () => style,
          pointToLayer: (_, latlng) => L.circleMarker(latlng, { ...style, pane: 'bmaData' }),
          onEachFeature: (feature, featureLayer) => {
            featureLayer.bindPopup(popupHtml(feature, layer.name));
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.facilities?.remove();
    const markerLayer = L.layerGroup(
      facilities.map((facility) =>
        L.circleMarker([facility.lat, facility.lng], {
          pane: 'servicePoints',
          radius: 8,
          weight: 3,
          color: basemapMode === 'dark' ? '#f8fafc' : '#0f172a',
          fillColor: facility.type === 'health' ? '#14b8a6' : facility.type === 'mobility' ? '#f59e0b' : '#38bdf8',
          fillOpacity: 0.95,
        }).bindPopup(`<strong>${escapeHtml(facility.name)}</strong><br>${facility.lat}, ${facility.lng}`),
      ),
    ).addTo(map);
    layersRef.current.facilities = markerLayer;
  }, [facilities, basemapMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.analysis?.remove();
    layersRef.current.roads?.remove();
    layersRef.current.snaps?.remove();

    if (!analysis) return;

    const serviceLayer = L.geoJSON(analysis.serviceArea, {
      pane: 'analysisArea',
      style: {
        color: '#0f766e',
        weight: 2,
        opacity: basemapMode === 'dark' ? 0.95 : 0.75,
        fillColor: basemapMode === 'dark' ? '#2dd4bf' : '#5eead4',
        fillOpacity: basemapMode === 'dark' ? 0.26 : 0.2,
      },
    }).addTo(map);

    const roadLayer = L.geoJSON(analysis.reachableRoads, {
      pane: 'analysisRoads',
      style: {
        color: basemapMode === 'dark' ? '#22d3ee' : '#0891b2',
        weight: basemapMode === 'dark' ? 5 : 4,
        opacity: basemapMode === 'dark' ? 0.98 : 0.9,
      },
    }).addTo(map);

    const snapLayer = L.geoJSON(analysis.snappedFacilities, {
      pointToLayer: (_, latlng) =>
        L.circleMarker(latlng, {
          pane: 'servicePoints',
          radius: 5,
          weight: 2,
          color: '#ffffff',
          fillColor: '#dc2626',
          fillOpacity: 1,
        }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(
          `<strong>${escapeHtml(feature.properties.name)}</strong><br>snap: ${escapeHtml(feature.properties.snapDistanceMeters)} ม.`,
        );
      },
    }).addTo(map);

    layersRef.current.analysis = serviceLayer;
    layersRef.current.roads = roadLayer;
    layersRef.current.snaps = snapLayer;

    const fitLayer = roadLayer.getBounds().isValid() ? roadLayer : serviceLayer;
    map.fitBounds(fitLayer.getBounds(), { padding: [32, 32] });
  }, [analysis, basemapMode]);

  async function runAnalysis() {
    if (!facilities.length) {
      setMessage('เพิ่มจุดบริการก่อนวิเคราะห์: คลิกบนแผนที่ หรือใช้ปุ่มเพิ่มจุดกลางแผนที่');
      return;
    }

    setBusy(true);
    setMessage(`กำลังวิเคราะห์พื้นที่บริการใน ${travelMinutes} นาที...`);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ facilities, travelMinutes, speedKmh }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysis(data);
      setMessage(`วิเคราะห์พื้นที่เข้าถึงภายใน ${travelMinutes} นาทีเสร็จแล้ว`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function clearAnalysis() {
    setFacilities([]);
    setAnalysis(null);
    setMessage('ล้างข้อมูลแล้ว คลิกบนแผนที่เพื่อเริ่มใหม่');
  }

  function addFacilityAtMapCenter() {
    const map = mapRef.current;
    if (!map) return;
    setFacilities((items) => {
      const next = createFacilityFromLatLng(map.getCenter(), items.length);
      setMessage(`เพิ่ม ${next.name} ที่กลางแผนที่แล้ว`);
      setAnalysis(null);
      return [...items, next];
    });
  }

  function toggleBmaLayer(layerId) {
    setVisibleBmaLayers((layers) => ({ ...layers, [layerId]: !layers[layerId] }));
  }

  function setDimensionVisibility(dimension, visible) {
    setVisibleBmaLayers((layers) => {
      const next = { ...layers };
      dimension.layers.forEach((layer) => {
        next[layer.id] = visible;
      });
      return next;
    });
  }

  function setAllBmaLayers(visible) {
    setVisibleBmaLayers((layers) => {
      const next = { ...layers };
      (layerCatalog?.layers || []).forEach((layer) => {
        next[layer.id] = visible;
      });
      return next;
    });
  }

  function applyLayerPreset(preset) {
    setVisibleBmaLayers(() => {
      const next = {};
      (layerCatalog?.layers || []).forEach((layer) => {
        next[layer.id] = preset.layerIds.includes(layer.id);
      });
      return next;
    });
    setLayerPanelOpen(true);
    setMessage(`แสดงชั้นข้อมูลชุด ${preset.name}`);
  }

  function isPresetActive(preset) {
    if (!layerCatalog) return false;
    const catalogIds = new Set((layerCatalog.layers || []).map((layer) => layer.id));
    return preset.layerIds
      .filter((id) => catalogIds.has(id))
      .every((id) => visibleBmaLayers[id]);
  }

  return (
    <main className={`app-shell ${basemapMode === 'dark' ? 'is-dark-map' : 'is-light-map'}`}>
      <section className="map-stage">
        <div id="map" aria-label="Bangkok service area map" />
        <div className="map-toolbar" aria-label="Map tools">
          <button className={activeTool === 'add' ? 'is-active' : ''} onClick={() => setActiveTool('add')} title="เพิ่มจุดบริการ">
            <MapPin size={19} />
          </button>
          <button onClick={() => mapRef.current?.setView(BANGKOK_CENTER, 11)} title="กลับสู่กรุงเทพฯ">
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => setBasemapMode((mode) => (mode === 'light' ? 'dark' : 'light'))}
            title={basemapMode === 'light' ? 'เปลี่ยนเป็นแผนที่มืด' : 'เปลี่ยนเป็นแผนที่สว่าง'}
          >
            {basemapMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button onClick={clearAnalysis} title="ล้างข้อมูล">
            <Trash2 size={18} />
          </button>
        </div>
        <div className="map-mode-badge">{BASEMAPS[basemapMode].name}</div>
      </section>

      <aside className="control-panel">
        <div className="brand-row">
          <div className="brand-mark">
            <Radar size={25} />
          </div>
          <div>
            <p className="eyebrow">Bangkok GIS</p>
            <h1>Service Area Analysis</h1>
          </div>
        </div>

        <div className="status-strip">
          <span className={qgis?.found ? 'dot ok' : 'dot warn'} />
          <span>{qgis?.found ? 'QGIS automation พร้อมใช้งาน' : 'ใช้ network JS ระหว่างรอ QGIS'}</span>
        </div>

        <div className="summary-grid">
          {summary.map((item) => (
            <div className="metric" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <section className={`layer-drawer ${layerPanelOpen ? 'is-open' : ''}`}>
          <button className="layer-drawer-toggle" onClick={() => setLayerPanelOpen((open) => !open)}>
            <span><Layers size={18} /> ชั้นข้อมูล</span>
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
                    <span>ข้อมูลวิเคราะห์</span>
                    <strong>{layerCatalog?.prepared ? 'QGIS prepared BMA CityMap' : 'Live BMA CityMap fallback'}</strong>
                  </div>
                </div>
                <div className="layer-source-item">
                  <Activity size={16} />
                  <div>
                    <span>Network analysis</span>
                    <strong>Road layer 7 · {layerCatalog?.layers?.length || basemapMeta?.layers?.length || 15} layers</strong>
                  </div>
                </div>
              </div>

              {layerCatalog?.generatedAt && (
                <div className="prepared-note">
                  อัปเดตข้อมูลผ่าน QGIS: {new Date(layerCatalog.generatedAt).toLocaleString('th-TH')}
                </div>
              )}

              <div className="preset-panel">
                <div className="preset-head">
                  <span>ชุดชั้นข้อมูลแนะนำ</span>
                  <strong>{activeBmaLayerIds.length} layers</strong>
                </div>
                <div className="preset-grid">
                  {LAYER_PRESETS.map((preset) => (
                    <button
                      className={isPresetActive(preset) ? 'is-active' : ''}
                      key={preset.id}
                      onClick={() => applyLayerPreset(preset)}
                      disabled={!layerCatalog}
                    >
                      <span>{preset.name}</span>
                      <small>{preset.description}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="layer-actions">
                <button onClick={() => setAllBmaLayers(true)} disabled={!layerCatalog}>เปิดทั้งหมด</button>
                <button onClick={() => setAllBmaLayers(false)} disabled={!layerCatalog}>ปิดทั้งหมด</button>
              </div>

              <div className="dimension-list">
                {(layerCatalog?.dimensions || []).map((dimension) => (
                  <details key={dimension.name} open={['การปกครอง', 'คมนาคม'].includes(dimension.name)}>
                    <summary>
                      <span>{dimension.name}</span>
                      <small>{dimension.layers.length} layers</small>
                    </summary>
                    <div className="dimension-actions">
                      <button onClick={() => setDimensionVisibility(dimension, true)}>เปิดมิตินี้</button>
                      <button onClick={() => setDimensionVisibility(dimension, false)}>ปิดมิตินี้</button>
                    </div>
                    <div className="layer-toggle-list">
                      {dimension.layers.map((layer) => {
                        const status = layerLoadStatus[layer.id];
                        return (
                          <label className="layer-toggle" key={layer.id}>
                            <input
                              type="checkbox"
                              checked={Boolean(visibleBmaLayers[layer.id])}
                              onChange={() => toggleBmaLayer(layer.id)}
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
                {!layerCatalog && <p className="empty">กำลังโหลด catalog จาก BMA CityMap...</p>}
              </div>
            </div>
          )}
        </section>

        <section className="workflow-card">
          <div className="workflow-head">
            <div>
              <span>ขั้นตอนที่ 1</span>
              <h2>กำหนดพื้นที่บริการ</h2>
            </div>
            <strong>{facilities.length} จุด</strong>
          </div>

          <div className="compact-empty" hidden={facilities.length > 0}>
            <MapPin size={18} />
            <span>คลิกบนแผนที่เพื่อเพิ่มจุดบริการ</span>
            <button type="button" onClick={addFacilityAtMapCenter}>
              เพิ่มจุดกลางแผนที่
            </button>
          </div>

          {facilities.length > 0 && (
            <div className="facility-chips">
              {facilities.map((facility) => (
                <span key={facility.id}>{facility.name}</span>
              ))}
            </div>
          )}

          <div className="time-control">
            <div className="section-title compact-title">
              <Route size={18} />
              <h2>เวลาเข้าถึง</h2>
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
              <strong>{travelMinutes} นาที</strong>
              <span>60 นาที</span>
            </div>
            <div className="speed-control">
              <label htmlFor="speed-kmh">ความเร็วเฉลี่ย</label>
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

          <button className="primary-action" onClick={runAnalysis} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
            วิเคราะห์เวลาเข้าถึง
          </button>
        </section>

        {analysis ? (
          <section className="result-card">
            <div className="result-head">
              <div>
                <span>ผลลัพธ์</span>
                <h2>{analysis.metrics.travelMinutes} นาที</h2>
              </div>
              <strong>{analysis.metrics.reachedRoadLengthKm.toLocaleString()} กม.</strong>
            </div>
            <div className="action-row">
              <button onClick={() => downloadJson('bangkok-network-service-area.geojson', analysis.serviceArea)}>
                Area
              </button>
              <button onClick={() => downloadJson('bangkok-reachable-roads.geojson', analysis.reachableRoads)}>
                Roads
              </button>
            </div>
            <div className="result-metrics">
              <span>Road features: {analysis.metrics.roadFeaturesLoaded.toLocaleString()}</span>
              <span>Network cost: {Math.round(analysis.metrics.distanceMeters).toLocaleString()} ม.</span>
              <span>Snap เฉลี่ย: {analysis.metrics.averageSnapDistanceMeters.toLocaleString()} ม.</span>
            </div>
            {analysis.intersectingDistricts?.length > 0 && (
              <div className="districts compact-districts">
                <h2>เขตที่อยู่ในพื้นที่บริการ</h2>
                <div>
                  {analysis.intersectingDistricts.slice(0, 8).map((district) => (
                    <span key={`${district.id}-${district.name}`}>{district.name}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="muted-result">
            <Download size={18} />
            <span>ผลลัพธ์และไฟล์ส่งออกจะแสดงหลังจากวิเคราะห์</span>
          </section>
        )}

        <p className="message">{message}</p>
      </aside>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
