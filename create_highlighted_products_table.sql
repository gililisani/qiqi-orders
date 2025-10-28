-- Create highlighted_products table
CREATE TABLE IF NOT EXISTS highlighted_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id INTEGER NOT NULL REFERENCES "Products"(id) ON DELETE CASCADE,
  is_new BOOLEAN DEFAULT FALSE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES admins(id),
  UNIQUE(product_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_highlighted_products_product_id ON highlighted_products(product_id);
CREATE INDEX IF NOT EXISTS idx_highlighted_products_display_order ON highlighted_products(display_order);
CREATE INDEX IF NOT EXISTS idx_highlighted_products_is_new ON highlighted_products(is_new);

-- Enable RLS
ALTER TABLE highlighted_products ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can manage all highlighted products
CREATE POLICY "Admins can manage highlighted products" ON highlighted_products
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM admins 
      WHERE admins.id = auth.uid()
    )
  );

-- Clients can view highlighted products
CREATE POLICY "Clients can view highlighted products" ON highlighted_products
  FOR SELECT USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_highlighted_products_updated_at 
  BEFORE UPDATE ON highlighted_products 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
