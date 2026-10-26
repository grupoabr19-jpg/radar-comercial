ALTER TABLE prospecting_cnaes ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending';
ALTER TABLE prospecting_cnaes ADD COLUMN IF NOT EXISTS fit_score integer NOT NULL DEFAULT 0;
ALTER TABLE prospecting_cnaes ADD COLUMN IF NOT EXISTS customer_share numeric(10,6) NOT NULL DEFAULT 0;
ALTER TABLE prospecting_cnaes ADD COLUMN IF NOT EXISTS rationale jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE prospecting_cnaes ADD COLUMN IF NOT EXISTS curation_source text NOT NULL DEFAULT 'heuristic';
ALTER TABLE prospecting_cnaes ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE prospecting_cnaes ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE prospecting_cnaes ADD COLUMN IF NOT EXISTS review_notes text;

UPDATE prospecting_cnaes
SET review_status = CASE WHEN enabled THEN 'approved' ELSE 'rejected' END
WHERE source_name = 'erp_frequency' AND review_status = 'pending';

CREATE TABLE IF NOT EXISTS prospecting_cnae_matches (
  seed_cnae text NOT NULL REFERENCES prospecting_cnaes(cnae) ON DELETE CASCADE,
  candidate_cnae text NOT NULL,
  candidate_description text,
  match_type text NOT NULL,
  similarity_weight numeric(6,4) NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (seed_cnae, candidate_cnae)
);

CREATE INDEX IF NOT EXISTS prospecting_cnaes_review_idx
  ON prospecting_cnaes(review_status, enabled, fit_score DESC);
CREATE INDEX IF NOT EXISTS prospecting_cnae_matches_candidate_idx
  ON prospecting_cnae_matches(candidate_cnae, enabled);

ALTER TABLE discovery_runs ADD COLUMN IF NOT EXISTS related_cnaes integer NOT NULL DEFAULT 0;
