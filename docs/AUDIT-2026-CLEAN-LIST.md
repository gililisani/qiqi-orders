# 2026 — Shopify vs NetSuite, the clean list (2026-08-22T19:49Z)

Orders: 1672 · test excluded: 0 · unpaid/cancelled (nothing to record): 0 · **properly recorded: 1669** · on the list below: 3

Definition — properly recorded = NS invoice/fulfillment/credit memo exist as Shopify says, cash recorded == cash Shopify moved, net revenue == Shopify net. All 2026 periods are open.

## Progress

- **Group A (10 × shipped, no IF) — DONE 2026-08-22.** Root cause: NetScore created these SOs with inventory location Packable (31) right before the 3PL switch; BrandFox shipped them (owner-confirmed). Fix: relocated every line 31→46 (NetSuite flipped inventory subsidiary to Qiqi Global = CSF), then booked IF18246–IF18255 on the original ship dates with FEFO lots. #6519, #6571, #6578, #6579, #6580, #6581, #6583, #6584, #6587, #6590.

- **Group B, portion 1 (Buy-X-get-Y / Salon re-pricing) — DONE 2026-08-22.** #6360, #6649, #6739, #6787, #6903, #7208: NetScore priced lines at the Salon price level (FPS0017 $28 vs Shopify $56 etc.) while keeping Shopify's discount → invoices and cash off by the difference. Fixed IN PLACE on original dates: product lines → Shopify unit prices (Custom price level), header discount → Shopify's total discount, payment → what Shopify charged (#6903 −$118.51 and #7208 −$28 phantom cash reversed). Cosmetic leftover: #6739 and #6903 carry a $0 "Shopify Discount" line (REST cannot delete sublist lines) — owner may delete in the UI.
- **#5627 — removed from the list**: Shop-remitted marketplace tax ($8.26) correctly netted; only presentation differs.

- **Group B, portions 2+3 — DONE 2026-08-22.** Re-pricing: #7026, #7029, #7215, #7232 (lines → Shopify prices, payment → charged). Dropped duties: #6991 (+$3.43), #7251 (+$14.95), #7268 (+$13.00) — "Import Duties" line added on item 1464 → 240504 pass-through, header discount re-asserted flat, payment → charged. Group B remaining: **#6760 only** (Pro Discount / B2B-workaround case — awaiting owner guidance on representation).

- **#6760 — DONE 2026-08-22. GROUP B COMPLETE (14/14).** Pro-Discount-era representation RULE (owner, option b): book product lines at the NET wholesale price (Shopify original − Pro Discount allocation), NO discount line — Sales reflects what the salon paid; never inflate 420000. VAT/duties always → 240504 pass-through. #6760: $805.25 → $457.25 on invoice, SO and PayPal payment ($348 phantom reversed; $79.35 BE VAT moved from revenue to 240504).

- **Group C (4 netted refunds) — DONE 2026-08-22 (owner: "restructure all four").** Restructured IN PLACE to the live engine's representation: invoice + payment at what Shopify charged, Credit Memo on item 1565 (Refund Adjustment → 410000, no inventory) dated the Shopify refund date, Customer Refund from the gateway clearing account. Net revenue unchanged; gross + returns now match Shopify; 100501/100504 mirror Shopify's +charge/−refund lines. IFs untouched.
  - #5789: lines back to $64/$28 → INVUS15604 $354.90, PUS15461 $354.90, **CMUS10121** $148 (2026-02-04) + refund from 100501. (Shopify "refund" was a Pro-Discount price correction; goods were kept.)
  - #5804: FPS0017 $28→$56 → INVUS15620 $314.90, PUS15477 $314.90, **CMUS10122** $28 (2026-02-04, partial $28 of a $56 line → amount-only adjustment line) + refund from 100501.
  - #5828: cancelled-before-shipping FPS0016 could NOT be re-added to INVUS15646 (REST treats an added inventory line as a standalone sale → "configure the inventory detail" = it would move stock). Billed instead on a **second invoice INVUS17174 $56 transformed from SOUS15638** (SO-linked, no inventory posting — verified), PUS15503 $42→$98 applied across both, **CMUS10123** $56 (2026-02-13) + refund from 100504 (PayPal), SO line closed → SOUS15638 now Closed (was Partially Fulfilled with the line open in the backlog).
  - #6499: lines back to Shopify prices → INVUS16337/SOUS16317/PUS16200 $145.50→$291; existing CMUS10097 + refund kept. Net revenue now $145.50 (was $0).
  - Found on the way: prod REST refuses a Credit Memo without a header location → engine config `creditMemoLocationId` set to 31 (the live engine had not created a prod CM yet; its first refund would have parked).

