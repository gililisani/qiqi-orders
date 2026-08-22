# Shopify → NetSuite Sync — Living Spec

Replaces NetScore ($2k/yr, failing: 7,321 dup customers, re-pricing, tax
collapsing, silent failures, missing orders, no payout reconciliation).
The sync lives in the HUB as an isolated worker layer. NetScore stays live
until cutover; we build against NS **sandbox** while reading the
**production** Shopify store.

Status legend: ☐ planned ◐ in progress ☑ done

## MIGRATION CHECKLIST (maintained — the single source for "what's next")

The agent maintains this list and hands the owner ONE step at a time.
Steps marked (agent) are run by the agent; the rest are owner actions.

**Pre-cutover (safe any day — nothing goes live):**
 1. ☑ Create the 3 NS items — setup-production.ts --apply (2026-08-20:
    DDP 1464, Marketplace 1564, Refund Adjustment 1565)
 2. ☑ Create "Shopify" sales rep in prod NS UI (2026-08-20: id 190493,
    in config — production config COMPLETE, live mode code-unblocked)
 3. ☑ Prod Supabase SQL (2026-08-20): all 7 tables verified present,
    mode='off', all empty. netscore_* stamps stay empty until the
    snapshot pre-load / cutover step 13 (agent's run blocked by the
    permission gate — owner-approved run or cutover step 13 fills them).
 4. ☑ Shopify client secret rotated (2026-08-20); owner updated
    .env.local directly (secret never re-entered chat). Verified: token
    exchange OK with the new secret, latest order visible.
 5. ☑ Vercel Production env vars set (2026-08-20): SHOPIFY_STORE_DOMAIN,
    SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET (new), SHOPIFY_SYNC_ALERT_
    EMAIL; NEXT_PUBLIC_NETSUITE_ACCOUNT_ID confirmed present.
 6. ☑ Promoted staging → main (2026-08-20, dd21a23, clean fast-forward,
    45 commits all Shopify, promote check clean, 249 tests green). Prod
    crons live but mode='off' = no-op.
 7. ☑ Prod /admin/shopify smoke-checked by owner (2026-08-20): loads,
    mode off, tables empty.
 8. ☑ Chargeback account CREATED (owner's call, 2026-08-20, skipping the
    CPA pre-nod): 622071 "Shopify Chargebacks", Expense, id 2445 — in
    PRODUCTION_ENGINE_CONFIG; dispute payouts now book automatically
    (engine logic pre-existed; parking was the fallback). CPA can still
    review post-hoc; the NetScore 410000-VAT reclass JE stays a
    post-cutover CPA item.
 9. ☑ Accounts renamed in prod NS UI by owner (2026-08-20), verified via
    SuiteQL: 240502 "Marketplace Tax - Shop Remitted", 240504 "Duties &
    Taxes Collected - Pass-through (DDP)".
10. ☑ NetScore contract: owner renewed ~2026-06 for a year; refund not
    expected, owner writes it off. No cancellation urgency — license is
    paid through ~2027-06. ACTION PARKED: owner sets a calendar reminder
    ~2027-04 to send the non-renewal notice. "Cancel contract" in step 18
    becomes "confirm non-renewal notice is scheduled".

**Cutover day — EXECUTED 2026-08-20, T = 22:10 UTC:**
11. ☑ Deployments deactivated (owner, via edit pages — inline editing
    silently fails on Deployed): 44 of 47 off incl. ALL importers.
    3 accepted leftovers, all harmless: NetScore Item Export NS→Shopify
    (dormant + corrupt schedule blocks any save — NS recurrence bug),
    Shopify Item Ids Update (dormant), NetScore License Records Update
    (scheduled, license telemetry only). Bundle uninstall (step 18)
    removes them.
12. ☑ NetScore's Shopify app DELETED (their outbound token dead). NS-side
    finding: NO inbound integration/tokens exist — their connector was
    pure in-account SuiteScript; nothing to revoke (expected).
