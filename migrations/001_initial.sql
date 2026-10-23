CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('erp', 'routes', 'candidates')),
  file_name text NOT NULL,
  sheet_name text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  total_rows integer NOT NULL DEFAULT 0,
  accepted_rows integer NOT NULL DEFAULT 0,
  rejected_rows integer NOT NULL DEFAULT 0,
  detected_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS import_rows (
  id bigserial PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL,
  normalized_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'accepted', 'rejected', 'duplicate')),
  validation_notes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_number)
);

CREATE TABLE IF NOT EXISTS erp_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text NOT NULL UNIQUE,
  cnpj text,
  company_name text NOT NULL,
  city text,
  state char(2),
  postal_code text,
  address text,
  segment text,
  seller_name text,
  region_code text,
  region_name text,
  seller_type text,
  contact_email text,
  phone text,
  credit_limit numeric(16,2),
  days_since_last_sale integer,
  customer_created_at date,
  purchase_age_band text,
  source_batch_id uuid REFERENCES import_batches(id),
  source_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS erp_customers_cnpj_uq ON erp_customers(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS erp_customers_city_state_idx ON erp_customers(state, city);
CREATE INDEX IF NOT EXISTS erp_customers_company_name_idx ON erp_customers(lower(company_name));

CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_key text,
  cnpj text,
  company_name text NOT NULL,
  trade_name text,
  segment text,
  city text,
  state char(2),
  postal_code text,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'qualify', 'contacted', 'negotiating', 'won', 'lost', 'do_not_contact', 'review')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  score smallint NOT NULL DEFAULT 50 CHECK (score BETWEEN 0 AND 100),
  confidence smallint NOT NULL DEFAULT 30 CHECK (confidence BETWEEN 0 AND 100),
  potential_min numeric(16,2),
  potential_max numeric(16,2),
  product_families text[] NOT NULL DEFAULT '{}',
  score_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_name text,
  source_batch_id uuid REFERENCES import_batches(id),
  assigned_to text,
  last_contact_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prospects_cnpj_uq ON prospects(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS prospects_queue_idx ON prospects(status, priority, score DESC);
CREATE INDEX IF NOT EXISTS prospects_city_state_idx ON prospects(state, city);

CREATE TABLE IF NOT EXISTS visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid REFERENCES prospects(id),
  company_name text NOT NULL,
  city text,
  seller_name text NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL,
  next_action text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_visited_at_idx ON visits(visited_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  actor_email text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

