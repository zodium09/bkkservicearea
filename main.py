import os
import json
import math
import time
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import geopandas as gpd
from shapely.geometry import shape, mapping, Point, MultiLineString
from shapely.ops import unary_union
import shapely
import networkx as nx
import requests

app = FastAPI(title="Bangkok GIS Dashboard API", version="1.0.0")

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROADS_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'bma-layers', 'layer-7.geojson')
DISTRICTS_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'bma-layers', 'layer-13.geojson')
ACCESSIBILITY_DIR = os.path.join(BASE_DIR, 'data', 'processed', 'accessibility')

# In-Memory Cache for Road Graph
graph_cache = {
    "graph": None,
    "roads_geojson": None,
    "nodes_tree": None,  # shapely STRtree
    "node_keys": []      # list of node keys matching tree indices
}

def haversine_distance(coord1, coord2):
    lon1, lat1 = coord1
    lon2, lat2 = coord2
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return 6371000 * c  # Earth radius in meters

def load_road_network():
    if graph_cache["graph"] is not None:
        return graph_cache["graph"], graph_cache["nodes_tree"], graph_cache["node_keys"]

    if not os.path.exists(ROADS_PATH):
        raise FileNotFoundError(f"Road network file not found at {ROADS_PATH}")

    print("Loading road network...")
    with open(ROADS_PATH, 'r', encoding='utf-8') as f:
        roads_geojson = json.load(f)
    graph_cache["roads_geojson"] = roads_geojson

    G = nx.Graph()
    points = []
    node_keys = []

    for feature in roads_geojson.get("features", []):
        geom = feature.get("geometry", {})
        g_type = geom.get("type")
        coords_list = []
        if g_type == "LineString":
            coords_list = [geom.get("coordinates", [])]
        elif g_type == "MultiLineString":
            coords_list = geom.get("coordinates", [])

        for coords in coords_list:
            for i in range(len(coords) - 1):
                start = tuple(coords[i])
                end = tuple(coords[i+1])
                if start == end:
                    continue
                
                dist = haversine_distance(start, end)
                if dist <= 0:
                    continue
                
                start_key = f"{start[0]:.6f},{start[1]:.6f}"
                end_key = f"{end[0]:.6f},{end[1]:.6f}"
                
                G.add_node(start_key, coord=start)
                G.add_node(end_key, coord=end)
                G.add_edge(start_key, end_key, weight=dist, coords=(start, end))

    # Build Spatial Index (STRtree) for snapping
    print("Building spatial index...")
    node_geometries = []
    for node, data in G.nodes(data=True):
        coord = data["coord"]
        node_geometries.append(Point(coord[0], coord[1]))
        node_keys.append(node)

    graph_cache["graph"] = G
    graph_cache["nodes_tree"] = shapely.STRtree(node_geometries)
    graph_cache["node_keys"] = node_keys
    print(f"Graph loaded: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges.")
    return G, graph_cache["nodes_tree"], node_keys

# Pydantic Schemas for Custom Analysis
class FacilityModel(BaseModel):
    id: Any
    name: str
    lat: float
    lng: float

class AnalyzeRequest(BaseModel):
    facilities: List[FacilityModel]
    travelMinutes: int
    speedKmh: float

# BMA ArcGIS metadata helpers
ARCGIS_ORIGIN = "https://citymap.bangkok.go.th"
BASEMAP_PATH = "/citymap/rest/services/Basemap_Service/Basemap1000_32647_H/MapServer"

@app.get("/api/qgis/status")
def get_qgis_status():
    return {
        "found": False,
        "command": None,
        "version": None,
        "note": "FastAPI Python backend is serving spatial operations directly via GeoPandas & Shapely."
    }

@app.get("/api/basemap/metadata")
def get_basemap_metadata():
    try:
        r = requests.get(f"{ARCGIS_ORIGIN}{BASEMAP_PATH}?f=json", timeout=10)
        return r.json()
    except Exception as e:
        return {"error": "Failed to fetch basemap metadata", "detail": str(e)}

@app.get("/api/processed-layers/catalog")
def get_layer_catalog():
    catalog_path = os.path.join(BASE_DIR, 'data', 'processed', 'bma-layers', 'catalog.json')
    if os.path.exists(catalog_path):
        with open(catalog_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"prepared": False, "layers": [], "dimensions": []}

