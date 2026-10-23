CREATE TABLE IF NOT EXISTS municipalities (
  id bigserial PRIMARY KEY,
  city_key text NOT NULL,
  city text NOT NULL,
  state char(2) NOT NULL,
  ibge_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  source_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_key, state)
);

CREATE TABLE IF NOT EXISTS route_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  hub_city text NOT NULL,
  hub_state char(2) NOT NULL,
  hub_latitude numeric(10,7),
  hub_longitude numeric(10,7),
  default_radius_km integer NOT NULL DEFAULT 50 CHECK (default_radius_km BETWEEN 1 AND 500),
  source_batch_id uuid REFERENCES import_batches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS region_cities (
  id bigserial PRIMARY KEY,
  region_id uuid NOT NULL REFERENCES route_regions(id) ON DELETE CASCADE,
  city_key text NOT NULL,
  city text NOT NULL,
  state char(2) NOT NULL,
  latitude numeric(10,7),
  longitude numeric(10,7),
  distance_from_hub_km numeric(10,2),
  source_name text NOT NULL DEFAULT 'routes_import',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, city_key, state)
);
CREATE INDEX IF NOT EXISTS region_cities_radius_idx ON region_cities(region_id, distance_from_hub_km);

CREATE TABLE IF NOT EXISTS planned_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  route_date date NOT NULL,
  seller_name text,
  region_id uuid REFERENCES route_regions(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'in_progress', 'completed', 'cancelled')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES planned_routes(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  prospect_id uuid REFERENCES prospects(id),
  company_name text NOT NULL,
  address text,
  city text,
  state char(2),
  latitude numeric(10,7),
  longitude numeric(10,7),
  appointment_at timestamptz,
  planned_duration_minutes integer NOT NULL DEFAULT 30 CHECK (planned_duration_minutes BETWEEN 5 AND 480),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, sequence_number)
);
CREATE INDEX IF NOT EXISTS route_stops_route_idx ON route_stops(route_id, sequence_number);

