-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_asset_id UUID REFERENCES dam_assets(id) ON DELETE SET NULL,
  product_line TEXT CHECK (product_line IN ('ProCtrl', 'SelfCtrl', 'Both', 'None')),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create campaign_assets junction table
CREATE TABLE IF NOT EXISTS campaign_assets (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES dam_assets(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, asset_id)
);

-- Create indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_campaign_assets_campaign_id ON campaign_assets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_asset_id ON campaign_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_thumbnail_asset_id ON campaigns(thumbnail_asset_id);

-- Add RLS policies
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_assets ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all campaigns
CREATE POLICY "Admins can view campaigns"
  ON campaigns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND enabled = true
    )
  );

-- Allow admins to create campaigns
CREATE POLICY "Admins can create campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND enabled = true
    )
  );

-- Allow admins to update campaigns
CREATE POLICY "Admins can update campaigns"
  ON campaigns FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND enabled = true
    )
  );

-- Allow admins to delete campaigns
CREATE POLICY "Admins can delete campaigns"
  ON campaigns FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND enabled = true
    )
  );

-- Allow admins to view campaign_assets
CREATE POLICY "Admins can view campaign_assets"
  ON campaign_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND enabled = true
    )
  );

-- Allow admins to insert campaign_assets
CREATE POLICY "Admins can create campaign_assets"
  ON campaign_assets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND enabled = true
    )
  );

-- Allow admins to delete campaign_assets
CREATE POLICY "Admins can delete campaign_assets"
  ON campaign_assets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND enabled = true
    )
  );

-- Add comment
COMMENT ON TABLE campaigns IS 'Campaigns are named groups of assets';
COMMENT ON TABLE campaign_assets IS 'Junction table linking campaigns to assets';

