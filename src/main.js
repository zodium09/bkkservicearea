import './style.css';
import { 
  transitData, 
  parkData, 
  healthData, 
  safetyData, 
  floodZonesData, 
  populationGridData,
  roadNetworkData
} from './data.js';

import { 
  analyzeLocationAccessibility, 
  generateViewportHeatmap,
  calculateRegionalStats,
  calculateWalkIsochrones
} from './analysis.js';

import { AppMap } from './map.js';
import { AppUI } from './ui.js';
import { 
  initRadarChart, 
  updateRadarChart, 
  initRegionalChart, 
  updateRegionalChart 
} from './charts.js';

// Application State
const state = {
  activeInspectCoords: null,
  activeInspectCategory: 'transit', // Selected for routing path rendering
  activeTab: 'layers',
  activeCategory: 'transit',        // Selected for heatmap indexing
  bufferRanges: {
    transit: 0.8, // km
    park: 1.2,    // km
    health: 3.0,  // km
    safety: 4.0   // km
  },
  layersVisibility: {
    roads: true,
    transit: true,
    parks: true,
    health: true,
    safety: true,
    demographics: false, // hidden by default to keep map clean
    heatmapGrid: true,
    isochrones: true,
    allServiceAreas: true
  },
  serviceAreasGeojson: null
};

// UI and Chart instances
let appMap = null;
let appUI = null;
let radarChart = null;
let regionalChart = null;

/**
 * Re-computes and redraws the hexagonal accessibility grid over the map viewport.
 */
function updateViewportHeatmap() {
  if (!appMap) return;

  if (state.layersVisibility.heatmapGrid) {
    const bbox = appMap.getViewportBBox();
    const hexGeojson = generateViewportHeatmap(
      bbox,
      {
        transit: transitData,
        parks: parkData,
        health: healthData,
        safety: safetyData,
        floodZones: floodZonesData
      },
      state.activeCategory,
      state.bufferRanges
    );
    appMap.updateHeatmapGridLayer(hexGeojson);
  } else {
    appMap.updateHeatmapGridLayer({ type: "FeatureCollection", features: [] });
  }
}

/**
 * Updates precalculated all points service areas on the map.
 */
function updateAllServiceAreas() {
  if (!appMap || !state.serviceAreasGeojson) return;

  if (state.layersVisibility.allServiceAreas) {
    appMap.updateAllServiceAreasLayer(
      state.serviceAreasGeojson,
      state.activeCategory,
      state.bufferRanges
    );
  } else {
    appMap.updateAllServiceAreasLayer({ type: "FeatureCollection", features: [] }, state.activeCategory, state.bufferRanges);
  }
}

/**
 * Updates operational overlays on the map.
 */
function updateMapLayers() {
  if (!appMap) return;

  // Redraw structural roads backbone
  appMap.updateRoadsLayer(roadNetworkData);

  // Redraw viewport accessibility heatmap
  updateViewportHeatmap();

  // Redraw precalculated all service areas
  updateAllServiceAreas();
}

/**
 * Computes regional accessibility stats for the population points in the visible viewport.
 */
function updateRegionalAnalysis() {
  if (!appMap || !appUI || !regionalChart) return;

  const visiblePopCollection = appMap.getVisiblePopulationCollection(populationGridData);
  
  const stats = calculateRegionalStats(
    visiblePopCollection,
    {
      transit: transitData,
      parks: parkData,
      health: healthData,
      safety: safetyData
    },
    state.bufferRanges
  );

  appUI.updateRegionalStats(stats);
  updateRegionalChart(regionalChart, stats);
}

/**
 * Computes and updates concentric walk isochrones on the map.
 */
async function updateIsochrones() {
  if (!appMap || !state.activeInspectCoords) return;

  if (state.layersVisibility.isochrones) {
    const latlng = state.activeInspectCoords;
    try {
      const geojson = await calculateWalkIsochrones([latlng.lng, latlng.lat]);
      if (state.activeInspectCoords === latlng) {
        appMap.updateIsochronesLayer(geojson);
      }
    } catch (error) {
      console.error("Failed to calculate walk isochrones:", error);
    }
  } else {
    appMap.updateIsochronesLayer({ type: "FeatureCollection", features: [] });
  }
}

/**
 * Solves real street route via OSRM and updates inspector scorecard.
 */
