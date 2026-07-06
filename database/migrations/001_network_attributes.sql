CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE roads
ADD COLUMN IF NOT EXISTS osm_id BIGINT,
ADD COLUMN IF NOT EXISTS name TEXT,
ADD COLUMN IF NOT EXISTS highway TEXT,
ADD COLUMN IF NOT EXISTS oneway TEXT,
ADD COLUMN IF NOT EXISTS lanes INTEGER,
ADD COLUMN IF NOT EXISTS maxspeed INTEGER,
ADD COLUMN IF NOT EXISTS bridge BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS tunnel BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS layer INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS access TEXT,
ADD COLUMN IF NOT EXISTS foot TEXT,
ADD COLUMN IF NOT EXISTS bicycle TEXT,
ADD COLUMN IF NOT EXISTS motor_vehicle TEXT,
ADD COLUMN IF NOT EXISTS length_m DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS speed_kph DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS walk_cost_s DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS bike_cost_s DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS drive_cost_s DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS reverse_walk_cost_s DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS reverse_bike_cost_s DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS reverse_drive_cost_s DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS roads_geom_idx ON roads USING GIST (geom);
CREATE INDEX IF NOT EXISTS roads_source_idx ON roads (source);
CREATE INDEX IF NOT EXISTS roads_target_idx ON roads (target);
CREATE INDEX IF NOT EXISTS roads_highway_idx ON roads (highway);

CREATE TABLE IF NOT EXISTS network_barriers (
  id SERIAL PRIMARY KEY,
  barrier_type TEXT,
  mode TEXT,
  reason TEXT,
  geom geometry(Geometry, 4326),
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS network_barriers_geom_idx
ON network_barriers USING GIST (geom);

CREATE TABLE IF NOT EXISTS blocked_edges (
  id SERIAL PRIMARY KEY,
  edge_id BIGINT,
  mode TEXT,
  reason TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blocked_edges_edge_mode_idx
ON blocked_edges (edge_id, mode);

CREATE TABLE IF NOT EXISTS turn_restrictions (
  id SERIAL PRIMARY KEY,
  osm_relation_id BIGINT,
  restriction TEXT,
  from_edge BIGINT,
  via_node BIGINT,
  to_edge BIGINT,
  mode TEXT DEFAULT 'drive',
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS turn_restrictions_edges_idx
ON turn_restrictions (from_edge, via_node, to_edge);

CREATE TABLE IF NOT EXISTS service_area_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  snapped_node BIGINT,
  mode TEXT,
  cost_type TEXT,
  limit_value DOUBLE PRECISION,
  result_geojson JSONB,
  stats JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_area_cache_lookup_idx
ON service_area_cache (cache_key, created_at);

UPDATE roads
SET length_m = COALESCE(length_m, ST_Length(geom)),
    speed_kph = COALESCE(speed_kph,
      CASE COALESCE(highway, road_type)
        WHEN 'motorway' THEN 80
        WHEN 'trunk' THEN 70
        WHEN 'primary' THEN 60
        WHEN 'secondary' THEN 50
        WHEN 'tertiary' THEN 40
        WHEN 'residential' THEN 25
        WHEN 'service' THEN 15
        WHEN 'living_street' THEN 10
        WHEN 'footway' THEN 5
        WHEN 'path' THEN 5
        WHEN 'cycleway' THEN 15
        WHEN 'steps' THEN 2
        ELSE 25
      END);

UPDATE roads
SET walk_cost_s = CASE
      WHEN COALESCE(access, '') IN ('no', 'private') OR COALESCE(foot, '') = 'no' OR COALESCE(highway, road_type) IN ('motorway', 'trunk') THEN -1
      ELSE length_m / (5 * 1000 / 3600)
    END,
    bike_cost_s = CASE
      WHEN COALESCE(access, '') IN ('no', 'private') OR COALESCE(bicycle, '') = 'no' OR COALESCE(highway, road_type) IN ('motorway') THEN -1
      ELSE length_m / (15 * 1000 / 3600)
    END,
    drive_cost_s = CASE
      WHEN COALESCE(access, '') IN ('no', 'private') OR COALESCE(motor_vehicle, '') = 'no' OR COALESCE(highway, road_type) IN ('footway', 'path', 'cycleway', 'steps') THEN -1
      ELSE length_m / (GREATEST(speed_kph, 1) * 1000 / 3600)
    END;

UPDATE roads
SET reverse_walk_cost_s = walk_cost_s,
    reverse_bike_cost_s = bike_cost_s,
    reverse_drive_cost_s = CASE
      WHEN oneway = 'yes' THEN -1
      WHEN oneway = '-1' THEN drive_cost_s
      ELSE drive_cost_s
    END,
    drive_cost_s = CASE
      WHEN oneway = '-1' THEN -1
      ELSE drive_cost_s
    END;
