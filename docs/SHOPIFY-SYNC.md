# Shopify → NetSuite Sync — Living Spec

Replaces NetScore ($2k/yr, failing: 7,321 dup customers, re-pricing, tax
collapsing, silent failures, missing orders, no payout reconciliation).
The sync lives in the HUB as an isolated worker layer. NetScore stays live
until cutover; we build against NS **sandbox** while reading the
**production** Shopify store.

Status legend: ☐ planned ◐ in progress ☑ done

## Principles (agreed 2026-08-17)

1. **Shopify is the source of truth for money.** Record actual line prices,
   discounts, every distinct tax line, shipping. Never re-price from NS
   price lists. A separate nightly job flags charged-vs-catalog variances.
2. **Idempotency everywhere.** Every NS record keyed to a Shopify ID.
   Re-running any sync over any range must never duplicate anything.
   There is no "create", only "ensure" (look up by key → adopt or create).
3. **Validation gates + loud failure.** Non-USD, unknown SKU, totals that
   don't add to the cent, ambiguous customer match → error state, same-day
   alert, visible queue. Never silently guess.
4. **State machine per order**, persisted, with admin view:
   `pending → so_created → invoiced → paid → fulfilled → closed`
   (+ `error`, `refunded`, `cancelled`).
5. **Customer matching ladder**: B2B → Shopify Company ID; B2C → Shopify
   Customer ID; normalized email fallback; create as last resort, always
   stamping the Shopify ID. Adopt NetScore's existing stamps (see findings).
6. **Polling with a cursor** (~15 min), not webhooks; nightly
   reconciliation of the full day, by Shopify order ID, to the cent.
7. **Loops**: A orders→customer+SO+Invoice+Payment · B fulfillments→IF ·
   C refunds/cancels/edits→CM/closes · D nightly recon + price variance ·
   E payout reconciliation (Shopify Payments first; PayPal/Affirm clearing
   accounts from day one, automation later).
8. **Rollout**: sandbox-live → shadow (compute, write nothing, diff vs
   NetScore) → cutover (deactivate their scripts, revoke token, enable
   writes from cursor) → 30 clean days → uninstall + cancel.

## Architecture

Four layers, dependencies point downward only. All NS writes go through
the engine; the core is pure and fixture-tested.

```
lib/shopify/
├── client.ts        L1 TRANSPORT  GraphQL client: auth (24h client-credentials
│                                  token, auto-refresh), throttle, pagination
├── core/            L2 PURE       orderTransform / refundTransform /
│                                  payoutTransform / customerMatch / validate
├── engine/          L3 ENGINE     pipeline (ensure-steps) / poll (cursor) /
│                                  reconcile / payouts — sole NS writer
├── store.ts         L4 STATE      repositories over shopify_* tables
└── alerts.ts                      error queue + Graph email + Sentry
app/api/cron/shopify-*             thin entries (CRON_SECRET auth)
app/admin/shopify/*                dashboard, error queue, recon (qq/*)
```

