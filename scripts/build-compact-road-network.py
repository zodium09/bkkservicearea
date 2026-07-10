"""Build small, spatially tiled road files for serverless network analysis.

The source BMA road GeoJSON is intentionally not committed. This script reads
that local source with GeoPandas/Pyogrio, simplifies coordinates slightly, and
writes gzip-compressed tile records containing only geometry and stable IDs.
"""

from __future__ import annotations

import gzip
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pyogrio


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "processed" / "bma-layers" / "layer-7.geojson"
OUTPUT = ROOT / "data" / "processed" / "road-network"
TILE_SIZE = 0.025
SIMPLIFY_TOLERANCE = 0.00002
COORDINATE_PRECISION = 6


def tile_index(value: float, origin: float) -> int:
    return math.floor((value - origin) / TILE_SIZE)


def rounded_coords(line) -> list[list[float]]:
    simplified = line.simplify(SIMPLIFY_TOLERANCE, preserve_topology=False)
    return [
        [round(float(lng), COORDINATE_PRECISION), round(float(lat), COORDINATE_PRECISION)]
        for lng, lat, *_ in simplified.coords
    ]


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source road layer: {SOURCE}")

    roads = pyogrio.read_dataframe(SOURCE, columns=["OBJECTID"])
    min_lng, min_lat, max_lng, max_lat = map(float, roads.total_bounds)
    origin_lng = math.floor(min_lng / TILE_SIZE) * TILE_SIZE
    origin_lat = math.floor(min_lat / TILE_SIZE) * TILE_SIZE
    tiles: dict[tuple[int, int], list] = defaultdict(list)
    compact_feature_count = 0

    for row in roads.itertuples(index=False):
        geometry = row.geometry
        if geometry is None or geometry.is_empty:
            continue
        parts = geometry.geoms if geometry.geom_type == "MultiLineString" else [geometry]
        for part_index, line in enumerate(parts):
            coords = rounded_coords(line)
            if len(coords) < 2:
                continue
            record_id = f"{int(row.OBJECTID)}-{part_index}"
            line_min_lng, line_min_lat, line_max_lng, line_max_lat = line.bounds
            min_x = tile_index(line_min_lng, origin_lng)
            max_x = tile_index(line_max_lng, origin_lng)
            min_y = tile_index(line_min_lat, origin_lat)
            max_y = tile_index(line_max_lat, origin_lat)
            for x_index in range(min_x, max_x + 1):
                for y_index in range(min_y, max_y + 1):
                    tiles[(x_index, y_index)].append([record_id, coords])
            compact_feature_count += 1

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for previous in OUTPUT.glob("*.json.gz"):
        previous.unlink()

    total_bytes = 0
    for (x_index, y_index), records in tiles.items():
        tile_path = OUTPUT / f"{x_index}_{y_index}.json.gz"
        with gzip.open(tile_path, "wt", encoding="utf-8", compresslevel=9) as stream:
            json.dump(records, stream, ensure_ascii=False, separators=(",", ":"))
        total_bytes += tile_path.stat().st_size

    manifest = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "BMA MapServer road layer 7 (derived compact geometry)",
        "sourceFeatureCount": int(len(roads)),
        "compactFeatureCount": compact_feature_count,
        "tileCount": len(tiles),
        "tileSizeDegrees": TILE_SIZE,
        "origin": [origin_lng, origin_lat],
        "bounds": [min_lng, min_lat, max_lng, max_lat],
        "simplifyToleranceDegrees": SIMPLIFY_TOLERANCE,
        "coordinatePrecision": COORDINATE_PRECISION,
        "compressedBytes": total_bytes,
    }
    (OUTPUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

