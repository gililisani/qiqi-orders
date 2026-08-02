# Fix plan — handoff for a fresh session

Companion to `docs/AUDIT-2026-08-02.md` (the findings). This file is the **plan**:
what to do, in what order, with the context a new session needs so it doesn't
have to re-derive any of it.

## VERIFICATION + SESSION 1 STATUS (2026-08-02, second session) — read first

A separate session adversarially re-verified ~35 of this plan's claims with five
parallel review agents. **Nearly all confirmed.** Corrections the executor MUST
know:

- **`TopNavbar.tsx` is NOT dead** — imported by the live `/admin/design/form-kit`
  page (WP6 list is wrong on this one item; deleting it breaks the build).
- **1.2 (packing slip)**: UI bug certain, but whether client writes persist
  depends on live `packing_slips` RLS (table predates tracked migrations) —
  resolve with the WP2 production queries before calling it exposure.
- **1.3 (disabled users)**: guards + RLS helpers DO check `enabled`; the real
  gaps are `user-profile` GET, both layouts, and hand-rolled lookups (e.g. the
  SLI route ignores `enabled`). Fix list unchanged, severity lower.
- **1.5 has a 4th instance**: `admins/[id]/edit` `handleDelete` also calls
  browser-side `auth.admin.deleteUser` unchecked — "deleted" admins keep a live
  credential.
- Verified-good (do not re-audit): Stripe webhook signature check, cron-route
  auth, no tracked secrets, token validation, rate limiting on all public auth
  endpoints, orders RLS.
- New findings folded in: `Prefer: return=minimal` on `createServiceRoleClient`
  (guards.ts:15) likely nulls `.insert().select()` results (SLI signers, Amazon
  item-map — needs one live test); no MFA exists at all (2FA dirs were empty
  scaffolding, now deleted); password floor is 6 chars (set-password);
  feedback route trusts body identity; email subjects use `escapeHtml` instead
  of `sanitizeEmailHeader`; root `middleware.ts` gates nothing (vestigial).

**SESSION 1 IS DONE** (commits `64728e5`..`deaafc3`):
- ✅ P1 — send-reset-link now ignores body email, sends to auth-record email.
- ✅ ShipHero webhook — fails closed without secret, `.or()` injection guarded,
  tracking preserved, failed writes return 500 (was silent 200).
- ✅ P2 — `next@14.2.35`, axios/svg2pdf bumped, `nodemailer` removed.
  Remaining npm-audit criticals (jspdf major, fast-xml-parser via aws-sdk)
  deferred — breaking upgrades.
