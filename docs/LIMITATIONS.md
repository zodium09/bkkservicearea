# Limitations

- Live traffic is not included.
- Speeds are estimated from OSM road type when `maxspeed` is missing.
- Service area polygons are buffers around reachable roads, not parcel-level accessibility boundaries.
- Turn restrictions are stored in `turn_restrictions`, but enforcement is still incremental.
- Barrier handling currently filters `blocked_edges`; barrier snapping/import can be expanded for admin workflows.
