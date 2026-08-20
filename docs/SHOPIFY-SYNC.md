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
- Fixtures: `tests/fixtures/shopify/raw/` (gitignored, real PII; 14 order
  archetypes incl. split-tender, both refund kinds, draft, POS #1012,
  NL VAT) + redacted committed copies in `tests/fixtures/shopify/`.
- **Payout facts (captured 2026-08-18)**: weekly Monday payouts arrive as
  TWO deposits — main week batch (00:00:00Z) + a small late-settling
  charges batch (03:59:59Z; plain charges from older orders, NOT
  Shop-related). **Negative payouts are real** (−$29.90 on 2026-08-12,
  −$125.00 on 2026-08-06: refund-only days → Shopify withdraws from the
  bank). Balance-transaction types seen: CHARGE, REFUND, TRANSFER,
  DISPUTE_WITHDRAWAL, DISPUTE_REVERSAL, SHOP_CASH_CREDIT,
  TAX_ADJUSTMENT_DEBIT (= Shop-remitted marketplace tax deduction,
  confirming the channelLiable design). Invariant: a payout's balance
  txns include its TRANSFER (= −net), so composition sums exactly to net
  — used as a validation gate. API traps: payouts list is oldest-first
  (need reverse:true) and the `payout_id:` query filter is silently
  ignored → group balance txns locally by associatedPayout.
- Scopes added 2026-08-18 (app version 3): read_shopify_payments_accounts,
  read_shopify_payments_disputes. Scope additions require accepting the
  update in the store admin, then a token re-exchange.

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

## Data model (Supabase, staging first) — ☑ 2026-08-17

- `shopify_sync_config` — mode, cursor timestamps per loop, feature gates.
- `shopify_order_sync` — one row per Shopify order: shopify ids (order,
  customer, company), state, ns record ids (customer/so/invoice/payment[]/
  if[]/cm[]), money snapshot, error info, timestamps. UNIQUE(shopify_order_id).
- `shopify_sync_events` — append-only audit log per order/loop.
- `shopify_payout_sync` — one row per payout: composition, ns journal id,
  state.
- `shopify_error_queue` — view over error-state rows feeding admin UI +
  daily digest email.

## Accounting decisions (owner, 2026-08-17)

- **US sales tax: not collected by us** (below nexus; Avalara+NS nexus
  later). The 2 US-taxed orders in 90d are **Shop-app marketplace orders**
  (`channelLiable: true` on every tax line): Shopify collects AND remits;
  the money passes through and is deducted from the payout. Not our
  liability to a government — but it must be booked to a "marketplace tax
  (Shop-remitted)" pass-through cleared by the payout, never revenue.
- **International tax (EU VAT / CA / CH etc.)**: `channelLiable: null` →
  merchant-liable. We collect and pass to the courier (DDP). ~$1,650/90d.
  Books to a "duties & taxes pass-through (courier)" liability, cleared by
  courier vendor bills. Never revenue. (NetScore books this to **410000
  Sales revenue** via a "Shopify Tax Item" Service-for-Sale item —
  overstating revenue by all VAT ever collected; reclass JE is a
  post-cutover CPA item.) NS account numbers: **TBD**.
- **Tax line rule (implemented in core)**: every PlanTaxLine carries
  `channelLiable`; the engine maps true → marketplace pass-through,
  false → courier pass-through. Fixture proof: #7201 (Shop, true) vs
  #6582 (NL VAT, false), test-asserted.
- **Clearing accounts** (existing): `100501` Shopify — QIQI INC (USD)
  [Shopify Payments + Shop Pay + Shop Cash all land here], `100503`
  Affirm, `100504` PayPal.
- **Split tender**: recorded per transaction, but both legs of a
  shop_cash+shopify_payments split post to 100501 — matches payout math.
- **Processing fee expense accounts**: `622070` Shopify, `622060` PayPal,
  `710130` Affirm. (`622030` is the Shopify platform license — monthly
  invoice, NOT processing fees; the sync never touches it.)
- **Refunds credit the same clearing account as the original payment.**
- **Restock only when Shopify's refund says restock** (restockType);
  refunds without restock create no NS inventory movement.
- **Chargebacks**: currently unhandled anywhere — we SHOULD handle them;
  post through 100501. Design into Loop E (payouts report disputes).
- **Posting periods: relaxed.** Months close 45–60+ days later. Post with
  original transaction dates; no special period logic needed.
- **EUR-period correction**: owner has no preference → we'll correct in
  the current open period (simplest, auditable).
