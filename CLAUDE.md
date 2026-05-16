# Qiqi Orders — Agent Briefing

B2B order management portal for Qiqi Global. Next.js 14 App Router, Supabase (Postgres + Auth), Microsoft Graph for outbound email, AWS S3 for DAM files, planned NetSuite integration.

## Audiences

- **Admin** — Qiqi staff. Full CRUD on companies, users, products, orders, DAM. Uses `/admin/*`.
- **Client** — partner/customer users scoped to a single company. Uses `/client/*`. Can create/edit own orders, browse DAM assets entitled to their company, view their company's notes.

## Auth & role model

- `auth.users` (Supabase Auth) holds credentials.
- A user is an **admin** iff a row in `public.admins` has matching `id` and `enabled = true`.
- A user is a **client** iff a row in `public.clients` has matching `id` and `enabled = true`. Their `company_id` scopes everything.
- The same auth user can technically be in both tables (test setups), but production users should be one or the other.
- Guards live in `platform/auth/guards.ts`: `requireAdmin`, `requireClient`, `requireAuthenticatedUser`, `createServiceRoleClient`.
- Browser stores the access token in **localStorage** (not cookies). Server-side route handlers must read the token from the `Authorization: Bearer` header — **plain `fetch` from the browser will fail "Not authenticated"**.
  - **Always use `lib/fetchWithAuth.ts`** for browser → protected API route calls.

## RLS posture (Tier 1 overhaul, May 2026)

Helpers in DB:

- `auth_is_admin()` — SECURITY DEFINER, true if caller is in `admins.enabled=true`. Used in admin gates.
- `auth_company_id()` — SECURITY DEFINER, returns caller's `clients.company_id`. Used to scope client access.

Policies (admin = full CRUD on every table; client rules below):

| Table | Client SELECT | Client write |
|---|---|---|
| `admins` | none | none |
| `clients` | own row + same-company rows | none (admin-managed) |
| `companies` | own company | none |
| `orders` | own company | INSERT/UPDATE if status in (`Draft`,`Open`); DELETE only if `status='Draft'` |
| `order_items` | parent order in own company | CRUD when parent order is own-company AND status in (`Draft`,`Open`) |
| `Products` | all (catalog) | none |
| `Locations`, `classes`, `subsidiaries`, `support_fund_levels` | only the row linked to client's company via `companies.{location_id,class_id,subsidiary_id,support_fund_id}` | none |
| `note_replies` | admin-only | admin-only |
| `client_note_views` | own rows; admin sees all | own rows only |

Notes:

- Server-side routes use `createServiceRoleClient()` which **bypasses RLS** — RLS only protects the browser-direct query surface.
- Admin-created orders display **"Qiqi"** as creator everywhere; client-created orders show the client name. Lookup pattern: try `clients.id = order.user_id`; if not found → "Qiqi". See `OrdersListView.tsx` and `OrderDetailsView.tsx`.

## Order lifecycle

- Client buttons: **Create Order** (→ `status='Open'`), **Save as Draft** (→ `status='Draft'`), **Cancel** (discard).
- Drafts: both admin and client can read, edit (save as draft or promote to Open), and delete.
- Open: admin and client can edit. **Only admins can delete or move past Open.**
- Past Open (`Processing`, `Done`, etc.): client read-only.

## Email / files / integrations

- Outbound mail goes through Microsoft Graph (`lib/emailService.ts`). Sender is locked to `orders@qiqiglobal.com`.
- HTML email bodies must HTML-escape every user-supplied field — use `lib/htmlEscape.ts`. Header fields (subject) must also strip CR/LF.
- DAM uses AWS S3. Storage path: `{assetId}/{timestamp}-{sanitizedFileName}`. Filename sanitization lives inline in `app/api/dam/assets/init/route.ts`.
- NetSuite (`lib/netsuite.ts`) — scaffolding exists but **nothing is wired up yet**. This is the next major feature.

## Workflow conventions (project owner's preferences)

- The owner uses `main` only (skips a Staging branch). **Direct pushes to main are expected.**
- Vercel auto-deploys on push to main.
- SQL migrations live in `supabase/migrations/`. The owner **runs them manually** in the Supabase SQL editor — there's no `supabase db push` step in the deploy pipeline. **Always: push code first, then user applies SQL** (so the deployed code is ready when the schema changes).
- Commits use Conventional-Commit-ish prefixes (`fix:`, `migration:`, `test:`, etc.) and a `Co-Authored-By: Claude` trailer.
- After significant changes, the owner smoke-tests in production manually. Tests via `npm test` (Vitest) supplement, not replace, manual checks.

## Security / advisor state (as of May 2026)

- 0 advisor errors. 48 warnings remaining, all `pg_graphql_authenticated_table_exposed` + the two `authenticated_security_definer_function_executable` on our `auth_*` helpers. **Accepted as inherent to the Supabase + RLS pattern** — fixing them would require moving every browser-side Supabase call to a server-side API route.
- HaveIBeenPwned leaked password check is enabled in the dashboard.
- Anonymous role has zero DML privileges on `public.*` tables.
- The 4 internal DEFINER functions (`auth_is_admin`, `auth_company_id`, `create_client_profile`, `delete_user_cascade`, `list_client_dam_assets_entitled`) are locked to `service_role` (+ `authenticated` for the two `auth_*` helpers used inside policies).

## Tests

- Vitest configured. `npm test` runs all in ~200ms. 22 tests as of May 2026.
- Covered: `htmlEscape`, `rateLimit` (incl. fail-closed regression), rate-limit helpers, `orderHistory` audit log.
- **Add tests for new server-side logic, especially NetSuite sync paths** (external API → exactly the kind of code that benefits most from automated coverage).
- Path alias: import production code as `@/lib/...` / `@/platform/...`.
- Mock helpers: `tests/helpers/mockSupabase.ts`.

## Known long files (do not split preemptively)

The owner explicitly decided not to refactor monster files until there's concrete need:

- `app/admin/dam/page.tsx` (~3,900 LOC)
- `app/components/shared/PackingSlipView.tsx` (~1,450)
- `app/components/shared/OrderFormView.tsx` (~1,430)
- `app/components/shared/OrderDetailsView.tsx` (~1,350)
- `app/admin/companies/[id]/edit/page.tsx` (~1,280)

When adding features that touch these, prefer extracting **the new code** as a sibling component rather than rewriting the host file. Don't propose a refactor unless it's clearly required for the feature.

## Architectural rules of thumb

- Service-role key is **server-only**, never imported into a `'use client'` file.
- Don't introduce SECURITY DEFINER views (advisor flags them). Use a SECURITY DEFINER function instead if needed, and lock down `EXECUTE` from `anon` (and `authenticated` if not needed for RLS).
- New tables: enable RLS on creation and add policies in the same migration. Don't ship a table with no policies and `RLS enabled` — it'll appear to "work" via service_role but break under any direct client query.
- New `SECURITY DEFINER` functions: `SET search_path = public, pg_catalog` and `REVOKE EXECUTE FROM PUBLIC, anon` (and from `authenticated` unless policies need it).
