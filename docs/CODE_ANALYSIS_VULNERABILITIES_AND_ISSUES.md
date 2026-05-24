# Full Code Analysis: Vulnerabilities and Issues

**Date:** February 2025  
**Scope:** Qiqi Orders Next.js/Supabase application – full system sweep

---

## Executive Summary

This analysis identifies **security vulnerabilities**, **functional bugs**, and **performance issues** across the codebase. Findings are grouped by severity and domain.

---

## 1. Critical Security Vulnerabilities

### 1.1 Unauthenticated and Unauthorized API Routes

Many API routes use the Supabase service role key but **never validate that the requester is authenticated or authorized**. An attacker can call these endpoints directly.

| Route | Issue | Impact |
|-------|-------|--------|
| `POST /api/orders/auto-save-draft` | No auth | Anyone can create/update draft orders for any company/user by POSTing `user_id` and `company_id` |
| `DELETE /api/orders/delete?orderId=X` | No auth | Anyone can delete any Draft or Cancelled order |
| `GET/POST /api/user-profile` | No auth | GET: Anyone can fetch any user's profile by `userId`. POST: Creates a new admin if user not found |
| `POST /api/orders/send-email` | No auth | Anyone can trigger order emails |
| `POST /api/orders/send-notification` | No auth | Anyone can send notifications |
| `GET /api/reports/*` (sales, company-performance, etc.) | No auth | Anyone can export sensitive business data |
| `POST /api/target-periods/recalculate` | No auth | Anyone can trigger recalculation |
| `POST /api/feedback/submit` | No auth | Acceptable for public feedback, but no rate limiting – spam risk |

**Recommendation:** Add authentication (and authorization where relevant) to all sensitive routes. Use `createAuth().requireRole(request, 'admin')` or `getUserFromRequest` and validate resource access (e.g., order belongs to user’s company).

### 1.2 Middleware Does Not Enforce Auth

[middleware.ts](app/../middleware.ts) only calls `supabase.auth.getSession()` to refresh the session. It does **not** block unauthenticated requests. Pages rely on layout-level redirects, but API routes have no shared auth gate.

**Recommendation:** Either enforce auth in middleware for protected routes, or ensure every API route performs its own auth check.

### 1.3 User Profile API – Critical

[app/api/user-profile/route.ts](app/api/user-profile/route.ts):

- **GET**: Returns any user’s profile given `userId` – no auth, no validation.
- **POST**: If the user is not found in admins or clients, it **creates a new admin** with `{ id: userId, email, name, enabled: true }`. No auth. An attacker could create admin records for arbitrary user IDs.

**Recommendation:** Require authentication. GET should only allow a user to fetch their own profile, or require admin role. POST auto-creation of admins should be removed or strictly gated.

---

## 2. Order Documents – Client Cannot Download

### Root Cause

[app/components/shared/OrderDocumentsView.tsx](app/components/shared/OrderDocumentsView.tsx) uses the **client-side Supabase client** to call:

```ts
supabase.storage.from('order-documents').createSignedUrl(document.file_path, 3600)
```

The Supabase Storage bucket `order-documents` is subject to **Row Level Security (RLS)**. The signed URL is created with the **logged-in user’s JWT**. If the bucket policy only allows admins (or specific roles) to read, clients will receive 403 or similar errors when creating signed URLs.

### Fix

Introduce an API route, e.g. `GET /api/orders/[id]/documents/[docId]/signed-url`, that:

1. Authenticates the user.
2. Verifies the user can access the order (admin, or client with order in their company).
3. Uses the **service role** to create a signed URL.
4. Returns the URL to the client.

The UI would call this API instead of using storage directly.

### File Path Consistency

- Upload: `filePath = order-documents/${orderId}/${fileName}` 
- Bucket: `order-documents`
- Path stored in DB: `order-documents/...` – confirm this matches what the bucket expects (path vs. object key).

---

## 3. Digital Asset Manager – Filters Not Working Reliably

