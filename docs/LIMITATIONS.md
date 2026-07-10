# Limitations

- Live traffic is not included.
- The public BMA Traffic viewer is linked from the app. A map overlay requires an authorized GeoJSON feed configured through `TRAFFIC_GEOJSON_URL`; no undocumented endpoint is scraped.
- Reached population is currently an area-weighted estimate from official 2023 district totals. It is not a 250 m grid or building-level count yet.
- Speeds are estimated from OSM road type when `maxspeed` is missing.
- Service area polygons are presentation envelopes derived from Dijkstra-reachable roads, not parcel-level boundaries; the analysis itself never uses a straight-line radius.
- Turn restrictions are stored in `turn_restrictions`, but enforcement is still incremental.
- Barrier handling currently filters `blocked_edges`; barrier snapping/import can be expanded for admin workflows.
- Standard 10/15/30-minute contours reuse one graph build and one maximum-cost Dijkstra traversal.