async function runLocationInspection(latlng) {
  state.activeInspectCoords = latlng;
  
  const inspectPoint = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [latlng.lng, latlng.lat]
    },
    properties: {}
  };

  // Clear previous route while query is loading
  appMap.clearRoute();
  
  // Render walk isochrones around the inspect point
  updateIsochrones();

  try {
    const results = await analyzeLocationAccessibility(
      inspectPoint,
      {
        transit: transitData,
        parks: parkData,
        health: healthData,
        safety: safetyData,
        floodZones: floodZonesData
      }
    );

    // Prevent race conditions if user clicked elsewhere during query
    if (!results || state.activeInspectCoords !== latlng) {
      return;
    }

    // Update Scorecard & Radar Chart
    appUI.updateScorecard(results, latlng);
    updateRadarChart(radarChart, results.categories);
    
    // Render the street route path
    const targetCategory = state.activeInspectCategory;
    const pathCoords = results.categories[targetCategory]?.path || [];
    appMap.drawRoute(pathCoords);
  } catch (error) {
    console.error("OSRM query failed:", error);
    appUI.updateScorecard(null, latlng);
  }
}

// Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Charts
  const radarCtx = document.getElementById('radar-chart');
  const regionalCtx = document.getElementById('regional-chart');
  
  if (radarCtx) radarChart = initRadarChart(radarCtx);
  if (regionalCtx) regionalChart = initRegionalChart(regionalCtx);

  // 2. Initialize Map
  appMap = new AppMap(
    'map',
    (latlng) => {
      runLocationInspection(latlng);
    },
    () => {
      updateViewportHeatmap();
      updateRegionalAnalysis();
    }
  );

  // 3. Draw Base Layer Amenities
  appMap.updateTransitLayer(transitData);
  appMap.updateParksLayer(parkData);
  appMap.updateHealthLayer(healthData);
  appMap.updateSafetyLayer(safetyData, floodZonesData);
  appMap.updateDemographicsGrid(populationGridData);
  
  // Apply initial checkbox layers visibility
  for (const layer in state.layersVisibility) {
    appMap.toggleLayerVisibility(layer, state.layersVisibility[layer]);
  }

  // Draw roads and heatmap
  updateMapLayers();

  // Fetch precalculated service areas
  fetch('/data/service_areas.geojson')
    .then(res => {
      if (!res.ok) throw new Error("Service areas GeoJSON not found");
      return res.json();
    })
    .then(data => {
      state.serviceAreasGeojson = data;
      updateAllServiceAreas();
    })
    .catch(err => {
      console.warn("Precalculated service areas not loaded yet, will load once ready:", err);
    });

  // 4. Initialize UI Event Handlers
  appUI = new AppUI({
    onTabChange: (tabId) => {
      state.activeTab = tabId;
      
      if (tabId === 'layers') {
        state.activeCategory = 'transit';
        updateMapLayers();
        appMap.clearRoute();
        appMap.updateIsochronesLayer({ type: "FeatureCollection", features: [] });
      } else if (tabId === 'inspector') {
        state.activeCategory = state.activeInspectCategory;
        updateMapLayers();
        if (state.activeInspectCoords) {
          runLocationInspection(state.activeInspectCoords);
        }
      } else if (tabId === 'sim') {
        appMap.clearRoute();
        appMap.updateIsochronesLayer({ type: "FeatureCollection", features: [] });
      }
    },
    onSliderChange: (key, value) => {
      state.bufferRanges[key] = value;
      
      // Recolor heatmap grid & recalculate
      updateViewportHeatmap();
      updateRegionalAnalysis();
      updateAllServiceAreas();

      if (state.activeInspectCoords) {
        runLocationInspection(state.activeInspectCoords);
      }
    },
    onLayerToggle: (layerName, visible) => {
      state.layersVisibility[layerName] = visible;
      appMap.toggleLayerVisibility(layerName, visible);
      
      if (layerName === 'safety') {
        appMap.toggleLayerVisibility('floodZones', visible);
      }

      if (layerName === 'heatmapGrid') {
        updateViewportHeatmap();
      }

      if (layerName === 'isochrones') {
        updateIsochrones();
      }

      if (layerName === 'allServiceAreas') {
        updateAllServiceAreas();
      }
    },
    onBasemapChange: (basemapName) => {
      appMap.switchBaseMap(basemapName);
    },
    onInspectCategoryChange: (categoryKey) => {
      state.activeInspectCategory = categoryKey;
      state.activeCategory = categoryKey; // Sync heatmap index to matched category
      updateMapLayers();
      
      if (state.activeInspectCoords) {
        runLocationInspection(state.activeInspectCoords);
      }
    }
  });

  // 5. Initial viewport analysis trigger
  setTimeout(() => {
    updateViewportHeatmap();
    updateRegionalAnalysis();
  }, 400);

  // Collapse sidebar initially on mobile
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('collapsed');
  }
});
