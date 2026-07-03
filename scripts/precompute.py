import os
import json
import math
import time
from typing import Dict, Any, List
import geopandas as gpd
from shapely.geometry import Point, LineString, MultiLineString, shape, mapping
from shapely.ops import unary_union
import shapely
import networkx as nx
import requests

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROADS_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'bma-layers', 'layer-7.geojson')
POIS_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'bma-layers', 'layer-0.geojson')
DISTRICTS_PATH = os.path.join(BASE_DIR, 'data', 'processed', 'bma-layers', 'layer-13.geojson')
OUTPUT_DIR = os.path.join(BASE_DIR, 'data', 'processed', 'accessibility')

os.makedirs(OUTPUT_DIR, exist_ok=True)

CATEGORIES = {
    "health": {
        "name": "โรงพยาบาลและสาธารณสุข",
        "where": "(NAME LIKE '%โรงพยาบาล%' OR NAME LIKE '%ศูนย์บริการสาธารณสุข%' OR NAME LIKE '%รพ.%') AND NOT (NAME LIKE '%สัตว์%' OR NAME LIKE '%ฟัน%' OR NAME LIKE '%ทันต%')",
        "filter": lambda name: ("โรงพยาบาล" in name or "ศูนย์บริการสาธารณสุข" in name or "รพ." in name) and not any(w in name for w in ["สัตว์", "ฟัน", "ทันต"])
    },
    "education": {
        "name": "โรงเรียนและสถานศึกษา",
        "where": "(NAME LIKE '%โรงเรียน%' OR NAME LIKE '%วิทยาลัย%' OR NAME LIKE '%มหาวิทยาลัย%') AND NOT (NAME LIKE '%สอนขับ%' OR NAME LIKE '%มวย%' OR NAME LIKE '%กวดวิชา%' OR NAME LIKE '%สอนภาษา%')",
        "filter": lambda name: any(w in name for w in ["โรงเรียน", "วิทยาลัย", "มหาวิทยาลัย"]) and not any(w in name for w in ["สอนขับ", "มวย", "กวดวิชา", "สอนภาษา"])
    },
    "parks": {
        "name": "สวนสาธารณะและพื้นที่สีเขียว",
        "where": "(NAME LIKE '%สวนสาธารณะ%' OR NAME LIKE '%สวนหย่อม%' OR NAME LIKE '%ลานกีฬา%' OR NAME LIKE '%สนามเด็กเล่น%') AND NOT (NAME LIKE '%อาหาร%' OR NAME LIKE '%หมูกระทะ%' OR NAME LIKE '%คาราโอเกะ%' OR NAME LIKE '%หมู่บ้าน%' OR NAME LIKE '%คอนโด%' OR NAME LIKE '%อพาร์ท%' OR NAME LIKE '%หอพัก%' OR NAME LIKE '%บ้านพัก%')",
        "filter": lambda name: any(w in name for w in ["สวนสาธารณะ", "สวนหย่อม", "ลานกีฬา", "สนามเด็กเล่น"]) and not any(w in name for w in ["อาหาร", "หมูกระทะ", "คาราโอเกะ", "หมู่บ้าน", "คอนโด", "อพาร์ท", "หอพัก", "บ้านพัก"])
    },
    "transit": {
        "name": "สถานีขนส่งสาธารณะ",
        "where": "NAME LIKE '%สถานีรถไฟฟ้า%' OR NAME LIKE '%สถานีบีทีเอส%' OR NAME LIKE '%สถานี MRT%' OR NAME LIKE '%สถานี BTS%' OR NAME LIKE '%แอร์พอร์ตลิงก์%' OR NAME LIKE '%Airport Rail Link%'",
        "filter": lambda name: any(w in name for w in ["สถานีรถไฟฟ้า", "สถานีบีทีเอส", "สถานี MRT", "สถานี BTS", "แอร์พอร์ตลิงก์", "Airport Rail Link"])
    }
}