- ✅ Sentry wired (server captures `console.error` too) — **inert until the
  owner sets `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in Vercel.**
- ✅ CI — GitHub Action: `tsc --noEmit` + `npm test` on every push/PR.
  ESLint config still deferred (rest of WP8).
- ✅ `/_next/image` host pinned to our Supabase project (was `*.supabase.co`).
- ✅ Stale June docs deleted; empty 2FA dirs deleted.
- ⏳ WP0 damage-count SQL handed to owner; P5 (`case_pack`) NOT done yet —
  it's the first item of the next session.

**SESSION 2 IS DONE** (commits `998b1ac`..`117d54f`):
- ✅ P4 — Stripe: webhook mark-paid checked + reordered before NS recording
  (retry can't double-record); void-payment refuses paid invoices and fails
  closed; request-payment has idempotency keys + persist-before-email.
- ✅ P3 — `lib/orderPricing.ts` recomputes every money field from the catalog;
  `push-so` 409s on mismatch (10 unit tests). Order writes are still
  browser-direct — the service-role RPC move remains open (WP3-adjacent).
- ✅ P5 — case_pack: bulk-upload hard-errors, both product forms require a
  positive integer, migration `20260802140000_products_case_pack_constraint.sql`
  awaits the owner (run its check query first).
- ✅ WP4.1 — users/admins created WITH permissions (WP0 showed 0 damaged rows,
  no backfill needed). The false "full access" alert is now true.
- ✅ `Prefer: return=minimal` removed from guards.ts + 5 DAM local factories.
- WP0 results (owner-run): 0/55 clients without permissions; 6 companies
  without target periods (list query below — likely house accounts, review);
  0 products missing category/credit flag.

**SESSION 3 IS DONE — code side (commit `447bda3`):**
- ✅ P6 — `supabase/schema-baseline.sql` (pg_dump of production 2026-08-02).
  Direct DB access now works from the owner's machine (`SUPABASE_DB_URL` in
  `.env.local`, libpq installed).
- ✅ Storage/policy queries run directly against prod. Resolved: 10.1
  CONFIRMED (company-notes bucket was readable by ANY authenticated user);
  10.3 CONFIRMED for writes (product/category image buckets writable by any
  authenticated user); order-documents client storage policy was broken
  (matched `foldername(clients.name)`) — clients use the API anyway; anon has
  ZERO grants (better than feared); `is_admin()` also skipped `enabled`.
  New finds: company_notes/note_attachments table policies missed
  `visible_to_client` — internal notes readable by direct query.
- ✅ WP2 — `20260802150000_rls_cleanup_tier2.sql`, **dry-run verified against
  production (BEGIN…ROLLBACK, every statement passed)**. 134 → ~90 policies.
  ⏳ **owner must apply it in the SQL editor**, then smoke-test client portal
  (orders, notes with attachment, order docs list, packing slip read-only)
  and admin DAM page.
- ✅ WP1.2 applied (PackingSlipView admin-only edit) to match the new RLS.

**SESSION 4 IS DONE — security + enforcement + reporting (commits
`60c86a1`..`7bed967`):**
- ✅ WP1 remainder: 1.1 (SLI data route admin-only), 1.3 (user-profile blocks
  disabled self-lookup), 1.4 (both recalculate callers use fetchWithAuth —
  they had been 401ing silently), 1.5 (see below), 1.6 (client delete points
  at the real endpoint).
- ✅ WP1.5 + WP3.2/3.5: new PATCH/DELETE `/api/users/[id]/account` (checked
  auth-record updates, admins:manage / users:manage gated, self-disable and
  self-delete blocked); all three edit pages rewired; permission editors no
  longer re-grant defaults on empty arrays.
- ✅ WP3: `requireAdminWithPermission` guard (admin AND permission — plain
  requireWithPermission would admit clients holding e.g. 'reports');
  netsuite+amazon (21 routes) → 'netsuite', reports (6) → 'reports', user
  routes → 'users:manage'/'admins:manage'; admin layout route guard with
  explicit route→permission table (~30 areas incl. off-nav), deny-by-default,
  firstAllowedAdminArea wired. Pre-verified in prod: all 5 admins hold sets;
  **Lori + Sophia lack 'netsuite' — now actually enforced.** DAM API routes
  keep their existing admin checks (uniform 'dam' conversion deferred — zero
  behavior delta today since every admin holds 'dam').
- ✅ WP10: SF lines excluded from Product Insights + Sales Explorer +
  `mv_product_sales` (migration `20260802160000`, dry-run verified; **owner
  must apply**). Definition: SF items are free redeemed goods — product
  revenue now matches order revenue; SF activity lives in its own report.
- Also deleted empty `admin/2fa`, `dashboard-new`, `dashboard-template` dirs.

**FOLLOW-UP 2026-08-02 DONE (after WP2 applied): order_history client
visibility** — this closes the "client-visible order-history filter" chip.
WP2 made clients reliably see ALL history rows for their orders — including
internal notes (NetSuite SO/invoice numbers, "Sent for payment — Stripe
invoice N ($X) incl. Z% card fee", ShipHero, shipping edits). Owner decided:
per-row `visible_to_client` boolean (default false), RLS-enforced; internal
status hops (Open→In Process on SO push, →Ready on invoice) hidden entirely;
visible = order create/update, UI status changes, documents, packing slip,
completion+tracking. Card-payment-received stays hidden (Stripe emails the
receipt). Migration `20260802170000_order_history_client_visibility.sql`
(column + backfill + policy) — ✅ **applied by owner 2026-08-02, before the
code deploy** (the reverse of push-first was required: new code inserts the
column, old schema rejects it).
Bonus fix: `/api/orders/complete` history insert had a phantom
`netsuite_sync_status` column → it has been failing silently in prod
(completion/tracking entries never written). Removed.

**Remaining (Session 5): WP11** (single SLI renderer), **WP5** (duplicate
flows — TopNavbar is ALIVE), **WP6** (dead code + dead routes), **WP12**
(env.example completeness, dunning cron alert, plaintext setup tokens),
**WP7** (consistency debt), ESLint config (WP8 remainder).

---

**Original state note: nothing below reflects Session 1.** The audit is complete
and committed (`04b6d42`, `9b9b7c3`). The only code change in the audit session
was an unrelated cleanup (`6fd9cb1` — deleted `calculateTargetPeriodProgress`,
migrated its two callers).

---

## UPDATE 2026-08-02 (second sweep) — read this first

A second sweep covered everything the "Scope and limits" section below listed as
unexamined: NetSuite correctness, Stripe, order money math, the DAM pipeline and
storage, documents and email, build/infra/secrets, and dependency versions.
Results are in audit Parts 8–12 and Part 7.

**The priority order changed.** The five findings below outrank every work
package in this document. Do them first, in this order.

### P1 — `/api/users/send-reset-link` account takeover (audit 12.1)
Ignore the body's `userEmail`; send to `authUser.user.email`. One line. Today any
admin can mint a password-setup link for any account — including the owner's —
delivered to an address of their choosing, with no notice to the victim.

### P2 — `next@14.2.4` → `14.2.35` (audit 7.4)
Same minor line, no framework migration. Closes two critical CVEs (cache
poisoning, image-optimization DoS) on the public production framework. Then
`axios`, `svg2pdf.js`, `dompurify` (all semver-compatible) and delete the unused
`nodemailer`.

### P3 — Client-controlled pricing (audit 8.1 / 9.1)
The browser writes `order_items.unit_price`, `orders.total_value`,
`credit_earned` and `support_fund_used` directly; RLS cannot restrict columns and
there is no `CHECK`, trigger, or server-side recompute. Those values become the
NetSuite Sales Order rate and the Stripe charge base. Fix in `push-so` first
(re-resolve rates from `Products` × company class and reject on mismatch), then
move order writes behind a service-role RPC.

### P4 — Stripe money-loss paths (audit 8.2, 8.3)
Three changes, all small:
- `void-payment/route.ts:42-46` — stop clearing local state when the Stripe void
  fails, and retrieve the invoice to refuse voiding anything already captured.
- `webhook/route.ts:78-86` and `request-payment/route.ts:169-183` — check the
  update error. supabase-js does **not** throw, so today a failed write returns
  200, Stripe never retries, and the order stays unpaid while NetSuite shows paid.
- `request-payment` — pass a Stripe `idempotencyKey`, and write the intent row
  *before* creating and emailing the invoice.

### P5 — `case_pack = 0` under-billing (audit 9.2)
`bulk-upload/page.tsx:134` stores `0` for a blank cell; both order forms treat
`0` as `1`. A 12-pack SKU imported that way bills 3 units instead of 36 — a 12×
revenue loss per line, silently. Add `NOT NULL CHECK (case_pack > 0)`, make the
field required, and replace the `|| 1` fallbacks with a hard error.

### P6 — Baseline the real schema (audit Part 13)
Do this early; it makes every later task cheaper and stops the next agent
reasoning from a repo that doesn't match production.

```bash
pg_dump --schema-only --no-owner --no-privileges "$SUPABASE_DB_URL" > supabase/schema-baseline.sql
```

`supabase/migrations/` is **not** authoritative: the RLS policies for ten
client-facing tables, every `storage.objects` policy, the money columns
themselves, and the bodies of `generate_sli_number()` and `is_admin()` exist only
in production or in deleted git history. This already caused one false-critical
in the first sweep. Add `backups/` to `.gitignore` before running anything that
dumps data.

### Answered — do not re-litigate
**DAM is deliberately open to every partner** (owner, 2026-08-02): distributors
should see the whole library so they can build campaigns. Audit 10.2 is resolved
as "not a defect", audit 3.8's blanket read on the asset tables is intentional,
`CLAUDE.md` has been corrected, and `company_dam_audiences` is confirmed dead and
can be dropped. **Do not restore per-company asset scoping.**

### Still open — needs a production query before WP2
Run the storage-policy queries (audit Part 10 preamble). No `storage.objects`
policy exists in any migration, so 10.1 (possible cross-company read of note
attachments) and 10.3 (possibly writable public image buckets) are **unconfirmed
reconstructions from deleted git history**:
```sql
select id, public, file_size_limit, allowed_mime_types from storage.buckets;
select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'storage';
```

### New work packages from the second sweep
- **WP8 — CI.** There is none. `next build`'s typecheck is the entire deploy
  safety net; the 15 Vitest files never run, and ESLint has no config file so it
  never runs either. Add a GitHub Action (`npm ci && npx tsc --noEmit && npm test`)
  and `.eslintrc.json`.
- **WP9 — Security headers.** No CSP, `X-Frame-Options`, or `Referrer-Policy`.
  The sharp edge is password-setup tokens leaking via `Referer`.
- **WP10 — Reporting definition.** Item-level revenue counts free support-fund
  goods while order-level revenue doesn't — a systematic 8–10% overstatement in
  every product/category view (audit 9.3). Decide the definition, then apply it
  to the four queries and `mv_product_sales`.
- **WP11 — SLI single renderer.** Preview (HTML) and download (react-pdf) are
  independent implementations that disagree on weight, checkboxes, address and
  export date. Render the preview from `SLIDocument` and delete
  `lib/sliGenerator.ts` — one change, four findings (audit 12.3).
- **WP12 — DR and ops hygiene.** `env.example` documents 13 of 30 variables;
  `backups/` is not gitignored while `dump.sh` defaults there; password-setup
  tokens are stored in plaintext while login codes are hashed; the
  `refresh-reports` cron has no failure alert.

## Scope and limits — read before treating this as a clean bill of health

This plan addresses what five specific audits found: duplicate UI flows, API auth
guards, the permission model, duplicated/dead code, and browser data-access
patterns. The findings are verified. **Coverage is the limitation, not accuracy.**

**Superseded by the second sweep — items 1–6 below have now been audited (see
Parts 8–12). Item 7 still stands: nothing has been verified at runtime.** The
list is kept because it records what the *first* sweep did not cover.

Not examined in the first sweep:

1. **Supabase Storage policies.** The audit covered table RLS, never
   `storage.objects`. `company-notes` is read directly from the browser
   (`app/components/shared/NotesView.tsx:190`), and order documents and DAM files
   also live in buckets. Whether those policies scope per company is unverified —
   exactly the class of bug that findings 3.1 and 3.8 turned out to be.
   `20260516120000_revoke_anon_and_bucket_listing.sql` only dropped listing on the
   two public image buckets.
2. **NetSuite integration correctness.** ~$2M/year flows through
   order → SO → invoice → reconcile. Audited only for auth guards; the logic was
   never reviewed, and `tests/` has nothing covering `push-so`, `create-invoice`,
   `sync-invoice` or `reconcile-order`.
3. **Stripe.** Same: guards only. Webhook idempotency, double-charge protection,
   refund/void handling — all unreviewed.
4. **The DAM upload pipeline** — S3 multipart flow, `supabase/functions/dam-upload`,
   `legacy/worker/`. Untouched.
5. **Order pricing and totals correctness**, beyond noticing the math is
   duplicated in three places. Nobody verified the numbers are right.
6. **Data integrity right now.** The bugs found imply damaged data nobody has
   counted: how many client rows currently have `permissions = '{}'`; how many
   companies were created without target periods; how many products were bulk
   imported without `qualifies_for_credit_earning`. See WP0.
7. **Runtime verification.** Everything here is read from source and from policy
   definitions. No finding was reproduced by logging in and performing the action.
   "The policy permits it" is not the same as "I demonstrated it."

**And one thing that is missing rather than broken: there is no error monitoring.**
No Sentry, Datadog, or equivalent in `package.json`. Several findings here
(the unauthenticated recalculate calls, the unchecked `updateUserById`, swallowed
history writes) share a shape: something fails, nothing is reported, and a wrong
number surfaces months later. That is what happened with the $265k order-history
bug in July. Fixing the individual instances doesn't fix the blindness — for a
system this size, adding error reporting is probably higher leverage than any
single item in WP5–WP7.

## WP0 — Count the damage before fixing the causes

Cheap, and it tells you how urgent the rest is. In the SQL editor:

```sql
select count(*) filter (where permissions = '{}') as clients_no_perms,
       count(*)                                   as clients_total