13. ☑ Stamps re-snapshot → PROD Supabase: 2,211 customers / 18,573
    transactions (+18 vs morning = today's last NetScore orders) / 31
    items.
14. ☑ Discount item 1056 re-pointed to 420000 (was non-posting).
    (Script's "sales rep missing" ✗ is a false negative: it looks for
    externalid SHOP-SALESREP; owner created 190493 manually in the UI.)
15. ☑ mode='live', orders_cursor=2026-08-20T22:10:00Z.
16. ☑ First live poll 23:01 UTC: 6 fetched / 0 errors — all 6 were
    NetScore-era fulfillment updates, correctly SKIPPED by the guard
    (would have been 6 duplicate SOs without it). Boundary recon
    2026-08-18→20: 29 orders, all 29 netscore-era, 0 missing,
    0 mismatched — ALL CLEAN. Cursor advancing. Local-script note:
    stale 24h SHOPIFY_ADMIN_TOKEN in .env.local expired and overrode
    client-credentials → commented out; local scripts now use the
    client-credentials flow like prod. backfill-payouts.ts gained
    --target production --i-am-sure (prod NS + prod dashboard persistence)
    ready for the first Monday payout.
17. ◐ IN PROGRESS: watch the dashboard daily; first NEW order validates
    CSF (BrandFox line inventorylocation) + sales rep 190493 — check its
    SO in NS when it lands. Monday 2026-08-24: agent runs
    `backfill-payouts.ts --count 2 --target production --i-am-sure`,
    then owner matches journal + fee bill against the bank line.
18. ☐ After ~1 clean week (Loop D green): delete the 6 standalone
    NetScore scripts, uninstall bundle 322635, cancel the contract.

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
1. ☑ **CSF support** — DONE 2026-08-20. Prod probes (read-only, scripts/
   shopify/probe-csf-prod{,2}.ts) settled the facts: BrandFox = location
   **46** ("Brandfox Qiqi Global", subsidiary 1); NetScore's live SOs are
   subsidiary 3 with NO header location and line-level
   `inventorylocation: 46` (inventorysubsidiary auto-set) — identical to
   the HUB's proven cross-sub push, no explicit header checkbox via REST;
   their IFs ship with line location 46 (= our fulfill.ts shape already);
   their money-only CustCreds carry NO location; invoices carry none.
   Implementation: `crossSubsidiaryFulfillment` + nullable
   `creditMemoLocationId` config fields; SO product lines get
   `inventorylocation` when on. Config split: ENGINE_CONFIG (sandbox) +
   PRODUCTION_ENGINE_CONFIG (CSF on, fulfillment loc 46, CM loc null,
   PROD-PENDING sentinels for the 4 sandbox-created ids —
   engineConfigForTarget('production') THROWS until setup-production.ts
   output is encoded, so live mode can't start on placeholders). All
   target-aware entry points use engineConfigForTarget; backfill.ts
   gained `--target production --i-am-sure` (full A+B+C chain + prod
   Supabase persistence — the cutover gap-import tool). Bonus fix:
   resolve-customer route no longer touches custentity_shop_cust_id
   (bundle-independence gap). Sandbox can't exercise CSF (same-sub) —
   verify on first live orders.
2. ☑ **Loop D reconciliation** — DONE 2026-08-20. `engine/reconcile.ts` +
   nightly cron /api/cron/shopify-reconcile (08:10 UTC, 48h window,
   maxDuration 300) + `scripts/shopify/reconcile.ts --from --to
   [--target production]` for manual sweeps. Per order: state row must
   exist (else MISSING_ORDER card — the NetScore lost-order cure,
   automated); synced orders verify against NS by externalid TO THE CENT
   (SO+invoice exist, invoice foreigntotal == as-sold total = Σ line
   nets + shipping + tax/duties; every payment/IF/CM exists; each CM
   total == its refund) → RECON_MISMATCH card. Missing-row-but-NS-chain-
   exists → ADOPTS (heals the row, then verifies) — no false alarms
   after DB resets/pre-persistence backfills. Infra failures throw (a
   failed recon never cards healthy orders). First live sandbox run
   (Aug 10–12): 19 adopted clean; CAUGHT REAL DRIFT — #7201's invoice
   carries the pre-fix percentage-discount bug (booked 08-18, fix found
   on #7268 08-19): invoice 46.85 vs charged 47.20, discount 4.55 vs SO
   4.20. Plus 3 stock-out IF gaps + 2 never-booked orders — all correct.
   **CUTOVER-BOUNDARY GUARD (new, critical)**: an order created pre-T
   (booked by NetScore) but updated post-T (fulfillment/refund) would
   have flowed through our pipeline and DUPLICATED their SO — now every
   production execute path (poller, retry, backfill, recon) checks
   netscore_transaction_stamps first: SalesOrd stamp exists → skip as
   NETSCORE_ERA (visible on dashboard; late IF/CM handled manually in
   NS). Sandbox target ignores the guard (QA re-books deliberately).
   REQUIRES: fresh snapshot into PROD Supabase at cutover
   (snapshot-netscore-data.ts --target production --db prod, new flag)
   run AFTER NetScore's scripts die, so last-minute orders carry stamps.
3. ☑ **Prod setup script** — BUILT + VERIFY-RUN CLEAN 2026-08-20
   (scripts/shopify/setup-production.ts). Verify-only by default;
   `--apply` creates the 4 inert records; `--repoint-discount` is a
   SEPARATE cutover-only flag. Facts from the verify run (read-only):
   - Account ids IDENTICAL prod=sandbox, all 9 verified ✓ (100501=1019,
     100503=1026, 100504=1021, 100101=938, 622070=1859, 240502=1573,
     240504=1571, 410000=833, 420000=466).
   - 240502/240504 still carry OLD prod names → owner renames (CPA nod).
     240502 is NOT zero-history: a CLOSED net-zero franchise-tax accrual
     trio (VendBill 38777369 + JEUS12838/9/40, $556=$556). Safe to
     repurpose; CPA should know.
   - Location 46 BrandFox ✓ active sub 1; vendor 69810 ✓ active (prod
     1992 also active, unused by us); terms 8 ✓ (1,674 customers);
     ship item 1171 ✓ (10.7k lines).
   - Prod "Shopify Discount" 1056 confirmed NON-POSTING. **NetScore
     ACTIVELY books through it (527 lines, latest 2026-08-19)** — the
     re-point to 466/420000 CANNOT happen while NetScore runs (it would
     change their live discount posting). Moved to the cutover sequence
     (`--repoint-discount`).
   - Missing (inert, created by `--apply` — blocked by agent permission
     classifier, owner runs it): "Intl Duties & Taxes (DDP)" → 1571,
     "Marketplace Tax (Shop)" → 1573, "Shopify Refund Adjustment" → 833
     (all OthCharge-for-Sale, sub 11 + includeChildren, taxSchedule 1,
     0-price row, externalids SHOP-TAX-DDP/SHOP-TAX-MKT/SHOP-REFUND-ADJ),
     "Shopify" sales-rep employee (SHOP-SALESREP, sub 3).
     The script prints the exact PRODUCTION_ENGINE_CONFIG values to
     paste into lib/shopify/engine/config.ts (replacing PROD-PENDING);
     live mode is code-blocked until that paste lands.

### Owner actions for migration
1. Prod Supabase SQL (owner-run, per convention): migrations
   20260817220000, 20260819100000, 20260820100000, **20260820120000 +
   20260820130000 (netscore snapshot tables — the cutover guard, customer
   ladder and recon adoption all read them)**. Mode defaults 'off' —
   inert until cutover.
1b. ☑ setup-production --apply RUN 2026-08-20: the 3 items live in prod
   (DDP 1464 → 1571, Marketplace 1564 → 1573, Refund Adjustment 1565 →
   833; externalids + sub 11 + 0-price rows verified) and their ids are
   in PRODUCTION_ENGINE_CONFIG. ◐ REMAINING: the "Shopify" sales-rep
   employee — the integration role lacks Lists→Employee Record permission
   (create bounced). Owner creates it in prod NS UI (Lists → Employees →
   New: name "Shopify Channel", ENTITY ID "Shopify", check Sales Rep,
   subsidiary Qiqi INC) and reads the internal id from the record URL
   (…id=NNNN) → agent pastes it as salesRepId (the last PROD-PENDING;
   live mode stays code-blocked until then).
2. Vercel PRODUCTION env: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID,
   SHOPIFY_CLIENT_SECRET, SHOPIFY_SYNC_ALERT_EMAIL (NETSUITE_* prod vars
   already exist). ROTATE the Shopify client secret first (it passed
   through chat 2026-08-17) and use the new value.
3. Promote staging → main (all sync code ships to prod HUB; cron starts
   polling but mode='off' = no-op).
4. Confirm prod accounts 240502/240504 zero-history → rename like
   sandbox (CPA nod on names).
5. CPA: chargeback account (dispute payouts park until then — acceptable).
6. NetScore inventory — SURVEYED 2026-08-20 (BundleContents886.xlsx +
   live SuiteQL probe; see "NetScore footprint" section below).
   Still pending from owner: Manage Integrations record + contract
   renewal/notice dates + the EXPORT-DIRECTION question below.

### NetScore footprint (full survey 2026-08-20)

Bundle 322635 components (from owner's BundleContents886.xlsx export):
- Fields WE care about: custentity_shop_cust_id (customer stamps),
  custbody_shopify_order_id (all their historical transactions),
  custbody_shopify_refund_id / _order_cancelled / _export_to_shopify /
  _refund_to_shopify, custcol_shopify_order_line_item; item-side:
  custitem_shopify_product_id / _variant_id / _item_export_to_shopify etc.
- Custom records: connector setup, payment/location/shipping/items
  mappings, "Shopify Error Record" (their bloody error page — dies
  unmourned), product details. Saved searches ×20, subtabs, center tab.
- 21 bundle scripts + 6 MORE OUTSIDE the bundle (kit-item exports ×2,
  Shopify Item Ids Update, Shopify_allocate_items, NetScore license
  telemetry ×2) → 27 scripts, 47 deployments, 42 isdeployed=T.
  Deactivation checklist = ALL 27 scripts' deployments, not just the
  bundle's 21.

**DECOMMISSION DECISION (2026-08-20): DEACTIVATE, DO NOT UNINSTALL.**
Bundle uninstall deletes its fields AND their data (2+ years of
custbody_shopify_order_id on transactions, 6.7k customer stamps, item
mappings). Keeping the bundle installed with every deployment inactive
costs nothing, keeps all historical data + searchability, and removes
the entire wipe risk. The \$2k/yr is the license contract — cancel it
regardless; dead scripts don't phone home (their license-expiration
script gets deactivated with the rest). Belt-and-braces: snapshot ALL
stamps (customer id ↔ shop_cust_id; transaction id ↔ shopify_order_id)
into Supabase tables before cutover anyway, and add a snapshot-table
rung to the customer ladder so even a future uninstall can't hurt us.

**RESOLVED (owner 2026-08-20): NS→Shopify exports never worked and are
NOT wanted.** Inventory flows ShipHero→Shopify (more accurate than NS);
all products are "continue selling when out of stock"; catalog is
managed in Shopify directly. The export scripts are dead weight —
deactivate with everything else, replace with nothing. Cutover unblocked.
(Original finding, for the record:)
NetScore is BIDIRECTIONAL: NS→Shopify exports for items, prices, images,
inventory, kit/matrix items, product availability, shipment updates —
and the data says they're configured: 31 items carry Shopify product-id
mappings, 23 flagged export-to-shopify (≈ the whole catalog). Our
replacement deliberately covers Shopify→NS only. Owner must answer:
when you change a price/product in NS today, does it flow to Shopify?
Who maintains Shopify product data — NS (via NetScore) or Shopify admin
directly? (Inventory is presumably ShipHero's job.) Outcomes:
(a) exports unused/redundant → nothing to do; (b) used → either manage
the ~31-item catalog manually in Shopify (small, low-churn) or add a
HUB price/item export loop to the post-production queue. Cutover does
NOT proceed until this is answered.

### Cutover sequence — HARD CUTOVER (owner's order, agreed 2026-08-20;
### supersedes the shadow-mode plan — sandbox QA + snapshot + bundle
### independence made shadow redundant)
1. **Stop NetScore**: deactivate ALL 27 scripts' deployments → delete
   their legacy Shopify custom app (kills token at the source) → revoke
   their NS integration tokens → delete their 0-install dev-dashboard
   app. Note timestamp T. NetScore is operationally dead.
2. **Clean up now-safe leftovers**: delete the 6 standalone scripts.
   The BUNDLE stays installed-but-inert for now (uninstall is pure
   cosmetics once scripts are dead; keeping it preserves quick rollback).
2b. **Re-snapshot stamps into PROD Supabase** (after T so last-minute
   orders are covered): `npx tsx scripts/shopify/snapshot-netscore-data.ts
   --target production --db prod`. The NETSCORE_ERA guard on every prod
   execute path reads this — a stale snapshot = duplicate-chain risk for
   boundary orders.
2c. **Re-point the discount item** (safe now — NetScore is dead):
   `npx tsx scripts/shopify/setup-production.ts --repoint-discount`.
3. **Turn on ours** (prereqs from "Build remaining" + owner env/SQL
   steps must be done; live mode throws until PRODUCTION_ENGINE_CONFIG
   has no PROD-PENDING left): mode='live', cursor=T.
4. **Import the gap**: `backfill.ts --from .. --to .. --target production
   --i-am-sure` for [T .. now] — full A+B+C chain per order, persists to
   the prod dashboard, idempotent, NETSCORE_ERA-guarded. Gap length is
   irrelevant (hours or days). (The 15-min poller alone would also chew
   through a short gap from cursor=T; the script is faster + reportable.)
4b. **Recon the boundary**: `reconcile.ts --from <T-2 days> --to <today>
   --target production` — proves no order fell in the crack; NetScore-era
   orders count as netscore-era, ours verify to the cent.
5. Payout loop: verify after first Monday payout (journal + fee bill vs
   bank line).
6. After ~1 clean week on the dashboard + Loop D: **uninstall bundle
   322635 in prod** (rehearsed in sandbox 2026-08-20: deletes fields +
   data; we no longer care — snapshot in Supabase, code independent) →
   cancel contract.
NOTE: stamp-migration-to-our-fields is OBSOLETE — replaced by the
Supabase snapshot (netscore_*_stamps) + snapshot ladder rung, shipped
2026-08-20. NetScore also deleted their own prod duplicates
(7,324→2,818 customers) — dup-merge job off the queue.

### Watch-week findings (2026-08-21)

- **First live order #7277 PERFECT**: SO SOUS17155 / INV INVUS17160 /
  payment, $138 to the cent, CSF VALIDATED IN PROD (line
  inventorylocation 46, inventorysubsidiary 1, no header location).
- **NS 429 collision**: 02:30 UTC poll collided with the invoice-refresh
  cron → CONCURRENCY_LIMIT_EXCEEDED → parked; the poller's 10-min
  cursor-overlap re-ran it at 02:46 and self-healed (idempotency proven
  live: 03:01/03:16 re-runs adopted, 0 duplicates). Rule of thumb:
  transient infra errors self-heal; DATA errors (UNKNOWN_SKU etc.) wait
  for the dashboard. FIXED PROPERLY: 429-aware retry (10s/20s, re-signed
  OAuth) in lib/netsuite.ts request/find/create/update/transform.
- **TIMEZONE (owner directive)**: NS transaction dates now use the STORE
  timezone (America/New_York) via core/dates.ts storeDate() — SO/invoice/
  payment/IF/CM. #7277 exposed it: 10:24pm ET Aug 20 order was dated Aug
  21 (UTC), which would shift revenue across month boundaries vs Shopify
  reports. Payout issue dates exempt (nominal Shopify dates). Cron moves:
  refresh-invoices → 04:30 UTC (00:30 ET), refresh-reports → 05:00 UTC
  (01:00 ET). NOTE: Vercel cron is UTC-fixed → times drift 1h in winter.
- #7277's own SO/INV/payment still carry tranDate 2026-08-21 — owner may
  want a one-off PATCH to 2026-08-20.

### Loop B in production — the CSF fulfillment saga (2026-08-21, SOLVED)

First live fulfillments (#7275–#7278) exposed a three-layer onion; all
peeled, all fixed, error queue back to ZERO:
1. Integration role lacked **Transactions → Fulfill Sales Orders** (owner
   added; also Employee Record View + Allow Cross-Subsidiary Record
   Viewing while in there).
2. **Plain REST transform cannot create cross-subsidiary IFs** (every
   variant → "no valid line item"; UI + SuiteScript can — manual IF18232
   proved it: sub-1 lines from a sub-3 order). Built
   netsuite/restlet_fulfill_order.js ("QQ Shopify Fulfill", script 2032
   deploy 1, env NETSUITE_FULFILL_SCRIPT_ID/_DEPLOY_ID in prod Vercel +
   .env.local): SuiteScript record.transform + lines/lots/tracking,
   idempotent by externalid. fulfill.ts routes via RESTlet when
   configured; CSF without it parks loudly; sandbox keeps plain REST.
3. Two SuiteScript quirks: CSF transform REQUIRES
   `defaultValues: { inventorylocation }` (documented VALID_LINE_ITEM_REQD
   cure), and N/format.parse rejects ISO dates on this DD/MM account —
   build the Date object directly.
Result: IF18233/34/35 booked by the RESTlet — BrandFox lines (loc 46,
sub 1), FEFO lots (multi-item orders incl.), store-timezone dates.
#7277 = owner's manual IF18232, stamped + adopted. NOTE: commitment/
allocation was a RED HERRING — the account fulfills uncommitted lines
daily; no allocation needed. Also parked observations: account FEFO
framework broken (owner wants help fixing it someday); Hub B2B IFs still
manual (future: ShipHero push + auto-IF for Hub orders too).

### 2026 audit + EUR-window backfill (2026-08-21)

docs/AUDIT-2026-SHOPIFY-NS.md: 1,670 orders, 1,623 clean. ALL 10 NetScore-
lost orders were EUR-presentment orders → EUR accommodation built (store
USD, presentment cosmetic; FX gap carried as an "FX rounding" invoice line
on the refund-adjustment item; gate refuses only a non-USD STORE currency).
9/10 imported: $5,083.73, original dates, IFs booked. #6545 open (refunded
+ RETURN restock — owner decides on inventory). Remaining audit items are
CPA material: 34 NetScore-era amount mismatches (re-pricing, netted
refunds, dropped duties) + 3 CM-less refunds.
Rules learned: every Shopify order is Qiqi INC (other-subsidiary customer
duplicates disqualified automatically; same-subsidiary duplicates park
with facts for a human); non-lot items fulfill without inventory detail;
duplicate-SKU Shopify lines map to distinct SO lines.

### Correction rules learned while cleaning 2026 (2026-08-22)

- ALL 2026 periods are OPEN (owner: nothing closes until the books are
  clean) → corrections go IN PLACE on original dates, never as dated
  adjustments. Invoice lines, SO lines and the payment amount are all
  REST-patchable (line-addressed item patches; payment via
  `payment` + `apply`); REST cannot DELETE sublist lines (405) — zero
  them instead. Header discounts must be changed via `discountRate`, not
  by adding a discount item line (that doubles the discount).
- Shop-remitted (channelLiable) tax never reaches the payout → expected
  cash = charged − channel-liable tax (#5627 was correct all along).
- Pro-Discount era (pre-2026-07-16 B2B workaround): book lines at NET
  wholesale (original − allocation), no discount line (owner rule b).
- NetScore's "Shopify Tax Item" (1057 → 410000) on invoices must be
  re-pointed to item 1464 (→ 240504) when touched.
- Netted refunds (NetScore shrank invoice + payment, no CM) → restructure
  to the engine's chain: invoice/payment at charged, CM on 1565 dated the
  Shopify refund date, Customer Refund from the gateway clearing account
  (Group C, owner 2026-08-22). Never re-ADD an inventory line to an
  existing invoice via REST — NS treats it as a standalone sale and
  demands inventory detail (= stock movement). Bill an unbilled SO line
  on a second invoice transformed from the SO instead (SO-linked, no
  inventory posting), then close the SO line.
- Shopify refund line items carry the FULL line value even when only
  part was refunded (#5804: $28 of a $56 line) → when line subtotals
  exceed the refund total, book one amount-only adjustment line.
- Prod REST refuses a Credit Memo without a header location ("Please
  enter value(s) for: Location") — engine config creditMemoLocationId =
  31 (Packable; accessible to Qiqi INC — BrandFox 46 belongs to Qiqi
  Global). Proven on CMUS10121-10123.

### Dashboard v2 — FINANCIAL view (owner directive 2026-08-20, build next)

The dashboard is the ACCOUNTING department's window, not a sales report.
Headline cards: Total orders · Orders value · Fees paid to Shopify
Processing · Error orders (expand once an error exists) · Next payout
(date + amount from the Shopify Payments API). Keep the sync plumbing
(mode/cursor/links) secondary. qq/* components per the design system.

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
