# Fix plan — handoff for a fresh session

Companion to `docs/AUDIT-2026-08-02.md` (the findings). This file is the **plan**:
what to do, in what order, with the context a new session needs so it doesn't
have to re-derive any of it.

**Current state: nothing is fixed.** The audit is complete and committed
(`04b6d42`, `9b9b7c3`). No application code has been changed in response to it.
The only code change in this whole session was an unrelated cleanup
(`6fd9cb1` — deleted `calculateTargetPeriodProgress`, migrated its two callers).

---

## Read first

1. `docs/AUDIT-2026-08-02.md` — all findings, verified, with file:line refs.
   Part 1 = live defects, Part 2 = duplication, Part 3 = RLS/database,
   Part 4 = consistency debt, Part 5 = delete list, Part 6 = dismissed claims
   (don't re-raise these).
2. `CLAUDE.md` — project conventions. **Two statements in it are now known
   wrong** and should be corrected as part of this work:
   - it says `note_replies` is admin-only; clients can SELECT and INSERT
     (correctly scoped, but the doc is stale);
   - its RLS posture table doesn't mention that ~10 client-facing tables have
     dashboard-created policies absent from `supabase/migrations/`.

## Hard-won context (don't relearn these)

- **`supabase/migrations/` is NOT the source of truth for RLS.** Many policies
  were created in the Supabase dashboard. Always query `pg_policy` in production
  before concluding a policy is missing. `scripts/db/audit-rls-state.sql` does
  this; a second query for policy bodies is in the session transcript and
  reproduced at the bottom of this file.
- **Policies are OR'd.** A stale permissive policy silently defeats a newer
  tighter one. This is the root cause of findings 3.2 and 3.4. Any cleanup
  migration must `DROP POLICY` the superseded ones **by name**.
- **Owner's workflow:** push code to `main` first, then the owner applies SQL
  manually in the Supabase SQL editor. Never assume a migration has run.
  Vercel auto-deploys on push.
- **Git:** never `git add -A` or `git add .` — always explicit paths.
- **Verification:** `npx tsc --noEmit` and `npm test` (Vitest, ~115 tests) both
  pass on the current tree. Keep them passing.
- Browser → protected API calls must use `lib/fetchWithAuth.ts`. The token is in
  localStorage, not cookies, so plain `fetch` fails auth. Two existing callers
  get this wrong (finding 1.5).

---

## WP1 — Security hotfixes (code only, no SQL)

Smallest, highest value. Do this first.

**1.1 Close the IDOR.** `app/api/orders/[id]/sli/data/route.ts` checks only that
an `Authorization` header exists, then reads with service-role via
`lib/pdf/api/sliDataFetcher.ts:111-137`. Any authenticated user can read any
order's customs data. Copy the pattern from `app/api/orders/[id]/sli/route.ts:26-54`
(which does check company ownership), or use `requireAdmin` — the only caller is
the admin SLI preview page (`app/admin/orders/[id]/sli-preview/page.tsx:62`).

**1.2 Role-gate the packing slip.** `app/components/shared/PackingSlipView.tsx:840`:
`const canEdit = ['Ready','Done'].includes(order.status)` → add `role === 'admin' &&`.
The DB currently permits the client write (see WP2), so this is real exposure.

**1.3 Block disabled users from logging in.** `app/api/user-profile/route.ts:91-102`
returns the profile and role regardless of `enabled`; `app/client/layout.tsx:153`
checks only the role. Reject `enabled !== true` in both. Check the admin layout
too (`app/admin/layout.tsx:162-195`).

**1.4 Fix the two unauthenticated recalculate calls.** Swap plain `fetch` for
`fetchWithAuth` and stop swallowing the error:
- `app/components/shared/orderDetails/useOrderDetailsController.ts:222-226`
- `app/admin/companies/[id]/historical-sales/page.tsx:97-101`
Target-period progress has not been recalculating on order completion because of
this.

**1.5 Fix the admin credential edit.** `app/admin/admins/[id]/edit/page.tsx:91-101`
calls `supabase.auth.admin.updateUserById` from the browser with the anon key —
always fails, unchecked, page says "Admin updated." Move to a guarded API route.
The same unchecked call is in `app/admin/users/[id]/edit/page.tsx:107-112` and
`app/admin/companies/[id]/users/[userId]/edit/page.tsx:86-91`.

**1.6 Point the client delete at the real endpoint.**
`app/components/client/ClientOrderDetailsView.tsx:160` calls
`DELETE /api/orders/${orderId}` — no such route. Use
`/api/orders/delete?orderId=` like `useOrderDetailsController.ts:518`. Also
reconcile the three contradictory delete rules noted in audit 1.8.

Verify: `npx tsc --noEmit && npm test`, then manual smoke test of an order page,
a packing slip as a client, and an admin email change.

## WP2 — RLS cleanup migration (SQL — owner applies manually)

One migration. **Drop superseded policies by name**, then add the corrected ones.
Write it, push it, and hand the owner the file to run — do not assume it ran.

- `order_documents` (10 policies): drop `client_delete_company_documents`,
  `client_update_company_documents`, `client_upload_company_documents` unless the
  owner confirms clients genuinely need to upload. Drop
  `client_view_company_documents` so the `is_public` restriction actually binds.
  Collapse the four granular admin policies + `admin_full_access` into one
  `auth_is_admin()` policy.
- `packing_slips`: change the client policy from `FOR ALL` to `FOR SELECT`.
- `order_items`: **drop `order_items_client_write`** — it's the tier-1 leftover
  that lacks the `auth_has_permission('orders')` check the four newer policies
  have, so it currently defeats the permission system.
- `order_history`: constrain the client INSERT policy so `status_to` can't be
  forged (or move history writes server-side entirely — see WP3).
- All legacy admin policies that test `admins.id = auth.uid()` **without**
  `enabled = true` → replace with `auth_is_admin()`. Affects `order_documents`,
  `packing_slips`, `slis`, `order_history`, `clients`.
- `clients`: drop the redundant "Admins can view all clients" and "Clients can
  view own data" (covered by `clients_admin_all` and
  `clients_self_or_same_company_select`).
