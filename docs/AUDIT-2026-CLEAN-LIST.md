# 2026 — Shopify vs NetSuite, the clean list (2026-08-22T15:14Z)

Orders: 1671 · test excluded: 0 · unpaid/cancelled (nothing to record): 0 · **properly recorded: 1635** · on the list below: 36

Definition — properly recorded = NS invoice/fulfillment/credit memo exist as Shopify says, cash recorded == cash Shopify moved, net revenue == Shopify net. All 2026 periods are open.

## THE LIST — 36 orders needing action

- #5627 · 2026-01-04 · shopify_payments · Shopify $140.26
  NS: invoice INVUS15600 $140.26; payments: PUS15457 $132.00 → 100501; write-offs $8.26
  WRONG: cash recorded $132.00 vs Shopify charged $140.26 (Δ $-8.26); net revenue booked $132.00 vs Shopify net $140.26 (Δ $-8.26)
  Bookkeeper: not bank-matched in NS
- #5683 · 2026-01-15 · shopify_payments · Shopify $129.90 −$129.90 refunded → **NOT IN NETSUITE** (no invoice)
- #5734 · 2026-01-22 · ? · Shopify $0.00
  NS: invoice INVUS15486 $150.00; payments: PUS15340 $150.00 → 101321
  WRONG: cash recorded $150.00 vs Shopify charged $0.00 (Δ $150.00); net revenue booked $150.00 vs Shopify net $0.00 (Δ $150.00)
  Bookkeeper: not bank-matched in NS
- #5789 · 2026-01-31 · shopify_payments · Shopify $354.90 −$148.00 refunded
  NS: invoice INVUS15604 $206.90; payments: PUS15461 $206.90 → 100501
  WRONG: booked NET of the $148.00 refund (invoice and payment reduced; no credit memo, no customer refund) — net cash/revenue right, gross wrong
  Bookkeeper: not bank-matched in NS
- #5804 · 2026-02-04 · shopify_payments · Shopify $314.90 −$28.00 refunded
  NS: invoice INVUS15620 $286.90; payments: PUS15477 $286.90 → 100501
  WRONG: booked NET of the $28.00 refund (invoice and payment reduced; no credit memo, no customer refund) — net cash/revenue right, gross wrong
  Bookkeeper: not bank-matched in NS
- #5828 · 2026-02-09 · paypal · Shopify $98.00 −$56.00 refunded
  NS: invoice INVUS15646 $42.00; payments: PUS15503 $42.00 → 100504
  WRONG: booked NET of the $56.00 refund (invoice and payment reduced; no credit memo, no customer refund) — net cash/revenue right, gross wrong
  Bookkeeper: not bank-matched in NS
- #6234 · 2026-04-13 · manual · Shopify $210.00
  NS: invoice INVUS16073 $105.00; payments: PUS15932 $105.00 → 101321
  WRONG: cash recorded $105.00 vs Shopify charged $210.00 (Δ $-105.00); net revenue booked $105.00 vs Shopify net $210.00 (Δ $-105.00)
  Bookkeeper: not bank-matched in NS
- #6360 · 2026-05-01 · shopify_payments · Shopify $221.80
  NS: invoice INVUS17139 $193.80; payments: PUS16989 $193.80 → 100501
  WRONG: cash recorded $193.80 vs Shopify charged $221.80 (Δ $-28.00); net revenue booked $193.80 vs Shopify net $221.80 (Δ $-28.00)
  Bookkeeper: not bank-matched in NS
- #6499 · 2026-05-16 · shopify_payments · Shopify $291.00 −$145.50 refunded
  NS: invoice INVUS16337 $145.50, CM $145.50; payments: PUS16200 $145.50 → 100501
  WRONG: cash recorded $145.50 vs Shopify charged $291.00 (Δ $-145.50); net revenue booked $0.00 vs Shopify net $145.50 (Δ $-145.50)
  Bookkeeper: not bank-matched in NS
- #6519 · 2026-05-19 · shopify_payments · Shopify $303.90
  NS: invoice INVUS16358 $303.90; payments: PUS16220 $303.90 → 100501
  WRONG: shipped in Shopify, no item fulfillment in NS
  Bookkeeper: not bank-matched in NS
- #6545 · 2026-05-21 · shopify_payments · Shopify $614.88 −$608.84 refunded → **NOT IN NETSUITE** (no invoice)
- #6571 · 2026-05-25 · shopify_payments · Shopify $108.90
  NS: invoice INVUS16409 $108.90; payments: PUS16272 $108.90 → 100501
  WRONG: shipped in Shopify, no item fulfillment in NS
  Bookkeeper: not bank-matched in NS