### 3.1 Client-Side Filters vs. Pagination

**Admin DAM** ([app/admin/dam/page.tsx](app/admin/dam/page.tsx) ~lines 907–930):

- API returns a paginated set (e.g. 50 assets) filtered by search, date, file size.
- Additional filters (type, locale, region, tag, product line) are applied **client-side** in `useMemo`.
- `totalPages` and pagination state come from the API’s total count, which does **not** account for these client-side filters.
- Result: Incorrect totals, empty pages, filters appearing to do nothing when the current page has no matches.

**Client DAM** ([app/api/dam/assets/client/route.ts](app/api/dam/assets/client/route.ts) ~lines 249–275):

- SQL applies: search, type, assetType, assetSubtype, productLine, productName.
- **Locale, region, tag** are applied **client-side** after fetching.
- Pagination and `total` are computed before locale/region/tag filtering.
- Same symptom: pagination and totals do not reflect the final filtered set.

**Recommendation:** Move all filters into the API/SQL so that `total` and `page` are consistent with the final filtered result.

### 3.2 Possible Schema Mismatch – dam_asset_audience_map

Client assets route queries `dam_asset_audience_map` and `dam_audiences`. The admin route comments that "Audience removed - no longer used." If these tables were removed or renamed, the client route will fail when querying them.

**Recommendation:** If audience is deprecated, remove those queries from the client route. Otherwise, ensure the schema matches.

---

## 4. Digital Asset Manager – Performance (Very Slow)

### 4.1 N+1 Query Pattern

Both [app/api/dam/assets/route.ts](app/api/dam/assets/route.ts) and [app/api/dam/assets/client/route.ts](app/api/dam/assets/client/route.ts) use:

```ts
for (const asset of assetsData) {
  const version = await fetchLatestVersion(asset.id);
  versionsByAsset.set(asset.id, version);
}
```

For 50 assets this triggers 50 sequential database calls.

**Recommendation:** Fetch all latest versions in one go, e.g.:

- `Promise.all(assetsData.map(a => fetchLatestVersion(a.id)))`, or
- A single query joining `dam_assets` and `dam_asset_versions` with a subquery/LATERAL for the latest version.

### 4.2 Redundant Asset Fetches in Download Route

[app/api/assets/[id]/download/route.ts](app/api/assets/[id]/download/route.ts) fetches the asset multiple times (lines 91–113, 115–137, 142–146) with different selects.

**Recommendation:** Use one query with all required columns.

### 4.3 In-Memory Filtering Instead of SQL

- **fileSizeMin / fileSizeMax**: Applied in memory after fetching all versions. Should be pushed into SQL (e.g. via a join on `dam_asset_versions` or a subquery).
- **extracted_text** search: Done in memory. Consider full-text search or SQL `ILIKE` if the column exists and is indexed.

### 4.4 Lookup Tables – No Pagination

[app/api/dam/lookups/route.ts](app/api/dam/lookups/route.ts) loads all tags, locales, regions, asset types, subtypes, products, product lines in one shot. As data grows, this can slow startup and filter dropdowns.

**Recommendation:** Add pagination or lazy loading for large lookup tables, or cache them with a short TTL.

---

## 5. Orders Domain – Additional Issues

### 5.1 Order Delete – No Authorization

[app/api/orders/delete/route.ts](app/api/orders/delete/route.ts) accepts `orderId` and `userRole` from the query string but **never validates** the caller. It only checks that the order status is Draft or Cancelled.

- A client could delete another company’s draft.
- Any unauthenticated caller could delete drafts/cancelled orders.

**Recommendation:** Authenticate the request, then verify the user is allowed to delete this order (e.g. admin, or client whose company owns the order).

### 5.2 Orders List – Draft Display Logic

Previous analysis noted that the admin orders list should always show Draft orders. Verify in [app/components/shared/OrdersListView.tsx](app/components/shared/OrdersListView.tsx) that the current filter logic matches this requirement.

---

## 6. Error Handling and User Feedback