from public.clients where enabled = true;

select count(*) from public.companies c
where not exists (select 1 from public.target_periods t where t.company_id = c.id);

select count(*) filter (where category_id is null)                as no_category,
       count(*) filter (where qualifies_for_credit_earning is null) as no_credit_flag
from public."Products" where enable = true;
```

If the first query returns a large number, WP4.1 plus a backfill is the single
most urgent item in this document.

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

DAM (from audit 3.8–3.10 — these were confirmed after the first draft of this
plan):
- `dam_assets_read_authenticated` and the blanket-authenticated reads on
  `dam_asset_audience_map`, `dam_asset_locale_map`, `dam_asset_region_map`,
  `dam_asset_renditions`, `dam_asset_tag_map`, `dam_asset_versions` give **every
  logged-in user the entire asset catalogue plus the entitlement map**. Replace
  the asset/map policies with company-entitlement-scoped ones (reuse the logic in
  `list_client_dam_assets_entitled`), or drop client read entirely and keep DAM
  strictly API-mediated — the client Assets page already only uses the API, so
  dropping is low-risk and the safer default.
  Taxonomy tables (`dam_locales`, `dam_regions`, `dam_tags`, `dam_audiences`,
  `dam_asset_types`, `dam_asset_subtypes`) are lookup lists; blanket read there
  is defensible — decide explicitly rather than by accident.
- `dam_job_queue_read` is `USING (true)` with **no auth check at all**. Fix, and
  check `information_schema.role_table_grants` to see whether `anon` holds SELECT
  on it.
- All `dam_*_admin_full` policies call `is_admin()`, whose EXECUTE was revoked
  from `authenticated` (`20260514210000_lock_down_definer_functions.sql:16`) —
  they're inert for browser sessions. Standardise on `auth_is_admin()` (checks
  `enabled`, and `authenticated` can execute it) and retire `is_admin()`. Its
  body isn't in any migration; read it in the dashboard before deleting.
- `dam_download_events_user_insert` lets any authenticated user write arbitrary
  audit rows.

`orders` was verified clean — all five policies check `auth_company_id()` **and**
`auth_has_permission('orders')`. No change needed there.

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

## Open analysis

Both gaps from the first draft are **closed** — `orders` is clean, and the DAM
findings are written up as audit 3.8–3.10 and folded into WP2 above.

What remains unverified, all lower stakes:

1. **Client policy bodies on** `company_notes`, `note_attachments`,
   `company_territories`, `target_periods`, `highlighted_products`, `categories`,
   `incoterms`, `payment_terms` — do they check `enabled = true` and, where
   relevant, `visible_to_client`? Same query shape as the ones already run, with
   those table names.
2. **`anon` role SELECT grants.** `CLAUDE.md` records that anon has no DML on
   `public.*`, which doesn't cover SELECT. Given `dam_job_queue_read` is
   `USING (true)`, check:
   ```sql
   select table_name, privilege_type
   from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
   order by table_name;
   ```
3. **The body of `is_admin()`** — not in any migration; read it in the dashboard
   before retiring it, in case something else depends on its exact semantics.

## Suggested sequencing (updated after the second sweep)

**Session 1 — stop the bleeding.** P1 (account takeover, one line) → P2
(`next@14.2.35` + the three semver-compatible bumps + delete `nodemailer`) →
WP0 (count the damage) → P5 (`case_pack` constraint). All small, all independent,
all with active daily cost.

**Session 2 — the money path.** P3 (server-side price re-resolution in `push-so`)
→ P4 (the three Stripe fixes) → WP4.1 (users created with no permissions). Verify
each against a real test order before and after; nothing in this audit has been
reproduced at runtime.

**Session 3 — make the repo true.** P6 (schema baseline) → run the storage-policy
queries → WP2 (the RLS cleanup migration, now informed by both).

**Session 4 onwards — structure and prevention.** WP8 (CI) and WP9 (security
headers) first, because they stop regressions in everything above. Then WP3
(real permission enforcement), WP10 (reporting definition), WP11 (one SLI
renderer), WP5/WP6 (duplicate flows, dead code), WP12 (DR hygiene), WP7
(consistency debt).

Rules of thumb for whoever picks this up: ship code first and hand the owner any
SQL to run manually; keep `npx tsc --noEmit` and `npm test` green; never
`git add -A`; and verify against production before concluding anything about
schema or policies (Part 13).