- **Payout booking (CFO, 2026-08-18)** — current manual flow: bookkeeper
  downloads Shopify transactions monthly → NS Banking Import into 100501
  (same per PayPal/Affirm) → manual Match Bank Data against payments →
  bank deposits matched against 100501, difference = fees → fees journal.
  CFO's ideal (= HUB's Amazon FBA pattern): **Vendor Bill to vendor
  "Shopify" for fees (622070) + payment journal against 100501.**
  Loop E implements exactly that, PER PAYOUT (not monthly — each bank
  deposit reconciles against a self-contained record set; monthly
  consolidation stays available as a config flag). Loop A's per-order
  payments + refunds make the ledger mirror Shopify, obsoleting the
  transaction-upload-and-match steps; Loop D is the automated check.
  OPEN with CFO: optional per-payout net journal 100501 → "payouts in
  transit" for 1:1 bank matching. PayPal/Affirm keep the manual flow in
  v1 (~7% of volume), automated later.

## Open questions

**Accounting (small, non-blocking for build):**
1. NS account for the international VAT/duty pass-through (courier
   payable). Also: which NS item/line type carries it on the invoice.
2. CFO option: per-payout net journal to a "payouts in transit" account
   for 1:1 bank matching (see payout booking decision above).
3. Amount-only refunds (no line items): which item/account takes the
   credit.
4. Chargeback flow specifics once Loop E surfaces disputes.

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
- ☑ **Phase 1 — core transforms** (2026-08-17): `lib/shopify/core/`
  (money/validate/customerMatch/orderTransform), 23 Vitest tests over 13
  redacted fixtures. Facts encoded: `discountedTotalSet` excludes
  order-level code discounts (net = originalTotal − allocations); refunds
  never mutate as-sold line data (plan lines AS-SOLD, totals CURRENT);
  POS #1012 is a SKU-less custom item (gate errors it, correctly).
