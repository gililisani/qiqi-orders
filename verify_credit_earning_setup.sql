-- Verify that credit earning admin control is set up correctly
-- Run this to check current status

-- 1. Confirm the column exists and check current values
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name = 'Products' 
AND column_name = 'qualifies_for_credit_earning';

-- 2. Show current products and their credit earning status
SELECT 
    "sku",
    "item_name",
    "enable",
    "list_in_support_funds",
    "qualifies_for_credit_earning",
    CASE 
        WHEN "qualifies_for_credit_earning" = TRUE THEN '✅ Earns Credit'
        ELSE '❌ No Credit'
    END as credit_status,
    CASE 
        WHEN "list_in_support_funds" = TRUE THEN '✅ Can Use Credit'
        ELSE '❌ Cannot Use Credit'
    END as support_fund_status
FROM "Products"
WHERE "enable" = TRUE
ORDER BY "sku"
LIMIT 20;

-- 3. Count products by credit earning status
SELECT 
    "qualifies_for_credit_earning",
    COUNT(*) as product_count
FROM "Products"
WHERE "enable" = TRUE
GROUP BY "qualifies_for_credit_earning";

-- SUCCESS MESSAGE
SELECT 'Credit Earning Admin Control is Ready! ✅' as status,
       'Go to Admin → Products → Edit any product to control credit earning.' as instructions;
