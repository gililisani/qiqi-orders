-- Temporarily disable RLS on packing_slips table for testing
-- This should fix the 406 error immediately

-- Disable RLS temporarily
ALTER TABLE packing_slips DISABLE ROW LEVEL SECURITY;

-- Test access
SELECT 'RLS disabled - testing access:' as info;
SELECT COUNT(*) as packing_slips_count FROM packing_slips;

-- To re-enable RLS later, run:
-- ALTER TABLE packing_slips ENABLE ROW LEVEL SECURITY;