- ◐ **Phase 2 — engine + state**: 2a DONE 2026-08-17 (migration applied to
  staging; L1 client w/ 24h token auto-refresh; cursor poller with 10-min
  overlap, mode-aware; cron */15; live shadow run: 42/42 real orders clean).
  2b BUILT 2026-08-18 (pipeline + backfill runner, 10 tests): ensure-steps
  Customer→SO→Invoice→Payment(s), externalid namespaces SHOP-*/SHOPORD-/
  SHOPINV-/SHOPPAY- (ours; NetScore never used externalid), NetScore-stamp
  adoption with our-stamp write-back, preflight gates (gateway account,
  tax items, SKUs) so no partial chains, split-tender payments, tax lines
  as items per channelLiable. Backfill: `scripts/shopify/backfill.ts
  --from --to [--dry-run]` — SANDBOX-ONLY by construction, idempotent.
  DECISION (CFO delegated 2026-08-18): Loop E net journal posts DIRECT TO
  BANK GL (no transit account) — register entry pre-exists the bank feed
  and auto-matches; bank account internal id needed from bookkeeper.
  TESTING (owner 2026-08-18): use the CURRENT stale sandbox (Apr-2025
  refresh, license renewal in progress) — new orders exercise the create
  path; owner will drive date-range tests, native-B2B era = June 2026+.
  FIRST LIVE SANDBOX RUN 2026-08-18: 22/24 orders (Aug 10–12) synced
  end-to-end (Customer→SO→Invoice→Payment); re-run adopted all with zero
  creates; NetScore-era customers matched + reused. Account rules
  encoded: shop_cust_id + shopify_order_id custbodies are Integer;
  customers need Category+Class (B2B 4/3, B2C 10/4); shipped SOs need
  shipMethod 1171. Parked by design: #7201 until marketplace tax item
  exists. Sandbox creds live in .env.local (NETSUITE_SB_*, disposable).
  TAX REPRESENTATION SETTLED 2026-08-18: NS forbids charge items on
  Sales Orders (owner-confirmed; REST additionally accepts ONLY inventory
  items on SO lines in this account — Service items included, unlike
  UI/SuiteScript). Solution: SO = products + shipping; the INVOICE (legal
  doc) carries the exact per-jurisdiction tax lines — extra item lines in
  the SO→invoice transform body APPEND to the SO's lines (verified). Items
  1432 (DDP → 240504) / 1433 (marketplace → 240502), OthCharge-for-Sale,
  invoice-only, with a 0 base price (items without price rows are
  REST-unorderable). 23/24 synced incl. #7201 (split tender + 2 NY tax
  lines, 2 payments). Customer creates: terms 8 Upfront, sales rep
  "Shopify" (sandbox 126620), address book from order. Native NS
  Sales Tax Items / Nexus setup deferred until US nexus registration
  (Avalara path).
  LOOP B LIVE IN SANDBOX 2026-08-18: `engine/fulfill.ts` — one IF per
  Shopify fulfillment (SHOPFUL-<id>), transform from SO with orderLine
  mapping, location 31 (sandbox 3PL "Packable"; re-verify prod at
  cutover), FEFO lot assignment (expiration NULLS LAST, then lowest lot
  number — this account leaves expirationdate empty; lot numbers encode
  production order), multi-lot spanning, loud error on insufficient
  stock. First run: 20/20 IFs where stock existed; 2 stale-sandbox
  stock-outs errored correctly; re-run = 0 new (idempotent).
  `scripts/shopify/backfill-fulfillments.ts --from --to`.
  LOOP C LIVE IN SANDBOX 2026-08-18: `engine/refund.ts` — per refund:
  Credit Memo SHOPCM-<refundId> (standalone, location required) →
  Customer Refund SHOPRFD-<txnId> transformed from the CM, account =
  same gateway clearing as the payment (owner rule). "Shopify Refund
  Adjustment" item (sandbox 1534, OthCharge → 410000; CPA may re-point;
  resolves CPA question #3): carries refunded product amounts (SKU in
  description) when inventory must NOT move (unfulfilled cancels,
  no-restock refunds), refunded shipping, and amount-only residuals.
  Tax reversal on the order's pass-through item. NS rule learned: an
  inventory item on a CM FORCES lot-level restock — so physical returns
  (restock=true on a fulfilled order) PARK until v2's lot-receipt
  design. #7083 (cancel) + #7084 (amount-only) both booked + idempotent.
  POLLER WIRED 2026-08-18: `engine/execute.ts` chains A→B→C per order;
  poll modes: shadow = plan only, sandbox/live = execute (hard error if
  no executor — no silent no-write). Live local run (3h window): 6/6 —
  2 new orders booked to payment, 4 ShipHero-shipped orders got full
  chain + IF in one pass. Steady-state 15-min cron handles 2–5 orders
  (~30s/order NS REST); shopify-poll maxDuration 300. Initial-cursor
  backfills stay script-driven (the 24h default window with ~40 updated
  orders exceeds one cron slot — fine, cursor advances incrementally).
  LOOP E LIVE IN SANDBOX 2026-08-19: `engine/payouts.ts` + `payoutFetch.ts`
  — per PAID payout: fee Vendor Bill SHOPPO-FEE-<id> (vendor Shopify Inc.
  69810, expense 622070/1859, tranId mandatory) + vendorPayment from
  100501 + net journal SHOPPO-NET-<id> (debit bank 100101/938 — owner
  2026-08-19 — credit 100501, plus marketplace-tax leg 240502 clearing
  Shop-remitted deductions; negative payouts reverse the bank leg).
  Dispute payouts PARK until chargebackAccountId is configured (CPA).
  Live run: 5/6 booked incl. both negative payouts + the Monday pair;
  1 parked (disputes, by design); idempotent. Charge-window paging needs
  14d slack before oldest payout (weekly charges predate issue date).
  Payout state table: migration 20260819100000 (applied to staging).
  DASHBOARD LIVE 2026-08-19: /admin/shopify (nav: Shopify → Shopify
  Sync, permission 'netsuite') — status strip (mode/last poll/synced/
  errors), self-service error queue (plain-language guidance per error
  code + always-safe Retry via POST /api/shopify/sync/retry), recent
  orders with per-target NS deep links (SO/Invoice/IF/CM/Customer),
  payouts table (fee bill + journal links; negative nets highlighted).
  Overview API: /api/shopify/sync/overview. Payout backfill persists to
  shopify_payout_sync. Staging Supabase API keys in .env.local
  (STAGING_SUPABASE_*); `run-poll-staging.ts` = persistent poll (real
  Shopify → NS sandbox → staging DB). VERCEL PREVIEW ENV still needed
  for on-deploy polling/retry: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET, NETSUITE_SB_ACCOUNT_ID/_CONSUMER_KEY/
  _CONSUMER_SECRET/_TOKEN_ID/_TOKEN_SECRET (+ NEXT_PUBLIC_NETSUITE_
  ACCOUNT_ID for NS links).
  NEXT: Loop D nightly recon → shadow mode. Loops A/B/C/E + dashboard
  all live in sandbox.
