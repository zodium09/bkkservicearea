-- Clear existing routing table
TRUNCATE TABLE roads RESTART IDENTITY CASCADE;

-- Copy imported raw roads to roads table
INSERT INTO roads (geom, road_name, road_type)
SELECT geom, road_name, road_type
FROM roads_raw;

-- Build topology
-- tolerance = 0.1 meters (since coordinates are in EPSG:32647 metric projection)
SELECT pgr_createTopology('roads', 0.1, 'geom', 'id', 'source', 'target');

-- Calculate travel costs (meters)
UPDATE roads
SET 
  cost = ST_Length(geom),
  reverse_cost = ST_Length(geom);

-- Create performance indexes
CREATE INDEX IF NOT EXISTS roads_geom_idx ON roads USING gist(geom);
CREATE INDEX IF NOT EXISTS roads_source_idx ON roads(source);
CREATE INDEX IF NOT EXISTS roads_target_idx ON roads(target);