- `slis`: drop the four granular admin policies, keep "Admins can manage all
  SLIs" rewritten with `auth_is_admin()`.

Before writing it, re-run the policy-body query for `orders` and the DAM tables
(see "Open analysis" below) so the migration covers them in one pass.

## WP3 — Make permissions real

Currently `requireWithPermission` is called by 1 of 95 routes and the admin area
has no route guard at all.

1. Port the client layout's `isPathAllowed` + redirect effect
   (`app/client/layout.tsx:92-111,182-193`) into `app/admin/layout.tsx`. Use an
   explicit route→permission table rather than deriving from `NAV_GROUPS` —
   ~11 admin routes aren't in the nav (`/admin/classes`, `/admin/locations`,
   `/admin/subsidiaries`, `/admin/incoterms`, `/admin/payment-terms`,
   `/admin/support-funds`, `/admin/products/bulk-upload`,
   `/admin/categories/reorder`, `/admin/sli/create`, `/admin/sli/preview`,
   `/admin/design/form-kit`). Unmatched paths should deny by default.
   `firstAllowedAdminArea` (`lib/permissions.ts:100`) exists and is unused —
   wire it up as the redirect target.
2. Move the two browser-side permission writes behind guarded API routes:
   `app/admin/admins/[id]/edit/page.tsx:79-88` and
   `app/admin/users/[id]/edit/page.tsx:95-105`. Today any admin can self-escalate
   because the RLS policy only asks "are you an admin".
3. Convert route families to `requireWithPermission`: `/api/reports/*` →
   `reports`, `/api/netsuite/*` → `netsuite`, `/api/users/*` + `/api/admin/create`
   → `users:manage`, DAM routes → `dam`.
4. Route all permission checks through `userHasPermission` (`lib/permissions.ts:74`,
   currently zero callers) so the `SUPER_ADMIN_IDS` override applies to UI gating
   too, not just API routes. Note it reads a non-`NEXT_PUBLIC_` env var, so it's
   inert in browser bundles — either split the override server-side or expose the
   list as `NEXT_PUBLIC_`.