- ☐ **Phase 3 — Loops B & C** (sandbox): IFs (lot rule), credit memos
  (line-level, tax-reversing, amount-only, restock flag).
- ☐ **Phase 4 — Loops D & E**: nightly recon, price variance, payout
  booking (needs CPA answers), admin dashboard + error queue + alerts.
- ☐ **Phase 5 — shadow mode** (1–2 weeks): compute everything against
  prod expectations, diff vs NetScore's live output daily.
- ☐ **Phase 6 — cutover**: runbook below.

## Owner requirements (2026-08-18)

1. **Cross-Subsidiary Fulfillment is MANDATORY in production.** Qiqi INC
   has no physical warehouse (Amazon only); all Shopify fulfillment ships
   from Qiqi Global's 3PL (BrandFox). Prod SOs need the Allow
   Cross-Subsidiary Fulfillment checkbox + line-level Inventory Location =
   BrandFox (auto-sets Inventory Subsidiary = Qiqi Global). Mirror the
   HUB's proven cross-sub SO push (line `inventorylocation`). Sandbox
   (Apr-2025 copy) predates this: Packable sat under Qiqi INC, so
   same-sub works there. Plan: `crossSubsidiaryFulfillment` config flag —
   false in sandbox, TRUE in prod with BrandFox ids; copy exact prod
   location ids from NetScore's live SOs during shadow mode. HARD GATE on
   the cutover checklist.
2. **Admin dashboard** at /admin/shopify (qq components): status strip
   (mode, last poll, synced today/week, error count), recent-orders table
   with per-order chain state + NS record links, payouts view (Loop E).
3. **Self-service error queue — BUILT 2026-08-20**: per-error guided
   actions on the dashboard, all no-code, all idempotent-safe:
   Retry (re-fetches fresh from Shopify — doubles as "recheck");
   AMBIGUOUS_CUSTOMER → candidate buttons ("Use C1921 (#7179)") that
   stamp the chosen NS customer + retry (permanent match);
   UNKNOWN_SKU → inline "map to NS item code/id" → permanent alias in
   shopify_sku_aliases + retry (each SKU fixed exactly once, poller
   honors aliases too); Ignore-with-note → auditable terminal 'ignored'
   state (excluded from error counter, never deleted, Retry un-ignores);
   "Import order #" box (the NetScore lost-order cure). Shared engine:
   lib/shopify/engine/retryOrder.ts. Alerts (lib/shopify/alerts.ts):
   ~daily digest email when errors exist + throttled immediate mail on
   poll failure — env SHOPIFY_SYNC_ALERT_EMAIL (add to prod env list).
   Migration 20260820100000 (applied to staging).
4. **Settings page (post-production, LAST task)**: lift ENGINE_CONFIG
   into a config table + admin UI (locations, tax items, terms, rep,
   gateway map). Aligns with the productization directive; ENGINE_CONFIG
   is already the single isolated home of every such value.

## Import duties (QA find 2026-08-19, order #7268)

