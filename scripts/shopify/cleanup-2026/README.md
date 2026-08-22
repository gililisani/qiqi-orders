# 2026 Shopify ↔ NetSuite clean-up scripts (2026-08-22)

Context: docs/AUDIT-2026-CLEAN-LIST.md (the list) + docs/SHOPIFY-SYNC.md
"Correction rules learned". All 2026 periods are OPEN → fixes go IN PLACE
on original dates. Run from repo root with
`NODE_PATH=$PWD/node_modules SHOPIFY_ADMIN_TOKEN= npx tsx scripts/shopify/cleanup-2026/<script> [order numbers]`.
Every script writes to PRODUCTION NetSuite — owner approval per group.

- `clean-list.ts` — regenerates docs/AUDIT-2026-CLEAN-LIST.md from scratch
  (Shopify truth vs NS via NetScore stamps + our rows + PDF-RESTlet link
  lookup). Read-only.
- `relocate-fulfill.ts <orders>` — Group A: relocate NetScore SO lines
  Packable(31)→BrandFox(46), then book the IF on the original ship date.
- `fix-reprice.ts <orders>` — Group B re-pricing: product lines → Shopify
  unit prices (Custom level), header discount → Shopify total, payment →
  charged. NOTE: patches discount via item line ONLY when NS has a discount
  LINE; for header discounts use fix-header-discount.ts semantics.
- `fix-header-discount.ts` — repairs the double-discount state (zero the
  stray line, set header discountRate), then payment.
- `fix-duties.ts` — Group B portion 3: append "Import Duties" line (item
  1464 → 240504), re-assert flat header discount, payment → charged.
- `fix-wholesale-6760.ts` — Pro-Discount era rule (b): lines at net
  wholesale (original − allocation), no discount line, VAT line → 1464.
- `payments-probe.ts` — payment/cleared/write-off facts per order.
- `fix-refund-restructure.ts [--apply] <orders>` — Group C: netted refunds →
  invoice/payment at charged, CM on 1565 dated the Shopify refund, Customer
  Refund from the gateway clearing account; unbilled cancelled SO lines are
  billed on a second invoice transformed from the SO (never added to the
  existing invoice — that moves stock) and then closed. Dry-run by default;
  GL read-back (410000 / clearing / AR) after each order.
- `probe-refunds.ts <orders>` — read-only: Shopify refund facts (line items,
  restock type, gateway txn ids) + the full NS chain (SO/invoice/payment/IF/
  CM/refund with lines and GL) per order. Used to scope Groups C/D/E.
