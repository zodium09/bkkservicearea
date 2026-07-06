-- Copy imported raw roads to roads table only for the legacy BMA workflow.
-- OSM imports write directly to roads with network attributes, so do not truncate here.
INSERT INTO roads (geom, road_name, road_type, cost, reverse_cost, length_m)
SELECT geom, road_name, road_type
     , ST_Length(geom), ST_Length(geom), ST_Length(geom)
FROM roads_raw
WHERE NOT EXISTS (SELECT 1 FROM roads LIMIT 1);

-- Build topology
-- tolerance = 0.1 meters (since coordinates are in EPSG:32647 metric projection)
SELECT pgr_createTopology('roads', 0.1, 'geom', 'id', 'source', 'target');

-- Calculate travel costs (meters)
UPDATE roads
SET 
  length_m = COALESCE(length_m, ST_Length(geom)),
  cost = COALESCE(cost, ST_Length(geom)),
  reverse_cost = COALESCE(reverse_cost, ST_Length(geom));

-- Create performance indexes
CREATE INDEX IF NOT EXISTS roads_geom_idx ON roads USING gist(geom);
CREATE INDEX IF NOT EXISTS roads_source_idx ON roads(source);
CREATE INDEX IF NOT EXISTS roads_target_idx ON roads(target);