MODES = {
    "walk": {
        "name": "เดิน 15 นาที (1.25 กม.)",
        "cutoff": 1250,
        "buffer_deg": 0.00072  # ~80 meters
    },
    "cycle": {
        "name": "ปั่นจักรยาน 15 นาที (3.75 กม.)",
        "cutoff": 3750,
        "buffer_deg": 0.00090  # ~100 meters
    }
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
    return 6371000 * c

def main():
    print("=== STARTING ACCESSIBILITY PRECOMPUTATION IN PYTHON ===")
    start_time = time.time()

    # 1. Load Road Network
    print("Loading road network...")
    with open(ROADS_PATH, 'r', encoding='utf-8') as f:
        roads = json.load(f)

    # 2. Build Graph
    print("Building network graph...")
    G = nx.Graph()
    for feature in roads.get("features", []):
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

    print(f"Graph constructed: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges.")

    # 3. Build Spatial Index (STRtree) for snapping
    node_geometries = []
    node_keys = []
    for node, data in G.nodes(data=True):
        coord = data["coord"]
        node_geometries.append(Point(coord[0], coord[1]))
        node_keys.append(node)
    tree = shapely.STRtree(node_geometries)
    print("Spatial index created.")

    # 4. Load Districts
    print("Loading districts...")
    districts_gdf = gpd.read_file(DISTRICTS_PATH)
    print(f"Loaded {len(districts_gdf)} districts.")

    # Initialize stats structure
    stats = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "overall": {},
        "districts": {}
    }

    for _, row in districts_gdf.iterrows():
        code = row.get("DCODE") or row.get("OBJECTID") or row.get("name") or ""
        name = row.get("DNAME") or row.get("DISTRICT_N") or row.get("NAME") or ""
        stats["districts"][str(code)] = {
            "code": code,
            "name": name,
            "coverage": {}
        }

    # 5. Process each Category
    mapserver_url = "https://citymap.bangkok.go.th/citymap/rest/services/Basemap_Service/Basemap1000_32647_H/MapServer/0/query"

    for cat_key, cat_config in CATEGORIES.items():
        print(f"\nProcessing Category: {cat_config['name']} ({cat_key})")
        
        # Load POIs
        pois = None
        try:
            print("Fetching POIs from MapServer...")
            params = {
                "f": "geojson",
                "where": cat_config["where"],
                "outFields": "OBJECTID,NAME,NAME_ENG,STREET,DISTRICT,SUB_DISTRICT",
                "returnGeometry": "true",
                "outSR": "4326"
            }
            r = requests.get(mapserver_url, params=params, timeout=20)
            if r.status_code == 200:
                pois = r.json()
        except Exception as e:
            print(f"MapServer fetch failed ({str(e)}). Falling back to local data...")

        if not pois or "features" not in pois:
            with open(POIS_PATH, 'r', encoding='utf-8') as f:
                local_pois = json.load(f)
            pois = {
                "type": "FeatureCollection",
                "features": [
                    f for f in local_pois.get("features", [])
                    if cat_config["filter"](f.get("properties", {}).get("NAME", ""))
                ]
            }

        print(f"POIs resolved: {len(pois.get('features', []))}")

        # Snap POIs and save snapped GeoJSON
        source_nodes = []
        snapped_features = []
        seen_names = set()

        for f in pois.get("features", []):
            name = f.get("properties", {}).get("NAME", "")
            if cat_key == "transit":
                base_name = name.split(" ประตู ")[0].split(" ทางเข้า ")[0].strip()
                if base_name in seen_names:
                    continue
                seen_names.add(base_name)

            coords = f.get("geometry", {}).get("coordinates", [])
            if len(coords) < 2:
                continue

            pt = Point(coords[0], coords[1])
            nearest_idx = tree.nearest(pt)
            nearest_node = node_keys[nearest_idx]
            node_coord = G.nodes[nearest_node]["coord"]
            
            dist = haversine_distance((coords[0], coords[1]), node_coord)
            if dist < 750:
                source_nodes.append(nearest_node)
                snapped_features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": list(node_coord)
                    },
                    "properties": {
                        "id": f.get("properties", {}).get("OBJECTID") or len(snapped_features),
                        "name": name,
                        "district": f.get("properties", {}).get("DISTRICT") or "",
                        "snapDistanceMeters": round(dist, 2)
                    }
                })

        with open(os.path.join(OUTPUT_DIR, f"{cat_key}-pois.geojson"), 'w', encoding='utf-8') as f:
            json.dump({"type": "FeatureCollection", "features": snapped_features}, f, ensure_ascii=False)
        print(f"Saved snapped POIs: {len(snapped_features)}")

        if not source_nodes:
            print("No POIs snapped. Skipping category.")
            continue

        stats["overall"][cat_key] = {}

        # Process each Mode
        for mode_key, mode_config in MODES.items():
            print(f"- Mode: {mode_config['name']}")
            
            # Dijkstra shortest paths
            distances = nx.multi_source_dijkstra_path_length(G, source_nodes, cutoff=mode_config["cutoff"])
            print(f"  Nodes reached: {len(distances)}")
            
            # Collect reached road segments
            reached_coords = []
            for u, v, data in G.edges(data=True):
                if u in distances and v in distances:
                    reached_coords.append(data["coords"])
                    
            if not reached_coords:
                print("  No roads reached.")
                continue

            # Buffer reachable roads with Shapely (vectorized, runs in milliseconds!)
            lines = MultiLineString(reached_coords)
            service_area_poly = lines.buffer(mode_config["buffer_deg"])
            simplified_poly = service_area_poly.simplify(0.00004, preserve_topology=False)
            
            # Save service area GeoJSON
            area_geojson = {
                "type": "Feature",
                "geometry": mapping(simplified_poly),
                "properties": {}
            }
            with open(os.path.join(OUTPUT_DIR, f"{cat_key}-area-{mode_key}.geojson"), 'w', encoding='utf-8') as f:
                json.dump(area_geojson, f, ensure_ascii=False)
                
            # Intersect with districts to compute coverage percentages
            print("  Calculating district intersections...")
            service_gdf = gpd.GeoDataFrame(geometry=[simplified_poly], crs="EPSG:4326")
            
            # Reproject to meter-based CRS (EPSG:32647 - UTM Zone 47N for Thailand) for accurate area calculations
            service_gdf_m = service_gdf.to_crs("EPSG:32647")
            districts_gdf_m = districts_gdf.to_crs("EPSG:32647")
            
            # Spatial intersection
            intersections = gpd.overlay(districts_gdf_m, service_gdf_m, how="intersection")
            
            # Map intersection areas
            covered_areas = {}
            for _, row in intersections.iterrows():
                code = row.get("DCODE") or row.get("OBJECTID") or row.get("name") or ""
                covered_areas[str(code)] = row.geometry.area
                
            total_bma_area = 0.0
            total_covered_area = 0.0
            
            for _, row in districts_gdf_m.iterrows():
                code = str(row.get("DCODE") or row.get("OBJECTID") or row.get("name") or "")
                dist_area = row.geometry.area
                total_bma_area += dist_area
                
                cov_area = covered_areas.get(code, 0.0)
                total_covered_area += cov_area
                
                pct = (cov_area / dist_area) * 100.0 if dist_area > 0 else 0.0
                stats["districts"][code]["coverage"][f"{cat_key}_{mode_key}"] = round(min(100.0, pct), 2)
                
            overall_pct = (total_covered_area / total_bma_area) * 100.0 if total_bma_area > 0 else 0.0
            stats["overall"][cat_key][mode_key] = round(min(100.0, overall_pct), 2)
            print(f"  Overall Bangkok coverage: {stats['overall'][cat_key][mode_key]}%")

    # Save stats.json
    with open(os.path.join(OUTPUT_DIR, 'stats.json'), 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)
    print("\nSaved stats.json successfully.")

    print(f"\n=== PRECOMPUTATION FINISHED SUCCESSFULY IN {time.time() - start_time:.2f}s ===")

if __name__ == "__main__":
    main()
