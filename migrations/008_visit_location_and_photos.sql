ALTER TABLE visits ADD COLUMN IF NOT EXISTS latitude numeric(10,7);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS longitude numeric(10,7);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS location_accuracy_m numeric(10,2);
ALTER TABLE visits ADD COLUMN IF NOT EXISTS location_captured_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='visits_location_check'
      AND conrelid='visits'::regclass
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT visits_location_check CHECK (
      (latitude IS NULL AND longitude IS NULL)
      OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='visits_location_accuracy_check'
      AND conrelid='visits'::regclass
  ) THEN
    ALTER TABLE visits ADD CONSTRAINT visits_location_accuracy_check CHECK (
      location_accuracy_m IS NULL OR location_accuracy_m >= 0
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS visit_photos (
  visit_id uuid PRIMARY KEY REFERENCES visits(id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  photo_data bytea NOT NULL,
  file_size integer NOT NULL CHECK (file_size BETWEEN 1 AND 5242880),
  created_at timestamptz NOT NULL DEFAULT now()
);
