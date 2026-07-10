# Limitations

- Live traffic is not included.
- The public BMA Traffic viewer is linked from the app. A map overlay requires an authorized GeoJSON feed configured through `TRAFFIC_GEOJSON_URL`; no undocumented endpoint is scraped.
- Reached population is currently an area-weighted estimate from official 2023 district totals. It is not a 250 m grid or building-level count yet.
- Speeds are estimated from OSM road type when `maxspeed` is missing.
- Service area polygons are buffers around reachable roads, not parcel-level accessibility boundaries.
- Turn restrictions are stored in `turn_restrictions`, but enforcement is still incremental.
- Barrier handling currently filters `blocked_edges`; barrier snapping/import can be expanded for admin workflows.
- Standard 10/15/30-minute contours run as separate cached analyses. A future graph pass can derive all bands in one traversal for lower latency.
