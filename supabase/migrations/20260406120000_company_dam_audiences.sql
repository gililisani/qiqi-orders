-- Links companies to DAM audiences so client preview/download can enforce
-- dam_asset_audience_map when admins configure per-company audience access.
-- If a company has no rows here, audience tags on assets are not enforced (legacy behavior).

CREATE TABLE IF NOT EXISTS company_dam_audiences (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  audience_id UUID NOT NULL REFERENCES dam_audiences(id) ON DELETE CASCADE,
  PRIMARY KEY (company_id, audience_id)
);

CREATE INDEX IF NOT EXISTS idx_company_dam_audiences_audience_id
  ON company_dam_audiences(audience_id);