**Mode switch** (`shopify_sync_config.mode`): `sandbox` (read prod Shopify,
write NS sandbox — build phase) → `shadow` (write nothing, diff vs
NetScore's prod output) → `live`. NS credentials resolve per mode
(`NETSUITE_SB_*` vs `NETSUITE_*`) so sandbox and prod are never confusable.

## Store facts (measured 2026-08-17, read-only)

- Shopify Plus, USD, America/New_York. `qiqi-pro.myshopify.com`.
- Volume: **~8 orders/day** (236/30d, 716/90d, 2,512/365d). 6,238 orders,
  4,513 companies, 10k+ customers all-time.
- Refunds: 39 orders with refunds in last 365d (~3/mo). CustCred in NS
  last 30d: 9.
- Gateways (sample 120): shopify_payments 112, paypal 6, Affirm 3,
  **shop_cash 1**. POS: 1 order all-time. Gift cards: none.
- Buyer mix (sample 120): 89 B2B (PurchasingCompany) / 31 B2C.
- Ship-to: overwhelmingly US; occasional CA/DE.
- Tax shapes: most orders 0 tax lines; multi-line tax occurs
  **domestically** (#7201: NY state 4% + Onondaga county 4%).
- Draft orders exist (`source_name:shopify_draft_order`, 5/120) — same
  pipeline, they arrive as normal paid orders.
- **Split tender is real**: #7201 = shop_cash $1.41 + shopify_payments
  $45.79. Payment recording must handle N transactions per order.
- **Amount-only refunds are real**: #7084 refund has zero refundLineItems.
- **Per-transaction processing fees are exposed** (amount, rate, rateName)
  on shopify_payments transactions — feeds Loop E precisely.
- Fixtures: `tests/fixtures/shopify/raw/` (gitignored, real PII; 13
  archetypes incl. split-tender, both refund kinds, draft, POS #1012).

## NetSuite facts (surveyed 2026-08-17, read-only SuiteQL)

- Customer stamp field: **`custentity_shop_cust_id`** (Shopify Customer
  numeric id). Coverage: **6,717 of 7,324** customers stamped (91.7%).
- Order key field: **`custbody_shopify_order_id`** on SO/Invoice/IF/CM.
  NetScore does **not** use `externalid` anywhere.
- Related fields seen: `custbody_export_to_shopify`,
  `custbody_pending_shopify_fulfillment`, `custbody_shopify_order_cancelled`,
  `custbody_refund_to_shopify`.
- Chain for #7201 (sid 7516567535671): SalesOrd SOUS17076 + CustInvc
  INVUS17082 + ItemShip IF18148, same-day. Invoice "Paid In Full" but
  **no CustPymt is stamped with the order id** and payment→invoice links
  are SuiteQL-invisible in this account (known quirk) — the payment
  mechanism must be confirmed via REST during shadow mode.
- 30d NetScore volume: 235 SalesOrd / 235 CustInvc / 227 ItemShip /
  9 CustCred / 0 stamped CustPymt.
- No B2B company-id stamp field observed yet — B2B matching may rely on
  their customer-id stamp on the contact; confirm against a B2B chain.

## Data model (Supabase, staging first) — ☐

- `shopify_sync_config` — mode, cursor timestamps per loop, feature gates.
- `shopify_order_sync` — one row per Shopify order: shopify ids (order,
  customer, company), state, ns record ids (customer/so/invoice/payment[]/
  if[]/cm[]), money snapshot, error info, timestamps. UNIQUE(shopify_order_id).
- `shopify_sync_events` — append-only audit log per order/loop.
- `shopify_payout_sync` — one row per payout: composition, ns journal id,
  state.
- `shopify_error_queue` — view over error-state rows feeding admin UI +
  daily digest email.

## Open questions

**CPA (blocking Loop A tax + Loop E booking):**
1. NS-side mapping for multi-line taxes/duties (per-jurisdiction items vs
   tax groups; intl VAT/duty lines).
2. Clearing account structure: Shopify Payments / PayPal / Affirm /
   Shop Cash (+ cash for future POS).
3. Payout booking record: Deposit vs Journal; fee expense account.
4. Posting-period rule for late-synced orders crossing month boundaries.

**Ops:**
5. Lot assignment for IFs: FEFO auto-assign pending confirmation ShipHero
   ships oldest-first.
6. Refund restock: do returns physically flow back through ShipHero, and
   should restock refunds create item receipts?
7. `read_locations` scope not granted (fulfillment/POS location mapping
   blocked on it) — add at next app-config touch.
8. Shopify search filters `shipping_address_country_code:*` and
   `-currency:USD` are silently invalid → find intl orders by scan;
   currency validated per-order in the gate (per incident, non-USD must
   hard-error anyway).

**Historical cleanup (post-cutover jobs):**
9. Duplicate customer merge (56 email groups, worst salon 455 records).
10. EUR-period order correction.
11. Stamp migration: copy `custentity_shop_cust_id` +
    `custbody_shopify_order_id` values into our own fields **before**
    uninstalling NetScore's bundle (bundle uninstall can delete its
    fields + data).

## Phase plan

- ☑ **Phase 0 — access + discovery** (2026-08-17): custom app (read-only
  scopes), token exchange script, smoke test, store measurement, 13
  fixtures, NS survey. Scripts in `scripts/shopify/`.
- ☐ **Phase 1 — core transforms** (pure, fixture-tested): validate,
  customerMatch, orderTransform incl. split tender + multi-tax; Vitest.
- ☐ **Phase 2 — engine + state** (sandbox mode): migrations, ensure-steps,
  poll cursor, Loop A end-to-end against NS sandbox with real orders.
- ☐ **Phase 3 — Loops B & C** (sandbox): IFs (lot rule), credit memos
  (line-level, tax-reversing, amount-only, restock flag).
- ☐ **Phase 4 — Loops D & E**: nightly recon, price variance, payout
  booking (needs CPA answers), admin dashboard + error queue + alerts.
- ☐ **Phase 5 — shadow mode** (1–2 weeks): compute everything against
  prod expectations, diff vs NetScore's live output daily.
- ☐ **Phase 6 — cutover**: runbook below.

## Cutover / decommission runbook

1. Pre: stamp-migration job run + verified (Q11). Shadow diffs clean
   2 weeks. CPA sign-off on tax + payout mapping.
2. Freeze: note cursor timestamp T.
3. NetSuite: set every NetScore script deployment **inactive** (do NOT
   uninstall the bundle).
4. Shopify: delete NetScore's legacy custom app (Develop apps) — kills
   their token. (Their 0-install dev-dashboard app "NetScore TEchnologies
   2025-10" is inert; delete anytime.)
5. HUB: flip mode to `live`, cursor = T. Watch error queue.
6. Nightly recon green 30 days → uninstall NetScore bundle, revoke their
   NS integration tokens, cancel contract.
7. Rollback path during window: reactivate their deployments, recreate
   app token, set mode back to `shadow`.

## Decision log

- 2026-08-17 — HUB-side worker over SuiteScript (dev/test/visibility/
  reuse; NS is the ledger, not the compute platform).
- 2026-08-17 — Dev-dashboard custom app w/ 24h client-credential tokens,
  re-derived on demand (no eternal secret). `scripts/shopify/exchange-token.ts`.
- 2026-08-17 — Fixtures with real PII stay gitignored; committed test
  fixtures must be redacted copies.