### 6.1 Silent Failures

Many `catch` blocks only `console.error` without surfacing errors to the user:

- [app/components/shared/OrderDocumentsView.tsx](app/components/shared/OrderDocumentsView.tsx): `getDocumentUrl` throws; callers set `setError(...)` – acceptable.
- Order creation, draft auto-save, and other flows often swallow errors and never show a toast or inline message.

**Recommendation:** For user-facing actions, show a clear error message (toast, inline alert) instead of failing silently.

### 6.2 Inconsistent Status Handling

Order statuses (`Draft`, `Open`, `In Process`, `Ready`, `Done`, `Cancelled`) are used in multiple places. Ensure enums or constants are used consistently to avoid typos and drift.

---

## 7. Input Validation and Injection Risks

### 7.1 Search and Filter Inputs

Some routes embed user input directly in Supabase filters, e.g.:

- [app/api/admin/tags/route.ts](app/api/admin/tags/route.ts): `query.or(\`label.ilike.%${search}%,slug.ilike.%${search}%\`)`
- DAM routes: `searchTerm`, `productLineFilter`, etc. interpolated in `.or()` / `.ilike()`

Supabase client usually parameterizes values, but special characters (`%`, `_`, `'`, `\`) can still affect behavior (e.g. unexpected wildcards).

**Recommendation:** Sanitize or escape special characters in search and filter inputs, or use parameterized patterns.

### 7.2 Order ID and Document Path Validation

Validate that `orderId` and `documentId` (and similar IDs) are valid UUIDs before using them in queries to reduce risk of malformed input.

---

## 8. Data Consistency and RLS

### 8.1 Order Documents Table vs. Storage

- Table: `order_documents` 
- Bucket: `order-documents`

Ensure RLS on `order_documents` restricts rows by order access (e.g. company membership). Storage access should align with this (either via RLS or via the proposed server-side signed-URL API).

### 8.2 Order Access for Clients

Client order fetches should always filter by `company_id` matching the client’s company. Verify this is enforced in:

- Order list
- Order detail
- Order documents
- Any order-related APIs used by the client

---

## 9. Summary – Prioritized Fixes

| Priority | Issue | Action |
|----------|-------|--------|
| P0 | Unauthenticated APIs (auto-save-draft, delete, user-profile, send-email, reports) | Add auth and authorization to all sensitive routes |
| P0 | User profile POST creating admins | Remove or strictly gate; require auth |
| P0 | Client cannot download order documents | Add server-side signed-URL API with access check |
| P1 | Order delete no authorization | Verify caller can delete the order |
| P1 | DAM filters inconsistent with pagination | Move locale/region/tag filters into API/SQL |
| P1 | DAM N+1 version fetch | Batch version fetches |
| P2 | DAM redundant asset fetches in download route | Consolidate to one query |
| P2 | DAM file size and extracted_text filters | Push to SQL where possible |
| P2 | Error handling and user feedback | Surface errors instead of silent failure |
| P3 | Search input sanitization | Sanitize or parameterize search strings |
| P3 | Lookup pagination/caching | Optimize for large datasets |

---

## 10. Files to Modify (High Level)

- **Auth:** `middleware.ts`, new shared auth helper, or per-route checks
- **Order documents:** New `GET /api/orders/[id]/documents/[docId]/signed-url`, update `OrderDocumentsView`
- **Orders delete:** `app/api/orders/delete/route.ts` – add auth and company/role checks
- **Auto-save draft:** `app/api/orders/auto-save-draft/route.ts` – require auth and validate `user_id` matches token
- **User profile:** `app/api/user-profile/route.ts` – require auth, restrict GET/POST logic
- **Reports:** All report routes – add admin-only auth
- **DAM:** `app/api/dam/assets/route.ts`, `app/api/dam/assets/client/route.ts` – fix N+1, move filters to SQL, fix audience usage if deprecated

---

*This document is for analysis only. Implement fixes in a controlled way with tests and staging validation.*
