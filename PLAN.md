# PLAN — Inventory Investigation & Simulation Tool

Decision-support tool for diagnosing and simulating fixes to negative-inventory
problems in NetSuite. **Read-only toward NetSuite** — it never pushes fixes. The
core deliverable is the **simulator**: try a fix, immediately see whether it
heals one location while breaking another, before touching NetSuite.

Single internal user (the owner). Lives inside the existing admin app.

---

## Confirmed decisions

1. **Route & auth** — Nested under `/admin`. Final route:
   `/admin/inventory-investigation` (list) and
   `/admin/inventory-investigation/[itemCode]` (detail).
   Reuses `AppShell`, the admin sidebar, and `requireWithPermission(req, 'netsuite')`
   (with the existing `SUPER_ADMIN_IDS` override). No new auth surface.
2. **Data source** — SuiteQL against `transactionline` via the existing
   `lib/netsuite.ts` `suiteQL<T>()`. **No saved search, no RESTlet.** Inventory
   Transfers' two legs are paired in code.
3. **Date range** — Pull all transactions for the item; anchor with current
   quantity-on-hand (QOH) from NetSuite. No go-live date needed:
   `opening = current_QOH − Σ(pulled signed qty)` per (item, location).

---

## Reuse map (no rewrites)

| Need | Reuse |
|---|---|
| NetSuite query | `lib/netsuite.ts` → `createNetSuiteAPI()`, `ns.suiteQL<T>(q)`. Handles OAuth 1.0a + the DD/MM→ISO `normalizeNsDate()` quirk. |
| Current QOH anchor | New SuiteQL on `inventorybalance` (same table `getInventoryByLocation` already uses), grouped per location for one item. |
| Server DB writes | `createServiceRoleClient()` from `platform/auth/guards.ts` (bypasses RLS). |
| API auth | `requireWithPermission(request, 'netsuite')`. |
| Browser → API | `lib/fetchWithAuth.ts`. |
| Page shell / nav | `app/admin/layout.tsx` `NAV_GROUPS` (add one item, `permission: 'netsuite'`). |
| UI | qq/* only — `Card`, `Table`, `Dialog`/`Sheet`, `Tooltip`, `Badge`, `Select`, `Button`, `PageHeader`, `EmptyState`, `Tabs`, `Alert`. Semantic tokens, `px-6 py-8`. |
| Migration style | Existing template: `ENABLE ROW LEVEL SECURITY` + admin-all policy via `auth_is_admin()` in the same migration. |

---

## Architecture

```
NetSuite (SuiteQL)
   │  pull (per item, on demand / refresh button)
   ▼
API: /api/inventory-investigation/[itemCode]/refresh   (server, service-role)
   │  parse + pair transfers + compute opening
   ▼
Supabase cache  ──────────────────────────────────────────────┐
   inv_inv_items            (item header + last_refreshed_at)   │
   inv_inv_transactions     (one signed row per item/tx/location)│
   inv_inv_opening_balances (opening + current QOH per location) │
   inv_inv_plan_markers     ("I plan to fix this" notes)         │
                                                                  │
API: GET /api/inventory-investigation/[itemCode]  ◄──────────────┘
   │  returns cached raw rows + openings + markers
   ▼
Browser page  (Timeline · Table · Simulator)
   │
   └─ lib/inventory/balanceEngine.ts  ── PURE, shared by read view AND simulator
         computeLedger()      → end-of-day balances per (location, date)
         detectSuspects()     → suspect flags
         simulate(change)     → re-run engine with a proposed change → delta
```

**Why a pure engine module.** The read view and the simulator must produce
*identical* balances or the tool is untrustworthy. Both call the same
`balanceEngine`. Caching stores only raw facts (transactions, openings, QOH);
all balances/suspects/deltas are computed in memory (thousands of rows = trivial).
The simulator never writes to the cache — it clones the row set, applies the
change, and recomputes.

---

## Data model (new migration)

All tables: `ENABLE ROW LEVEL SECURITY` + a single `*_admin_all` policy using
`public.auth_is_admin()` (matches the established pattern; no client access).

```
inv_inv_items
  item_code            text primary key      -- = NS itemid / our Products.sku
  ns_item_id           text                  -- NS internal id
  item_name            text
  item_type            text                  -- 'Inventory Item' | 'Assembly'
  last_refreshed_at    timestamptz
  date_min, date_max   date                  -- observed range, for default zoom
  created_at, updated_at

inv_inv_transactions
  id                   uuid pk
  item_code            text  (fk → inv_inv_items)
  ns_transaction_id    text                  -- internal_id  (tiebreak #2)
  line_id              text                  -- transactionline id (tiebreak #3)
  doc_number           text                  -- tranid (transfer pairing key)
  tran_date            date                  -- (tiebreak #1, ASC)
  tran_type            text                  -- normalized: IR|IF|IT|BUILD|UNBUILD|ADJ|BILL
  location_ns_id       text
  location_name        text
  signed_qty           numeric               -- +in / −out at this location
  transfer_group       text  null            -- doc_number for IT rows; pairs the 2 legs
  transfer_leg         text  null            -- 'source' | 'dest'
  memo                 text
  unique (ns_transaction_id, line_id, location_ns_id)

inv_inv_opening_balances
  item_code            text
  location_ns_id       text
  location_name        text
  opening_qty          numeric               -- current_qoh − Σ signed_qty
  current_qoh          numeric               -- NS ground truth anchor
  primary key (item_code, location_ns_id)

inv_inv_plan_markers      -- Phase 3, "Apply Visual Marker"
  id                   uuid pk
  item_code            text
  ns_transaction_id    text
  planned_action       text                  -- 'change_date'|'change_qty'|'delete'
  note                 text
  created_at
```

Table prefix `inv_inv_` keeps these clearly grouped and distinct from the
existing `inventory_levels` cache (which stays untouched).

---

## Core algorithm (`lib/inventory/balanceEngine.ts`)

**Ledger build** — for each location independently:
1. Sort that location's rows by `tran_date ASC, ns_transaction_id ASC, line_id ASC`.
2. Running balance starts at `opening_qty`, then `+= signed_qty` per row.
3. Roll up to **end-of-day**: balance after the last row on each date.

**Negative day** — a location is negative on date D iff its **end-of-day**
balance < 0. Intra-day dips that recover same day do **not** count. (This is the
BAS0009 case — same-day round-trip transfers net to recovery by EOD.)

**Suspect transaction** — flag an outbound row (`signed_qty < 0`) at location L iff:
- end-of-day balance at L on its date is < 0, **AND**
- either (a) prior day's end-of-day at L was ≥ 0 (this tx drove it negative),
  **or** (b) prior day was already negative AND today is *more* negative
  (this tx deepened it).

**Simulate(change)** — `change ∈ {changeDate, changeQty, delete}` on a tx:
1. Clone the full row set.
2. Apply the change. **If the tx is an Inventory Transfer, apply to BOTH legs**
   (source and dest share `transfer_group`) — date change moves both, qty change
   flips sign per leg, delete removes both.
3. Recompute the ledger for **all** locations.
4. Diff against the current ledger →
   - `FIXED` — location no longer negative anywhere in history.
   - `STILL_NEGATIVE` — still negative; report new depth vs old depth.
   - `NEW_PROBLEM` — a location that was clean is now negative (date span + depth).

`simulate` returns a structured delta the UI renders verbatim.

---

## SuiteQL strategy (Phase 1 — the technical risk)

The exact `transactionline` column names/signs are account-specific, so Phase 1
**starts with a probe**, not a finished query.

1. **Probe endpoint** `/api/inventory-investigation/[itemCode]/probe` runs a
   candidate query for COM0059 and returns **raw rows** (no parsing) so we can
   inspect real shapes/signs against the live account:
   ```sql
   SELECT t.id, t.tranid, t.trandate, t.type, t.memo,
          tl.id AS line_id, tl.item, tl.location, tl.quantity, tl.memo AS line_memo
     FROM transactionline tl
     JOIN transaction t ON t.id = tl.transaction
    WHERE tl.item = :nsItemId
      AND t.type IN ('ItemRcpt','ItemShip','InvTrnfr','Build','Unbuild','InvAdjst','VendBill')
    ORDER BY t.trandate, t.id, tl.id
   ```
2. From the probe output, pin down: the signed-quantity field, how transfers
   expose source vs destination location, and which line(s) per transaction are
   the real inventory movements (avoiding the 3-line COGS posting trap — we query
   `transactionline`, **not** `transactionaccountingline`).
3. **Current QOH anchor:**
   ```sql
   SELECT location, SUM(quantityonhand) AS qoh
     FROM inventorybalance WHERE item = :nsItemId GROUP BY location
   ```
4. **Location names:** resolve `location` ids → names via SuiteQL `location` table
   (so the tool shows *every* NS location with activity, even ones not in our
   `Locations` table).
5. Normalize into `inv_inv_transactions`; pair IT legs by `doc_number`; compute
   openings; cache.

If the probe shows the data can't be made clean from `transactionline` alone,
I stop and report before building further (per your "validate Phase 1 first" rule).

---

## Phases

### PHASE 1 — Data pipeline (validate before any UI)
- Migration for the 4 cache tables.
- Probe endpoint + finalized SuiteQL pull for one item (test: **COM0059**).
- Parser: normalize types, pair transfer legs, resolve location names.
- Opening-balance + QOH anchor computation.
- `balanceEngine`: ledger, end-of-day, suspect detection (pure, unit-tested).
- **Vitest** unit tests for the engine using small fixtures (drove-negative,
  deepened-negative, same-day round-trip recovery → no suspect).
- **Deliverable to you:** a JSON/console dump (or a tiny `/debug` view) of
  computed balances so you can check the anchors before I build UI:
  - COM0067 @ Ambix final = **2,616**
  - COM0067 @ Bio-Direct opening = **+932**, final = **0**
  - COM0067 @ Main final = **−22,946**
  - BAS0009 → **0 suspects**
- **Stop. You validate. I do not build Phase 2 until anchors pass.**

### PHASE 2 — Read-only UI
- Route `/admin/inventory-investigation/[itemCode]`, nav link, three-pane wide
  layout (Timeline top · Table middle · empty Simulator rail right).
- **Timeline (Section 1):** one row per location, time axis; markers (IR green
  up-arrow, IF red down-arrow, Build blue diamond, Adjustment orange dot);
  **transfers as a curved arrow connecting source→dest rows**; red shading on
  end-of-day-negative segments; hover tooltip (date/doc#/type/qty/running
  balance/memo); date-range zoom (default full history). Built with SVG +
  qq tokens — no new charting library.
- **Table (Section 2):** all columns from spec, sortable, filters (location /
  type / date range / suspects-only), suspect red dot, row click selects.
- No simulator yet.
- **Stop. You eyeball the visuals against NetSuite.**

### PHASE 3 — Simulator (the point of the tool)
- Click a marker or row → loads into the Simulator rail.
- Action dropdown (Change Date | Change Quantity | Delete) + inputs + Simulate.
- Output: **CURRENT STATE** / **AFTER FIX** / **DELTA** with the three colored
  outcome classes; `NEW PROBLEM` rendered loud (destructive token).
- Transfer changes apply to **both legs**.
- "Try another fix" (reset) + "Apply Visual Marker" (writes `inv_inv_plan_markers`,
  shows a planning marker on the timeline; changes no real data).
- **Stop. You run the fix loop on real cases.**

### PHASE 4 — Item picker + polish
- List view `/admin/inventory-investigation`: all items with ≥1 suspect,
  ranked (e.g. by deepest negative / suspect count); search bar for direct
  lookup; per-item **Refresh from NetSuite** button (calls the refresh endpoint).

---

## Risks / open items
- **SuiteQL shape is the main unknown** — mitigated by the Phase-1 probe and the
  hard validation anchors. Everything downstream is deterministic math.
- **`VendBill` inventory lines** — included tentatively; the probe confirms
  whether standalone bills actually move inventory in this account, else dropped.
- **Items not in `Products`** — investigation keys off NS `itemid`, so an item
  missing from our `Products` table can still be investigated (we read name/type
  from NS).
- **Refresh cost** — per-item, on demand only (button), never on page load.

---

## What this tool will NOT do (per spec)
No writes to NetSuite · no journal entries · no cost analysis (quantity only) ·
no multi-currency / subsidiary consolidation.