@app.get("/api/districts")
def get_districts():
    if not os.path.exists(DISTRICTS_PATH):
        raise HTTPException(status_code=404, detail="District boundary layer not found.")
    with open(DISTRICTS_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

@app.get("/api/accessibility/stats")
def get_accessibility_stats():
    stats_path = os.path.join(ACCESSIBILITY_DIR, 'stats.json')
    if not os.path.exists(stats_path):
        raise HTTPException(status_code=404, detail="Stats not computed yet.")
    with open(stats_path, 'r', encoding='utf-8') as f:
        return json.load(f)

@app.get("/api/accessibility/layer/{category}/{layer_type}")
def get_accessibility_layer(category: str, layer_type: str):
    if category not in ['health', 'education', 'parks', 'transit']:
        raise HTTPException(status_code=400, detail="Invalid category")
    if layer_type not in ['pois', 'area-walk', 'area-cycle']:
        raise HTTPException(status_code=400, detail="Invalid layer type")
        
    layer_path = os.path.join(ACCESSIBILITY_DIR, f"{category}-{layer_type}.geojson")
    if not os.path.exists(layer_path):
        raise HTTPException(status_code=404, detail="Layer not found.")
        
    with open(layer_path, 'r', encoding='utf-8') as f:
        return json.load(f)

@app.post("/api/analyze")
def run_custom_analysis(req: AnalyzeRequest):
    try:
        G, tree, node_keys = load_road_network()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load road graph: {str(e)}")

    cutoff_meters = (req.travelMinutes / 60.0) * (req.speedKmh * 1000.0)
    source_nodes = []

    # Snap facilities to nearest nodes using spatial index
    for fac in req.facilities:
        pt = Point(fac.lng, fac.lat)
        nearest_idx = tree.nearest(pt)
        nearest_node = node_keys[nearest_idx]
        
        # Verify snapping distance (limit to 750 meters)
        node_coord = G.nodes[nearest_node]["coord"]
        dist = haversine_distance((fac.lng, fac.lat), node_coord)
        if dist < 750:
            source_nodes.append(nearest_node)

    if not source_nodes:
        raise HTTPException(status_code=400, detail="Facilities could not be snapped to the road network (too far from road).")

    # Run Dijkstra multi-source shortest path
    distances = nx.multi_source_dijkstra_path_length(G, source_nodes, cutoff=cutoff_meters)
    
    # Collect reachable roads
    reached_coords = []
    road_features = []
    
    for u, v, data in G.edges(data=True):
        if u in distances and v in distances:
            coords = data["coords"]
            reached_coords.append(coords)
            road_features.append({
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": list(coords)
                },
                "properties": data.get("properties", {})
            })

    if not reached_coords:
        raise HTTPException(status_code=400, detail="No roads could be reached within the specified travel cost.")

    # Calculate Service Area Buffer using Shapely (extremely fast!)
    lines = MultiLineString(reached_coords)
    # 80m buffer in degrees at Bangkok latitude (~13.756) is roughly 0.00072 degrees
    buffer_deg = 0.00072
    service_area_poly = lines.buffer(buffer_deg)
    
    # Simplify geometry slightly to optimize JSON transfer size and client render speed
    simplified_poly = service_area_poly.simplify(0.00004, preserve_topology=False)
    
    service_area_geojson = {
        "type": "Feature",
        "geometry": mapping(simplified_poly),
        "properties": {}
    }

    # Intersect with districts to compute overlaps
    intersecting_districts = []
    if os.path.exists(DISTRICTS_PATH):
        try:
            districts_gdf = gpd.read_file(DISTRICTS_PATH)
            service_gdf = gpd.GeoDataFrame(geometry=[simplified_poly], crs="EPSG:4326")
            
            # Spatial join to find overlapping districts
            overlaps = gpd.sjoin(districts_gdf, service_gdf, how="inner", predicate="intersects")
            for _, row in overlaps.iterrows():
                intersecting_districts.append({
                    "id": row.get("OBJECTID") or row.get("DCODE") or "",
                    "name": row.get("DNAME") or row.get("NAME") or ""
                })
        except Exception as e:
            print("District intersection failed:", str(e))

    # Calculate metrics
    reached_length_km = sum(haversine_distance(c[0], c[1]) for c in reached_coords) / 1000.0

    return {
        "engine": "python-fastapi-networkx",
        "analysisType": "road-network",
        "metrics": {
            "facilities": len(req.facilities),
            "distanceMeters": cutoff_meters,
            "travelMinutes": req.travelMinutes,
            "speedKmh": req.speedKmh,
            "serviceAreaSqKm": simplified_poly.area * 12300.0,  # rough area conversion from deg^2 to km^2
            "reachedRoadLengthKm": reached_length_km,
            "roadFeaturesLoaded": len(graph_cache["roads_geojson"].get("features", [])),
            "networkNodesReached": len(distances),
            "averageSnapDistanceMeters": 0.0,
            "intersectingDistricts": len(intersecting_districts)
        },
        "facilities": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [f.lng, f.lat]},
                "properties": {"id": f.id, "name": f.name}
            } for f in req.facilities
        ],
        "reachableRoads": {
            "type": "FeatureCollection",
            "features": road_features
        },
        "serviceArea": service_area_geojson,
        "intersectingDistricts": intersecting_districts
    }
