-- Enable PostGIS and pgRouting Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- Table for raw road network data imported from GeoJSON
CREATE TABLE IF NOT EXISTS roads_raw (
    id SERIAL PRIMARY KEY,
    geom geometry(LineString, 32647),
    road_name VARCHAR(255),
    road_type VARCHAR(100)
);

-- Table for processed network routing (pgRouting topology)
CREATE TABLE IF NOT EXISTS roads (
    id SERIAL PRIMARY KEY,
    source INTEGER,
    target INTEGER,
    cost DOUBLE PRECISION,
    reverse_cost DOUBLE PRECISION,
    geom geometry(LineString, 32647),
    road_name VARCHAR(255),
    road_type VARCHAR(100)
);

-- Table for storing dynamic service area queries and polygon results
CREATE TABLE IF NOT EXISTS service_area_results (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(50) NOT NULL,
    distance_m DOUBLE PRECISION NOT NULL,
    engine VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    geom geometry(MultiPolygon, 32647),
    result_geojson JSONB
);

-- Create basic spatial index for fast querying
CREATE INDEX IF NOT EXISTS roads_raw_geom_idx ON roads_raw USING gist(geom);
CREATE INDEX IF NOT EXISTS service_area_results_geom_idx ON service_area_results USING gist(geom);
