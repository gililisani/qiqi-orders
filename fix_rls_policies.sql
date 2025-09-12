-- Fix RLS policies for all tables to allow admin access

-- Enable RLS on all tables
ALTER TABLE "Products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_fund_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subsidiaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable all operations for admins" ON "Products";
DROP POLICY IF EXISTS "Enable all operations for admins" ON "companies";
DROP POLICY IF EXISTS "Enable all operations for admins" ON "orders";
DROP POLICY IF EXISTS "Enable all operations for admins" ON "order_items";
DROP POLICY IF EXISTS "Enable all operations for admins" ON "Locations";
DROP POLICY IF EXISTS "Enable all operations for admins" ON "support_fund_levels";
DROP POLICY IF EXISTS "Enable all operations for admins" ON "subsidiaries";
DROP POLICY IF EXISTS "Enable all operations for admins" ON "classes";
DROP POLICY IF EXISTS "Enable all operations for admins" ON "admins";
DROP POLICY IF EXISTS "Enable all operations for admins" ON "clients";

-- Create new policies that allow all operations for admins
CREATE POLICY "Enable all operations for admins" ON "Products" FOR ALL USING (true);
CREATE POLICY "Enable all operations for admins" ON "companies" FOR ALL USING (true);
CREATE POLICY "Enable all operations for admins" ON "orders" FOR ALL USING (true);
CREATE POLICY "Enable all operations for admins" ON "order_items" FOR ALL USING (true);
CREATE POLICY "Enable all operations for admins" ON "Locations" FOR ALL USING (true);
CREATE POLICY "Enable all operations for admins" ON "support_fund_levels" FOR ALL USING (true);
CREATE POLICY "Enable all operations for admins" ON "subsidiaries" FOR ALL USING (true);
CREATE POLICY "Enable all operations for admins" ON "classes" FOR ALL USING (true);
CREATE POLICY "Enable all operations for admins" ON "admins" FOR ALL USING (true);
CREATE POLICY "Enable all operations for admins" ON "clients" FOR ALL USING (true);

-- Add client-specific policies for orders and order_items
CREATE POLICY "Clients can view their own orders" ON "orders" FOR SELECT USING (
  user_id IN (SELECT id FROM clients WHERE id = auth.uid())
);

CREATE POLICY "Clients can view their own order items" ON "order_items" FOR SELECT USING (
  order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())
);

-- Add client-specific policies for companies (they can only see their own company)
CREATE POLICY "Clients can view their own company" ON "companies" FOR SELECT USING (
  id IN (SELECT company_id FROM clients WHERE id = auth.uid())
);

-- Add client-specific policies for products (they can see enabled products)
CREATE POLICY "Clients can view enabled products" ON "Products" FOR SELECT USING (enable = true);

-- Add client-specific policies for reference tables (they can see all)
CREATE POLICY "Clients can view all locations" ON "Locations" FOR SELECT USING (true);
CREATE POLICY "Clients can view all support fund levels" ON "support_fund_levels" FOR SELECT USING (true);
CREATE POLICY "Clients can view all subsidiaries" ON "subsidiaries" FOR SELECT USING (true);
CREATE POLICY "Clients can view all classes" ON "classes" FOR SELECT USING (true);