5. Stop the editors re-granting defaults on empty arrays
   (`app/admin/users/[id]/edit/page.tsx:72-74`,
   `app/admin/admins/[id]/edit/page.tsx:53-55`).

## WP4 — Creation paths write complete rows

**4.1 Users get permissions on create.** `app/api/users/create/route.ts:79-85`
→ extend the `create_client_profile` RPC with a `p_permissions` argument, or
`UPDATE` after insert. Same for `app/api/admin/create/route.ts:88-95` with
`DEFAULT_ADMIN_PERMISSIONS`. **This is why new users land at `/forbidden`.**
Also fix the false "This admin will have full access" alert
(`app/admin/admins/new/page.tsx:97-103`).

Consider a one-off backfill for existing rows with `permissions = '{}'` — check
with the owner which users should get which set.

**4.2 Company create writes contract + targets.**
`app/admin/companies/new/page.tsx:183-215` omits `contract_execution_date`,
`contract_duration_months`, `contract_status` and has no territories or
target-periods editors — all present in `app/admin/companies/[id]/edit/page.tsx:388-427`.
New companies are therefore absent from Company Performance until someone
reopens them in Edit. Extract `buildCompanyPayload()` + shared field components.

**4.3 Product bulk-upload writes all columns.**
`app/admin/products/bulk-upload/page.tsx:128-145` writes 13 of 18 columns —
missing `category_id`, `qualifies_for_credit_earning`, `hs_code`, `made_in`,
`case_weight`, `out_of_stock`. The credit-earning omission affects support-fund
accrual (money). Extract one `buildProductPayload()` used by new/edit/bulk.

## WP5 — Kill the duplicate flows

In rough value order:

1. **Two edit-user pages.** Delete `app/admin/companies/[id]/users/[userId]/edit/`
   and point `app/admin/companies/[id]/page.tsx:537` at
   `/admin/users/{id}/edit?from=company`. (This is what started the audit.)
   Same for the two create-user pages.
2. **SLI.** Two tables (`slis`, `standalone_slis`), two forms (`SLIFormFields.tsx`
   full vs `CreateSLIModal.tsx` with five checkboxes hardcoded at `:64-82`), three
   preview pages. Order SLIs get no SLI number and **never appear in the SLI
   documents list** (`app/admin/sli/documents/page.tsx:23-26` queries
   `standalone_slis` only) — customs paperwork against orders is untracked.
   `/admin/sli/preview` has zero references; delete it and `/api/sli/generate-html`.
3. **Order form fork.** `AdminOrderFormView.tsx` / `ClientOrderFormView.tsx` share
   11 character-identical helpers (`getProductPrice`, `getOrderTotals`,
   `getSupportFundTotals`, …). Move them to `app/components/shared/orderForm/`.
   Both also declare `visible_to_americas`/`visible_to_international` and use
   neither — region visibility silently does nothing.
4. **Details/list/documents/history forks** — `ClientOrderDetailsView` should
   consume `useOrderDetailsController`; hoist the gating constants into
   `orderDetailsUtils.ts`.
5. **Company performance pages** — one shared `<CompanyPerformanceView variant>`.
   Note the client page has an `isEnrolled` gate the admin page lacks, so admins
   see meaningless zeroed support-fund columns for non-enrolled companies.
6. **DAM locale/tag creation** exists twice; the inline path in
   `app/admin/dam/page.tsx:3316` uses `prompt()`/`alert()` and skips the duplicate
   check. Point it at `/api/admin/locales` and `/api/admin/tags`.
7. **Category ordering** — remove the `sort_order` input from `CategoryFormFields`
   so the drag-and-drop reorder page is the only writer.

Per CLAUDE.md, prefer extracting new shared code as siblings over rewriting the
known long files.

## WP6 — Delete dead code

Two are actively dangerous:
- `lib/emailTemplates.ts:272` `welcomeUserTemplate` emails a **plaintext
  temporary password**. Dead; every caller uses `welcomeEmailTemplate`.
- `lib/auth-utils.ts` — a whole second auth implementation gating on a `users`
  table that isn't the live model.