- #6578 · 2026-05-26 · shopify_payments · Shopify $158.90
  NS: invoice INVUS16416 $158.90; payments: PUS16279 $158.90 → 100501
  WRONG: shipped in Shopify, no item fulfillment in NS
  Bookkeeper: not bank-matched in NS
- #6579 · 2026-05-26 · shopify_payments · Shopify $545.80
  NS: invoice INVUS16417 $545.80; payments: PUS16280 $545.80 → 100501
  WRONG: shipped in Shopify, no item fulfillment in NS
  Bookkeeper: not bank-matched in NS
- #6580 · 2026-05-26 · shopify_payments · Shopify $158.90
  NS: invoice INVUS16418 $158.90; payments: PUS16281 $158.90 → 100501
  WRONG: shipped in Shopify, no item fulfillment in NS
  Bookkeeper: not bank-matched in NS
- #6581 · 2026-05-26 · shopify_payments · Shopify $286.90
  NS: invoice INVUS16419 $286.90; payments: PUS16282 $286.90 → 100501
  WRONG: shipped in Shopify, no item fulfillment in NS
  Bookkeeper: not bank-matched in NS
- #6583 · 2026-05-26 · shopify_payments · Shopify $83.90
  NS: invoice INVUS16420 $83.90; payments: PUS16283 $83.90 → 100501
  WRONG: shipped in Shopify, no item fulfillment in NS
  Bookkeeper: not bank-matched in NS
- #6584 · 2026-05-26 · shopify_payments · Shopify $388.90
  NS: invoice INVUS16421 $388.90; payments: PUS16284 $388.90 → 100501
  WRONG: shipped in Shopify, no item fulfillment in NS
  Bookkeeper: not bank-matched in NS
- #6587 · 2026-05-26 · shopify_payments · Shopify $124.00
  NS: invoice INVUS16423 $124.00; payments: PUS16286 $124.00 → 100501
  WRONG: shipped in Shopify, no item fulfillment in NS
  Bookkeeper: not bank-matched in NS
- #6590 · 2026-05-27 · shopify_payments · Shopify $138.00
  NS: invoice INVUS16426 $138.00; payments: PUS16289 $138.00 → 100501
  WRONG: shipped in Shopify, no item fulfillment in NS
  Bookkeeper: not bank-matched in NS
- #6638 · 2026-06-01 · paypal · Shopify $88.90 −$88.90 refunded → **NOT IN NETSUITE** (no invoice)
- #6642 · 2026-06-01 · shopify_payments · Shopify $308.90 −$308.90 refunded → **NOT IN NETSUITE** (no invoice)
- #6649 · 2026-06-02 · shopify_payments · Shopify $208.90
  NS: invoice INVUS16434 $180.90; payments: PUS16297 $180.90 → 100501
  WRONG: cash recorded $180.90 vs Shopify charged $208.90 (Δ $-28.00); net revenue booked $180.90 vs Shopify net $208.90 (Δ $-28.00)
  Bookkeeper: not bank-matched in NS
- #6739 · 2026-06-11 · shopify_payments · Shopify $252.80
  NS: invoice INVUS17140 $224.80; payments: PUS16990 $224.80 → 100501
  WRONG: cash recorded $224.80 vs Shopify charged $252.80 (Δ $-28.00); net revenue booked $224.80 vs Shopify net $252.80 (Δ $-28.00)
  Bookkeeper: not bank-matched in NS
- #6760 · 2026-06-13 · paypal · Shopify $457.25
  NS: invoice INVUS16616 $805.25; payments: PUS16476 $805.25 → 100504
  WRONG: cash recorded $805.25 vs Shopify charged $457.25 (Δ $348.00); net revenue booked $805.25 vs Shopify net $457.25 (Δ $348.00)
  Bookkeeper: not bank-matched in NS
- #6773 · 2026-06-16 · manual · Shopify $150.00
  NS: invoice INVUS16631 $200.00; payments: PUS16488 $200.00 → 101321
  WRONG: cash recorded $200.00 vs Shopify charged $150.00 (Δ $50.00); net revenue booked $200.00 vs Shopify net $150.00 (Δ $50.00)
  Bookkeeper: not bank-matched in NS
- #6787 · 2026-06-16 · paypal · Shopify $208.90
  NS: invoice INVUS16645 $180.90; payments: PUS16501 $180.90 → 100504
  WRONG: cash recorded $180.90 vs Shopify charged $208.90 (Δ $-28.00); net revenue booked $180.90 vs Shopify net $208.90 (Δ $-28.00)
  Bookkeeper: not bank-matched in NS
