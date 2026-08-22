# 2026 Shopify ↔ NetSuite audit — generated 2026-08-21T21:47Z

Orders in 2026 (Shopify): 1670 (0 test orders excluded)
Amount-verified clean: 1623

## NOT SYNCED (needs attention) (10) — RESOLVED 2026-08-21

ROOT CAUSE: all 10 were EUR-presentment orders (May 21 – Jul 10 EUR window);
NetScore failed on every one of them. 9 imported through the live pipeline
(EUR accommodation: USD amounts + FX rounding line): $5,083.73 invoiced,
9 IFs, all on original dates. #6545 deliberately left open (fully refunded,
items marked RETURN — owner to confirm whether goods came back to stock).
Findings fixed along the way: non-lot items (TOL0006), duplicate-SKU lines
(#6604), duplicate customer in the wrong subsidiary (#6599 → Qiqi INC rule).

- #6545 (2026-05-21, $608.84, refunded $608.84) — NO NetSuite invoice found (era: no records at all)
- #6599 (2026-05-28, $400.77) — NO NetSuite invoice found (era: no records at all)
- #6604 (2026-05-29, $576.55) — NO NetSuite invoice found (era: no records at all)
- #6628 (2026-05-31, $1,344.80) — NO NetSuite invoice found (era: no records at all)
- #6704 (2026-06-08, $60.65) — NO NetSuite invoice found (era: no records at all)
- #6722 (2026-06-09, $668.07) — NO NetSuite invoice found (era: no records at all)
- #6815 (2026-06-22, $0.00) — NO NetSuite invoice found (era: no records at all)
- #6879 (2026-06-29, $1,080.95) — NO NetSuite invoice found (era: no records at all)
- #6893 (2026-07-01, $327.42) — NO NetSuite invoice found (era: no records at all)
- #6964 (2026-07-10, $624.44) — NO NetSuite invoice found (era: no records at all)

## Amount mismatches (NS invoice vs Shopify as-sold) (34)
- #5621 (2026-01-03, $488.90) — NS $533.90 vs Shopify as-sold $488.90 (Δ $45.00)
- #5734 (2026-01-22, $0.00) — NS $150.00 vs Shopify as-sold $0.00 (Δ $150.00)
- #5789 (2026-01-31, $354.90, refunded $148.00) — NS $206.90 vs Shopify as-sold $354.90 (Δ $-148.00)
- #5828 (2026-02-09, $98.00, refunded $56.00) — NS $42.00 vs Shopify as-sold $98.00 (Δ $-56.00)
- #5851 (2026-02-12, $166.90) — NS $194.90 vs Shopify as-sold $166.90 (Δ $28.00)
- #5924 (2026-02-25, $158.30, refunded $149.40) — NS $307.70 vs Shopify as-sold $158.30 (Δ $149.40)
- #5995 (2026-03-08, $219.00) — NS $274.00 vs Shopify as-sold $219.00 (Δ $55.00)
- #6234 (2026-04-13, $210.00) — NS $105.00 vs Shopify as-sold $210.00 (Δ $-105.00)
- #6256 (2026-04-17, $585.24) — NS $617.24 vs Shopify as-sold $585.24 (Δ $32.00)
- #6360 (2026-05-01, $221.80) — NS $193.80 vs Shopify as-sold $221.80 (Δ $-28.00)
- #6402 (2026-05-06, $406.90) — NS $524.90 vs Shopify as-sold $406.90 (Δ $118.00)
- #6435 (2026-05-08, $126.17, refunded $119.90) — NS $145.07 vs Shopify as-sold $126.17 (Δ $18.90)
- #6499 (2026-05-16, $436.50, refunded $145.50) — NS $145.50 vs Shopify as-sold $436.50 (Δ $-291.00)
- #6559 (2026-05-23, $585.44, refunded $146.37) — NS $498.87 vs Shopify as-sold $585.44 (Δ $-86.57)
- #6570 (2026-05-25, $17.10, refunded $8.20) — NS $90.90 vs Shopify as-sold $17.10 (Δ $73.80)
- #6585 (2026-05-26, $391.90) — NS $524.90 vs Shopify as-sold $391.90 (Δ $133.00)
- #6598 (2026-05-28, $251.80, refunded $35.90) — NS $215.90 vs Shopify as-sold $251.80 (Δ $-35.90)
- #6602 (2026-05-28, $455.30, refunded $70.30) — NS $416.80 vs Shopify as-sold $455.30 (Δ $-38.50)
- #6649 (2026-06-02, $208.90) — NS $180.90 vs Shopify as-sold $208.90 (Δ $-28.00)
- #6739 (2026-06-11, $252.80) — NS $224.80 vs Shopify as-sold $252.80 (Δ $-28.00)
- #6753 (2026-06-12, $151.00) — NS $302.00 vs Shopify as-sold $151.00 (Δ $151.00)
- #6760 (2026-06-13, $457.25) — NS $805.25 vs Shopify as-sold $457.25 (Δ $348.00)
- #6773 (2026-06-16, $150.00) — NS $200.00 vs Shopify as-sold $150.00 (Δ $50.00)
- #6787 (2026-06-16, $208.90) — NS $180.90 vs Shopify as-sold $208.90 (Δ $-28.00)
- #6816 (2026-06-22, $351.84, refunded $25.92) — NS $325.92 vs Shopify as-sold $351.84 (Δ $-25.92)
- #6903 (2026-07-01, $208.90) — NS $327.41 vs Shopify as-sold $208.90 (Δ $118.51)
- #6991 (2026-07-14, $218.16) — NS $214.73 vs Shopify as-sold $218.16 (Δ $-3.43)
- #7026 (2026-07-21, $322.90) — NS $240.90 vs Shopify as-sold $322.90 (Δ $-82.00)
- #7029 (2026-07-21, $448.90) — NS $428.90 vs Shopify as-sold $448.90 (Δ $-20.00)
- #7208 (2026-08-12, $208.90) — NS $236.90 vs Shopify as-sold $208.90 (Δ $28.00)
- #7215 (2026-08-13, $194.00) — NS $97.00 vs Shopify as-sold $194.00 (Δ $-97.00)
- #7232 (2026-08-15, $121.90) — NS $184.90 vs Shopify as-sold $121.90 (Δ $63.00)
- #7251 (2026-08-18, $284.40) — NS $269.45 vs Shopify as-sold $284.40 (Δ $-14.95)
- #7268 (2026-08-19, $299.85) — NS $286.85 vs Shopify as-sold $299.85 (Δ $-13.00)

## Refunds in Shopify with NO NS credit memo (3)
- #5789 (2026-01-31, $354.90, refunded $148.00) — refund in Shopify, NO credit memo in NS
- #5804 (2026-02-04, $286.90, refunded $28.00) — refund in Shopify, NO credit memo in NS
- #5828 (2026-02-09, $98.00, refunded $56.00) — refund in Shopify, NO credit memo in NS

## Refund amount mismatches (0)
- none

## Legitimately unsynced (unpaid / cancelled-unpaid) (3)
- #5683 (2026-01-15, $129.90, refunded $129.90) — cancelled (REFUNDED)
- #6638 (2026-06-01, $88.90, refunded $88.90) — cancelled (REFUNDED)
- #6642 (2026-06-01, $308.90, refunded $308.90) — cancelled (REFUNDED)
