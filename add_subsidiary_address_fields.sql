-- Add Ship From and Company Address fields to Subsidiary table
ALTER TABLE "Subsidiary" 
ADD COLUMN "ship_from_address" TEXT,
ADD COLUMN "company_address" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "email" TEXT;

-- Add comments for documentation
COMMENT ON COLUMN "Subsidiary"."ship_from_address" IS 'Full shipping address for this subsidiary';
COMMENT ON COLUMN "Subsidiary"."company_address" IS 'Company address for this subsidiary';
COMMENT ON COLUMN "Subsidiary"."phone" IS 'Phone number for this subsidiary';
COMMENT ON COLUMN "Subsidiary"."email" IS 'Email address for this subsidiary';