- #6903 · 2026-07-01 · shopify_payments · Shopify $208.90
  NS: invoice INVUS16778 $327.41; payments: PUS16630 $327.41 → 100501
  WRONG: cash recorded $327.41 vs Shopify charged $208.90 (Δ $118.51); net revenue booked $327.41 vs Shopify net $208.90 (Δ $118.51)
  Bookkeeper: not bank-matched in NS
- #6991 · 2026-07-14 · paypal · Shopify $218.16
  NS: invoice INVUS16868 $214.73; payments: PUS16717 $214.73 → 100504
  WRONG: cash recorded $214.73 vs Shopify charged $218.16 (Δ $-3.43); net revenue booked $214.73 vs Shopify net $218.16 (Δ $-3.43)
  Bookkeeper: not bank-matched in NS
- #7026 · 2026-07-21 · shopify_payments · Shopify $322.90
  NS: invoice INVUS16904 $240.90; payments: PUS16753 $240.90 → 100501
  WRONG: cash recorded $240.90 vs Shopify charged $322.90 (Δ $-82.00); net revenue booked $240.90 vs Shopify net $322.90 (Δ $-82.00)
  Bookkeeper: not bank-matched in NS
- #7029 · 2026-07-21 · shopify_payments · Shopify $448.90
  NS: invoice INVUS16907 $428.90; payments: PUS16756 $428.90 → 100501
  WRONG: cash recorded $428.90 vs Shopify charged $448.90 (Δ $-20.00); net revenue booked $428.90 vs Shopify net $448.90 (Δ $-20.00)
  Bookkeeper: not bank-matched in NS
- #7208 · 2026-08-12 · shopify_payments · Shopify $208.90
  NS: invoice INVUS17089 $236.90; payments: PUS16939 $236.90 → 100501
  WRONG: cash recorded $236.90 vs Shopify charged $208.90 (Δ $28.00); net revenue booked $236.90 vs Shopify net $208.90 (Δ $28.00)
  Bookkeeper: not bank-matched in NS
- #7215 · 2026-08-13 · shopify_payments · Shopify $194.00
  NS: invoice INVUS17096 $97.00; payments: PUS16946 $97.00 → 100501
  WRONG: cash recorded $97.00 vs Shopify charged $194.00 (Δ $-97.00); net revenue booked $97.00 vs Shopify net $194.00 (Δ $-97.00)
  Bookkeeper: not bank-matched in NS
- #7232 · 2026-08-15 · shopify_payments · Shopify $121.90
  NS: invoice INVUS17113 $184.90; payments: PUS16963 $184.90 → 100501
  WRONG: cash recorded $184.90 vs Shopify charged $121.90 (Δ $63.00); net revenue booked $184.90 vs Shopify net $121.90 (Δ $63.00)
  Bookkeeper: not bank-matched in NS
- #7251 · 2026-08-18 · shopify_payments · Shopify $284.40
  NS: invoice INVUS17132 $269.45; payments: PUS16982 $269.45 → 100501
  WRONG: cash recorded $269.45 vs Shopify charged $284.40 (Δ $-14.95); net revenue booked $269.45 vs Shopify net $284.40 (Δ $-14.95)
  Bookkeeper: not bank-matched in NS
- #7268 · 2026-08-19 · shopify_payments · Shopify $299.85
  NS: invoice INVUS17151 $286.85; payments: PUS17001 $286.85 → 100501
  WRONG: cash recorded $286.85 vs Shopify charged $299.85 (Δ $-13.00); net revenue booked $286.85 vs Shopify net $299.85 (Δ $-13.00)
  Bookkeeper: not bank-matched in NS

## Presentation only — 7 orders (net correct; NetScore overstated the invoice and the bookkeeper wrote the difference off at payment). No action unless the CPA wants gross sales to match Shopify.

- #5621 · 2026-01-03 · Affirm · Shopify $488.90 — invoice $533.90 with $45.00 written off at payment (net correct)
- #5851 · 2026-02-12 · shopify_payments · Shopify $166.90 — invoice $194.90 with $28.00 written off at payment (net correct)
- #5995 · 2026-03-08 · shopify_payments · Shopify $219.00 — invoice $274.00 with $55.00 written off at payment (net correct)
- #6256 · 2026-04-17 · paypal · Shopify $585.24 — invoice $617.24 with $32.00 written off at payment (net correct)
- #6402 · 2026-05-06 · shopify_payments · Shopify $406.90 — invoice $524.90 with $118.00 written off at payment (net correct)
- #6585 · 2026-05-26 · shopify_payments · Shopify $391.90 — invoice $524.90 with $133.00 written off at payment (net correct)
- #6753 · 2026-06-12 · shopify_payments · Shopify $151.00 — invoice $302.00 with $151.00 written off at payment (net correct)