DDP orders carry import duties in `currentTotalDutiesSet` — SEPARATE
from tax (the exact NetScore drop-a-duty bug from the brief; the gate
refused to book #7268 rather than mis-book it, then support was added).
Duties become an "Import Duties" merchant-liable line → DDP pass-through
item → 240504, and join the totals equation (subtotal+tax+shipping+
duties=total). Second find on the same order: NS converts a flat SO
header discount to a PERCENTAGE on invoice transform and re-applies it
to appended tax/duty lines — fixed by re-asserting the flat discount in
the transform body. Fixture: intl-duties-ca (100%-off promo + $138
discount + CA 13% tax + $13 duties books exactly).

## Backfill boundary (discovered 2026-08-19)

The legacy "Pro Discount" workaround (retail price − 50% simulating
wholesale) last appears on **2026-07-15** (#6999); zero occurrences in
271 orders since. Under the current representation (gross lines + header
discount → 420000) those legacy orders would inflate both Sales and
Sales Discounts with what was economically wholesale pricing.
**Earliest safe backfill date: 2026-07-16.** History before that stays
NetScore's records (as the cutover design always intended).

## PRODUCTION MIGRATION PLAN (agreed 2026-08-20 — next session executes)

Sandbox QA COMPLETE. Owner-verified: orders (simple/B2B/B2C), discounts
(single/stacked/automatic/100%-off → 420000), Custom price level + rates,
intl VAT (DE), intl duties (CA #7268), Shop marketplace tax + split
tender (#7201), refunds (#7083/#7084), fulfillments w/ FEFO lots,
payouts (journal JEUS12053 walked through by owner incl. 240502 leg),
terms fix (#7240), error tools. 230 tests green.

### Build remaining (in order, BEFORE any prod write)
1. **CSF support** — hard gate. `crossSubsidiaryFulfillment` config flag:
   SO header checkbox + line-level `inventorylocation` (BrandFox, under
   Qiqi Global) mirroring lib/netsuite.ts pushOrderToNetSuite's cross-sub
   mode (lines ~470-520). Copy exact prod location ids from NetScore's
   live SOs (SELECT location off recent SalesOrd w/ custbody_shopify_order_id).
   Sandbox cannot test CSF-era data (Packable was same-sub) — verify via
   prod probes + first live orders.
2. **Loop D reconciliation** — nightly cron: every Shopify order of the
   day vs shopify_order_sync + NS (by externalid), invoice total ==
   Shopify total to the cent, missing orders → error queue cards.
   Also the completeness check vs NetScore-era (post-cutover only).
3. **Prod setup script** (scripts/shopify/setup-production.ts, mirrors
   sandbox scripts): verify/re-point items + create where missing:
   tax items (DDP + marketplace, base price 0, sub 11 + includeChildren),
   "Shopify Refund Adjustment" (→410000), "Shopify Discount" re-point to
   466/420000 (prod item may also be non-posting!), "Shopify" sales rep,
   verify ids: terms 8, shipMethod 1171, vendor "Shopify Inc.", accounts
   1019/1021/1026/938/1859/466/240502/240504, customer category/class,
   BrandFox location. Output = the prod ENGINE_CONFIG values (they may
   differ from sandbox ids for records created post-Apr-2025!).

### Owner actions for migration
1. Prod Supabase SQL (owner-run, per convention): migrations
   20260817220000, 20260819100000, 20260820100000. Mode defaults 'off' —
   inert until cutover.
2. Vercel PRODUCTION env: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID,
   SHOPIFY_CLIENT_SECRET, SHOPIFY_SYNC_ALERT_EMAIL (NETSUITE_* prod vars
   already exist). ROTATE the Shopify client secret first (it passed
   through chat 2026-08-17) and use the new value.
3. Promote staging → main (all sync code ships to prod HUB; cron starts
   polling but mode='off' = no-op).
4. Confirm prod accounts 240502/240504 zero-history → rename like
   sandbox (CPA nod on names).
5. CPA: chargeback account (dispute payouts park until then — acceptable).
6. NetScore inventory (STILL PENDING): screenshots of Installed Bundles,
   their Scripts+deployments, Manage Integrations record; contract
   renewal/notice dates.

### Cutover sequence (after builds + shadow window)
1. Shadow: mode='shadow' in PROD (computes+persists, zero NS writes) —
   compressed ~5 clean days; compare our plans vs NetScore's records
   daily (Loop D in read-only compare mode).
2. Cutover day: note cursor T → deactivate ALL NetScore script
   deployments (NOT uninstall) → delete their legacy Shopify custom app
   (kills token) → set mode='live' (cursor=T) → watch dashboard.
3. Payout loop: enable after first Monday payout; verify JEUS journal +
   fee bill against bank line.
4. 30 clean days of Loop D → stamp-migration job (copy
   custentity_shop_cust_id + custbody_shopify_order_id data to OUR
   fields — BEFORE bundle uninstall, uninstall can delete field data) →
   uninstall NetScore bundle → revoke their NS tokens + delete their
   0-install dev-dashboard app → cancel contract.
5. Rollback during window: reactivate their deployments + recreate their
   Shopify app token; set mode='shadow'.

### Post-production queue (unchanged)
Restock v2 (lot-level returns), settings page (lift ENGINE_CONFIG to
table + admin UI — LAST task), PayPal/Affirm payout automation,
historical cleanup (56 dup email groups, EUR-period orders, NetScore's
410000 VAT reclass — CPA), backfill boundary 2026-07-16.

## Cutover / decommission runbook

1. Pre: stamp-migration job run + verified (Q11). Shadow diffs clean
   2 weeks. CPA sign-off on tax + payout mapping.
2. Freeze: note cursor timestamp T.
3. NetSuite: set every NetScore script deployment **inactive** (do NOT
   uninstall the bundle). VERIFY cross-subsidiary fulfillment config
   (BrandFox location ids, CSF flag) against NetScore's last live SOs.
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