- **Group D (4 fully-refunded orders absent from NS) — DONE 2026-08-22 (owner: book in+out; #6545 goods did NOT come back).** Imported through the live engine's own entry (`import-absent.ts` = the dashboard "Import order #" cure), original dates, engine external ids (reconcile-visible):
  - #5683 → SOUS17170 / INVUS17176 / PUS17023 $129.90 (2026-01-15) + CMUS10124 + refund $129.90 (2026-01-16); #6638 → SOUS17171 / INVUS17177 / PUS17024 $88.90 + CMUS10125 + PayPal refund (2026-06-01); #6642 → SOUS17172 / INVUS17178 / PUS17025 $308.90 + CMUS10126 + refund (2026-06-01). Never shipped → SO lines closed (status H); every account nets to $0, clearing accounts carry the +charge/−refund pair Shopify's payouts contain.
  - #6545 (EUR-presentment, shipped) → SOUS17173 / INVUS17179 / PUS17026 $614.88 (2026-05-21, FX rounding $0.02), **IF18256** (16 units out of BrandFox, COGS $124.26), CMUS10127 + refund $608.84 (2026-06-19) booked money-only on 1565 (engine parks restock refunds — `--money-only-refund` bypass, owner-confirmed no physical return). Net cash +$6.04 = Shopify. Rule (b) re-pricing DONE (owner "do it", 2026-08-22 evening): lines → net wholesale, header discount 0, $420.64 out of 420000; totals unchanged; invoice GL 410000 −508.16 / 240504 −106.72.
  - Engine gap noted: the live path does not close SO lines of cancelled never-shipped orders (a paid-then-cancelled order would sit in the fulfillment backlog) — candidate for the engine; cleanup closed them by hand.
- **clean-list.ts upgraded** — sees cleanup-era IFs/second invoices (via `createdfrom`) and CMs (otherrefnum / SHOPCM-), accepts #5627's tax-write-off pattern, keeps this Progress section across regenerations. Regenerated 2026-08-22T19:40Z: **1,669 / 1,672 properly recorded; 3 left = Group E** (#5734, #6234, #6773 — manual-gateway/100%-discount orders paid into 101321 Undeposited Funds; bookkeeper facts pending).

## THE LIST — 3 orders needing action

- #5734 · 2026-01-22 · ? · Shopify $0.00
  NS: invoice INVUS15486 $150.00; payments: PUS15340 $150.00 → 101321
  WRONG: cash recorded $150.00 vs Shopify charged $0.00 (Δ $150.00); net revenue booked $150.00 vs Shopify net $0.00 (Δ $150.00)
  Bookkeeper: not bank-matched in NS
- #6234 · 2026-04-13 · manual · Shopify $210.00
  NS: invoice INVUS16073 $105.00; payments: PUS15932 $105.00 → 101321
  WRONG: cash recorded $105.00 vs Shopify charged $210.00 (Δ $-105.00); net revenue booked $105.00 vs Shopify net $210.00 (Δ $-105.00)
  Bookkeeper: not bank-matched in NS
- #6773 · 2026-06-16 · manual · Shopify $150.00
  NS: invoice INVUS16631 $200.00; payments: PUS16488 $200.00 → 101321
  WRONG: cash recorded $200.00 vs Shopify charged $150.00 (Δ $50.00); net revenue booked $200.00 vs Shopify net $150.00 (Δ $50.00)
  Bookkeeper: not bank-matched in NS

## Presentation only — 7 orders (net correct; NetScore overstated the invoice and the bookkeeper wrote the difference off at payment). No action unless the CPA wants gross sales to match Shopify.

- #5621 · 2026-01-03 · Affirm · Shopify $488.90 — invoice $533.90 with $45.00 written off at payment (net correct)
- #5851 · 2026-02-12 · shopify_payments · Shopify $166.90 — invoice $194.90 with $28.00 written off at payment (net correct)
- #5995 · 2026-03-08 · shopify_payments · Shopify $219.00 — invoice $274.00 with $55.00 written off at payment (net correct)
- #6256 · 2026-04-17 · paypal · Shopify $585.24 — invoice $617.24 with $32.00 written off at payment (net correct)
- #6402 · 2026-05-06 · shopify_payments · Shopify $406.90 — invoice $524.90 with $118.00 written off at payment (net correct)
- #6585 · 2026-05-26 · shopify_payments · Shopify $391.90 — invoice $524.90 with $133.00 written off at payment (net correct)
- #6753 · 2026-06-12 · shopify_payments · Shopify $151.00 — invoice $302.00 with $151.00 written off at payment (net correct)
