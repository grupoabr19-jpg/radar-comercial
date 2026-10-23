ALTER TABLE route_regions ADD COLUMN IF NOT EXISTS seller_name text;
ALTER TABLE route_regions ADD COLUMN IF NOT EXISTS specialist_name text;
ALTER TABLE route_regions ADD COLUMN IF NOT EXISTS corporate_contact text;
ALTER TABLE route_regions ADD COLUMN IF NOT EXISTS construction_contact text;
ALTER TABLE route_regions ADD COLUMN IF NOT EXISTS source_label text;

ALTER TABLE region_cities ADD COLUMN IF NOT EXISTS coverage_type text NOT NULL DEFAULT 'current';
DO $$ BEGIN
  ALTER TABLE region_cities ADD CONSTRAINT region_cities_coverage_type_check
    CHECK (coverage_type IN ('current', 'potential'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

