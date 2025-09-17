-- Add Sales Order fields to Company table and create lookup tables
-- This adds Ship To, Incoterm, and Payment Terms functionality

-- 1. Create Incoterms lookup table
CREATE TABLE IF NOT EXISTS "incoterms" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Payment Terms lookup table
CREATE TABLE IF NOT EXISTS "payment_terms" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Add new fields to Companies table
DO $$ 
BEGIN
    -- Add ship_to field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'companies' 
        AND column_name = 'ship_to'
    ) THEN
        ALTER TABLE "companies" 
        ADD COLUMN "ship_to" TEXT;
    END IF;

    -- Add incoterm_id field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'companies' 
        AND column_name = 'incoterm_id'
    ) THEN
        ALTER TABLE "companies" 
        ADD COLUMN "incoterm_id" INTEGER REFERENCES "incoterms"("id");
    END IF;

    -- Add payment_terms_id field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'companies' 
        AND column_name = 'payment_terms_id'
    ) THEN
        ALTER TABLE "companies" 
        ADD COLUMN "payment_terms_id" INTEGER REFERENCES "payment_terms"("id");
    END IF;
END $$;

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_companies_incoterm_id ON "companies"("incoterm_id");
CREATE INDEX IF NOT EXISTS idx_companies_payment_terms_id ON "companies"("payment_terms_id");

-- 5. Insert default/common incoterms
INSERT INTO "incoterms" ("name", "description") VALUES
  ('EXW', 'Ex Works - Seller makes goods available at their premises'),
  ('FCA', 'Free Carrier - Seller delivers goods to carrier nominated by buyer'),
  ('CPT', 'Carriage Paid To - Seller pays freight to named destination'),
  ('CIP', 'Carriage and Insurance Paid To - Seller pays freight and insurance'),
  ('DAP', 'Delivered at Place - Seller delivers to named place'),
  ('DPU', 'Delivered at Place Unloaded - Seller delivers and unloads at destination'),
  ('DDP', 'Delivered Duty Paid - Seller delivers with all duties paid'),
  ('FAS', 'Free Alongside Ship - Seller delivers alongside ship'),
  ('FOB', 'Free on Board - Seller delivers goods on board ship'),
  ('CFR', 'Cost and Freight - Seller pays freight to destination port'),
  ('CIF', 'Cost, Insurance and Freight - Seller pays freight and insurance')
ON CONFLICT (name) DO NOTHING;

-- 6. Insert common payment terms
INSERT INTO "payment_terms" ("name", "description") VALUES
  ('Net 30', 'Payment due within 30 days'),
  ('Net 15', 'Payment due within 15 days'),
  ('Net 60', 'Payment due within 60 days'),
  ('Due on Receipt', 'Payment due immediately upon receipt'),
  ('2/10 Net 30', '2% discount if paid within 10 days, otherwise due in 30 days'),
  ('COD', 'Cash on Delivery'),
  ('Prepaid', 'Payment required before shipment'),
  ('Letter of Credit', 'Payment via letter of credit')
ON CONFLICT (name) DO NOTHING;

-- 7. Enable RLS on new tables
ALTER TABLE "incoterms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_terms" ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS policies
-- Incoterms policies
CREATE POLICY "Everyone can view incoterms" ON "incoterms"
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage incoterms" ON "incoterms"
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM "admins" WHERE "id" = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM "admins" WHERE "id" = auth.uid()));

-- Payment terms policies
CREATE POLICY "Everyone can view payment terms" ON "payment_terms"
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage payment terms" ON "payment_terms"
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM "admins" WHERE "id" = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM "admins" WHERE "id" = auth.uid()));

-- 9. Add comments for documentation
COMMENT ON TABLE "incoterms" IS 'International Commercial Terms for shipping and delivery';
COMMENT ON TABLE "payment_terms" IS 'Payment terms and conditions for companies';
COMMENT ON COLUMN "companies"."ship_to" IS 'Multi-line shipping address and instructions';
COMMENT ON COLUMN "companies"."incoterm_id" IS 'Reference to incoterms table for shipping terms';
COMMENT ON COLUMN "companies"."payment_terms_id" IS 'Reference to payment_terms table for payment conditions';

-- 10. Verify tables were created
SELECT 'Tables created successfully!' as status;
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('incoterms', 'payment_terms') 
AND table_schema = 'public';