Then: `app/components/reports/` (7 components; lets you drop `apexcharts`,
`react-apexcharts`, `deepmerge`), `platform/queue/`, `lib/pdf/utils/*`,
`lib/pdf/constants.ts`, `lib/pdf/generators/sliGenerator.ts`,
`app/components/shared/ContractInfo.tsx`, `app/components/ui/OrderStatusBadge.tsx`,
`app/configs/charts-config.ts`, `app/components/ui/TopNavbar.tsx`.

Nine dead API routes still deployed with service-role write paths:
`/api/orders/auto-save-draft` (also carries a **wrong copy of the support-fund
math** — omits the `qualifies_for_credit_earning` filter), `/api/orders/complete`,
`/api/orders/notifications`, `/api/dam/assets/[id]/versions`,
`/api/dam/queue/metrics`, `/api/users/send-welcome-email`,
`/api/fulfillment/shiphero/register-webhook` (may be a deliberate ops endpoint —
ask), `/api/netsuite/orders/create`, `/api/netsuite/products/sync`.

`/dev/components` and `/dev/layout` have no guard and aren't in the middleware
matcher — publicly reachable. Note CLAUDE.md points at `/dev/components` as a
design reference, so decide with the owner: guard them or move them under
`/admin`.

## WP7 — Consistency debt (lowest urgency)

- One `ORDER_STATUSES` + status→colour map + named predicates. Currently six
  sources of truth, two of which disagree on colours.
- `formatCurrency` into `lib/formatters.ts` with a decimals option — ten
  implementations today, plus ~20 raw `.toFixed(2)` sites that lose thousand
  separators.
- `formatDate`/`formatDateTime` into `lib/formatters.ts` — eight local copies in
  three formats, ~25 bare `toLocaleDateString()` calls that render `dd/mm/yyyy`
  for non-US browsers, inconsistent UTC handling (some off by a day).
- `lib/csvExport.ts:173` doesn't double embedded quotes — corrupts the NetSuite
  import CSV for any name containing `"`. `lib/reportExport.ts:96` is correct.
- One admin-auth idiom (`requireAdmin`), one service-role client
  (`createServiceRoleClient()` — ~18 hand-rolled copies today).
- Add tests: a table-driven test asserting every `app/api/**/route.ts` calls a
  guard, and unit tests for the extracted totals/permission helpers. There is
  currently **zero** permission or guard coverage.

---

## Open analysis — do this before writing WP2

Two gaps I flagged but couldn't close:

**1. `orders` policy bodies.** Its five policy names all come from the
permissions migration, so it *looks* clean, but I never read the bodies. Given
`order_items` had a leftover `FOR ALL` policy that defeats the permission gate,
confirm `orders` doesn't.

**2. DAM taxonomy policies.** The state query showed ~14 `dam_*` tables with
`*_read_authenticated` policies. If those are `USING (true)`, **any authenticated
user can read all DAM asset metadata directly from the browser**, bypassing the
company-entitlement model that `/api/dam/assets/client` and
`list_client_dam_assets_entitled` enforce. The client Assets page is fully
API-mediated so the UI is fine — the question is whether a direct browser query
bypasses entitlement.

One query answers both:

```sql
select
  c.relname as table_name,
  p.polname as policy_name,
  case p.polcmd
    when 'r' then 'SELECT' when 'a' then 'INSERT'
    when 'w' then 'UPDATE' when 'd' then 'DELETE'
    when '*' then 'ALL' end as command,
  pg_get_expr(p.polqual, p.polrelid)      as using_clause,
  pg_get_expr(p.polwithcheck, p.polrelid) as with_check_clause
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (c.relname = 'orders' or c.relname like 'dam\_%')
order by c.relname, p.polname;
```

Also unverified, lower stakes: the client policies on `company_notes`,
`note_attachments`, `company_territories`, `target_periods`, `highlighted_products`
— whether they check `enabled = true` and `visible_to_client`.

## Suggested sequencing

WP1 (code, ship immediately) → run the query above → WP2 (SQL, owner applies) →
WP4.1 (unblocks user onboarding) → WP3 → WP4.2/4.3 → WP5 → WP6 → WP7.

WP1 and WP4.1 are the ones with active daily cost. WP2 is the one with the
largest security surface. WP5–WP7 are debt paydown and can proceed at whatever
pace suits.
