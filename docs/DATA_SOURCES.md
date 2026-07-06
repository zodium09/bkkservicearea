# Data Sources

The network importer accepts GeoJSON road data with OSM-style tags where available.

Important tags:

- `osm_id`
- `name`
- `highway`
- `oneway`
- `lanes`
- `maxspeed`
- `bridge`
- `tunnel`
- `layer`
- `access`
- `foot`
- `bicycle`
- `motor_vehicle`

If `maxspeed` is missing, `scripts/import-osm-network.js` infers speed from `highway`.

Current limitations:

- Some BMA road layers may not contain full OSM tag coverage.
- Turn restrictions depend on OSM relation import and are scaffolded before being enforced.
- Live traffic is not included.
