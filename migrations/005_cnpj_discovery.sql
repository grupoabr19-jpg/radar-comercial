ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS primary_cnae text;
ALTER TABLE erp_customers ADD COLUMN IF NOT EXISTS cnae_source_date date;

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS primary_cnae text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS cnae_description text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS cadastral_status text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS company_size text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS opened_at date;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS source_snapshot_date date;

CREATE TABLE IF NOT EXISTS prospecting_cnaes (
  cnae text PRIMARY KEY,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  weight numeric(8,4) NOT NULL DEFAULT 1,
  source_customer_count integer NOT NULL DEFAULT 0,
  source_name text NOT NULL DEFAULT 'erp_frequency',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discovery_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  snapshot_date date,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  known_customers integer NOT NULL DEFAULT 0,
  matched_customers integer NOT NULL DEFAULT 0,
  target_cnaes integer NOT NULL DEFAULT 0,
  regional_companies integer NOT NULL DEFAULT 0,
  prospects_created integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS erp_customers_primary_cnae_idx ON erp_customers(primary_cnae);
CREATE INDEX IF NOT EXISTS prospects_primary_cnae_idx ON prospects(primary_cnae);
CREATE INDEX IF NOT EXISTS prospects_source_snapshot_idx ON prospects(source_name, source_snapshot_date);
