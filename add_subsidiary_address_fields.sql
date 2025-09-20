-- Add Ship From and Company Address fields to subsidiaries table
ALTER TABLE "subsidiaries" 
ADD COLUMN "ship_from_address" TEXT,
ADD COLUMN "company_address" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "email" TEXT;

-- Add comments for documentation
COMMENT ON COLUMN "subsidiaries"."ship_from_address" IS 'Full shipping address for this subsidiary';
COMMENT ON COLUMN "subsidiaries"."company_address" IS 'Company address for this subsidiary';
COMMENT ON COLUMN "subsidiaries"."phone" IS 'Phone number for this subsidiary';
COMMENT ON COLUMN "subsidiaries"."email" IS 'Email address for this subsidiary';
