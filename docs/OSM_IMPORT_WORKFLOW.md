# OSM Import Workflow

1. Apply schema changes:

```bash
npm run db:migrate
```

2. Import a road GeoJSON file:

```bash
npm run import:osm-network -- path/to/roads.geojson
```

If no path is provided, the script reads `data/processed/bma-layers/layer-7.geojson`.

3. Rebuild pgRouting topology:

```bash
npm run db:topology
```

4. Verify costs:

```sql
SELECT highway, oneway, length_m, speed_kph, walk_cost_s, bike_cost_s, drive_cost_s
FROM roads
LIMIT 20;
```

The importer maps OSM road tags, calculates `length_m`, infers `speed_kph`, and writes per-mode forward and reverse costs.
