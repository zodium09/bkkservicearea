CREATE TABLE IF NOT EXISTS dataset_registry (
  dataset_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publisher TEXT,
  source_role TEXT NOT NULL,
  source_url TEXT,
  source_format TEXT,
  refresh_policy TEXT,
  license_note TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS district_population (
  district_name TEXT NOT NULL,
  reference_year INTEGER NOT NULL,
  population_total INTEGER NOT NULL CHECK (population_total >= 0),
  population_male INTEGER CHECK (population_male >= 0),
  population_female INTEGER CHECK (population_female >= 0),
  dataset_id TEXT REFERENCES dataset_registry(dataset_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (district_name, reference_year)
);

CREATE TABLE IF NOT EXISTS road_speed_profiles (
  edge_id BIGINT NOT NULL,
  day_type TEXT NOT NULL,
  time_bin TIME NOT NULL,
  speed_kph DOUBLE PRECISION NOT NULL CHECK (speed_kph > 0),
  sample_count INTEGER,
  confidence DOUBLE PRECISION,
  dataset_id TEXT REFERENCES dataset_registry(dataset_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (edge_id, day_type, time_bin)
);

CREATE INDEX IF NOT EXISTS road_speed_profiles_edge_idx ON road_speed_profiles(edge_id);

CREATE TABLE IF NOT EXISTS traffic_segments_current (
  segment_id TEXT PRIMARY KEY,
  road_name TEXT,
  congestion_level TEXT,
  speed_kph DOUBLE PRECISION,
  observed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  source_id TEXT REFERENCES dataset_registry(dataset_id),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Geometry, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS traffic_segments_current_geom_idx
ON traffic_segments_current USING GIST(geom);

CREATE INDEX IF NOT EXISTS traffic_segments_current_expiry_idx
ON traffic_segments_current(expires_at);
