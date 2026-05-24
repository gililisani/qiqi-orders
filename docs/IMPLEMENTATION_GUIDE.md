# Implementation Guide: Concrete Steps and Patches

This document provides step-by-step instructions and code patches to fix the issues identified in `CODE_ANALYSIS_VULNERABILITIES_AND_ISSUES.md`. Implement in order of priority.

---

## Patch 1: Add Auth to Auto-Save Draft API (P0)

**File:** `app/api/orders/auto-save-draft/route.ts`

**Step 1.1** – Add auth and validate `user_id` matches the authenticated user.

At the top of the file, add the createAuth import:

```ts
import { createAuth } from '../../../../platform/auth';
```

**Step 1.2** – Immediately after the `try {` in `POST`, add auth and validation:

```ts
export async function POST(request: NextRequest) {
  try {
    const auth = createAuth();
    const user = await auth.getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Handle both JSON and Blob (from sendBeacon)
    let body: any;
    // ... rest of existing code ...
```

**Step 1.3** – After parsing `orderData`, enforce that `orderData.user_id` matches the authenticated user:

```ts
    if (!orderData || !orderData.company_id || !orderData.user_id) {
      // ... existing validation ...
    }

    if (orderData.user_id !== user.id) {
      return NextResponse.json(
        { error: 'user_id does not match authenticated user' },
        { status: 403 }
      );
    }

    // Clients can only save drafts for their own company
    if (user.roles.includes('client') && !user.roles.includes('admin')) {
      const { data: clientData } = await createClient(supabaseUrl, supabaseServiceKey)
        .from('clients')
        .select('company_id')
        .eq('id', user.id)
        .single();
      if (!clientData || clientData.company_id !== orderData.company_id) {
        return NextResponse.json({ error: 'Cannot save draft for another company' }, { status: 403 });
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

You’ll need to use the Supabase client for the clients lookup (create it once at the top of the handler or reuse the existing one after it’s created).

---

## Patch 2: Add Auth and Authorization to Order Delete API (P0)

**File:** `app/api/orders/delete/route.ts`

**Step 2.1** – Add auth import at top:

```ts
import { createAuth } from '../../../../platform/auth';
```

**Step 2.2** – At the start of the `DELETE` handler, after validating `orderId`:

```ts
export async function DELETE(request: NextRequest) {
  try {
    const auth = createAuth();
    const user = await auth.getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const userRole = searchParams.get('userRole');
    // ... existing validation ...
```

**Step 2.3** – After fetching the order and checking status, add authorization:

```ts
    if (order.status !== 'Cancelled' && order.status !== 'Draft') {
      return NextResponse.json(/* existing ... */);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (order.status === 'Cancelled' && !user.roles.includes('admin')) {
      return NextResponse.json(
        { error: 'Only admins can delete cancelled orders' },
        { status: 403 }
      );
    }

    if (order.status === 'Draft') {
      const isAdmin = user.roles.includes('admin');
      if (!isAdmin) {
        const { data: clientData } = await supabase
          .from('clients')
          .select('company_id')
          .eq('id', user.id)
          .single();
        if (!clientData || clientData.company_id !== order.company_id) {
          return NextResponse.json(
            { error: 'Cannot delete draft for another company' },
            { status: 403 }
          );
        }
      }
    }

    // ... rest of delete logic (order needs company_id in select)
```

**Step 2.4** – Ensure the initial order fetch includes `company_id`:

```ts
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status, company_id')
      .eq('id', orderId)
      .single();
```

---

## Patch 3: Order Document Signed URL API + Client Fix (P0)

**Step 3.1** – Create a new API route.

**New file:** `app/api/orders/[id]/documents/[docId]/signed-url/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../../../../platform/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; docId: string } }
) {
  try {
    const orderId = params.id;
    const docId = params.docId;

    if (!orderId || !docId) {
      return NextResponse.json({ error: 'Missing orderId or docId' }, { status: 400 });
    }

    const auth = createAuth();
    const user = await auth.getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, company_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (user.roles.includes('admin')) {
      // Admin can access any order
    } else if (user.roles.includes('client')) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('company_id')
        .eq('id', user.id)
        .single();
      if (!clientData || clientData.company_id !== order.company_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: doc, error: docError } = await supabase
      .from('order_documents')
      .select('id, file_path')
      .eq('id', docId)
      .eq('order_id', orderId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const { data: urlData, error: urlError } = await supabase.storage
      .from('order-documents')
      .createSignedUrl(doc.file_path, 3600);

    if (urlError || !urlData?.signedUrl) {
      return NextResponse.json(
        { error: 'Failed to generate signed URL', details: urlError?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: urlData.signedUrl });
  } catch (err: any) {
    console.error('Signed URL error:', err);
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
```

**Step 3.2** – Update OrderDocumentsView to use the new API.

**File:** `app/components/shared/OrderDocumentsView.tsx`

Replace `getDocumentUrl` with an API call. You need the session token. Add at the top:

```ts
// Add to imports if not present
import { useSupabase } from '../../../lib/supabase-provider';
```

Replace `getDocumentUrl`:

```ts
  const getDocumentUrl = async (document: OrderDocument): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }
    const res = await fetch(
      `/api/orders/${orderId}/documents/${document.id}/signed-url`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to get document URL');
    }
    const { url } = await res.json();
    return url;
  };
```

The rest of `handleViewDocument` and `handleDownloadDocument` stay the same; they already use `getDocumentUrl`.

---

## Patch 4: Add Auth to User Profile API (P0)

**File:** `app/api/user-profile/route.ts`

**Step 4.1** – Add auth and restrict GET to own profile or admin:

```ts
import { createAuth } from '../../../../platform/auth';

// In GET handler, at the start:
const auth = createAuth();
const user = await auth.getUserFromRequest(request);
if (!user) {
  return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}
// Only allow fetching own profile, or admin can fetch any
if (userId !== user.id && !user.roles.includes('admin')) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
```

**Step 4.2** – Remove auto-creation of admins in POST. Replace the “user not found” path with:

```ts
    console.log('User not found in either table');
    return NextResponse.json(
      { error: 'User profile not found. User must be created via admin user management.' },
      { status: 404 }
    );
```

And require that the POST caller is an admin creating/syncing a user. Add auth at the start of POST:

```ts
const auth = createAuth();
await auth.requireRole(request, 'admin');
// ... then existing logic, but remove the auto-insert into admins
// Return 404 if user not in admins or clients
```

---

## Patch 5: Add Auth to Reports, Send-Email, and Related Routes (P0)

**Pattern for all:** At the start of the handler, add:

```ts
import { createAuth } from '../../../../platform/auth';

// In handler:
const auth = createAuth();
await auth.requireRole(request, 'admin');
```

**Files to update:**
- `app/api/reports/sales/route.ts`
- `app/api/reports/company-performance/route.ts`
- `app/api/reports/company-goals/route.ts`
- `app/api/reports/performances/route.ts`
- `app/api/reports/product-sales/route.ts`
- `app/api/orders/send-email/route.ts`
- `app/api/orders/send-notification/route.ts`
- `app/api/target-periods/recalculate/route.ts`

For POST routes, use `requireRole`. For GET routes, use the same. Wrap in try/catch and return the `NextResponse` if `requireRole` throws.

---

## Patch 6: Fix DAM N+1 Version Fetch (P1)

**File:** `app/api/dam/assets/route.ts`

**Replace** the sequential loop with parallel fetches:

```ts
    const versionsByAsset = new Map<string, any>();
    const versionResults = await Promise.all(
      assetsData.map((asset) => fetchLatestVersion(asset.id))
    );
    assetsData.forEach((asset, i) => {
      const v = versionResults[i];
      if (v) versionsByAsset.set(asset.id, v);
    });
```

**File:** `app/api/dam/assets/client/route.ts`

Apply the same change: replace the `for` loop with `Promise.all` + `forEach`.

---

## Patch 7: Move DAM Filters into API (Client Route) (P1)

**File:** `app/api/dam/assets/client/route.ts`

Locale, region, and tag are currently applied in memory. To fix pagination correctly, they must be applied in SQL.

**Option A – Join through mapping tables (if schema supports):**

After building the base `assetsQuery`, add:

```ts
if (localeFilter) {
  const { data: localeAssetIds } = await supabaseAdmin
    .from('dam_asset_locale_map')
    .select('asset_id')
    .eq('locale_code', localeFilter);
  const ids = (localeAssetIds || []).map((r) => r.asset_id);
  if (ids.length > 0) {
    assetsQuery = assetsQuery.in('id', ids);
  } else {
    assetsQuery = assetsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
  }
}
if (regionFilter) {
  const { data: regionAssetIds } = await supabaseAdmin
    .from('dam_asset_region_map')
    .select('asset_id')
    .eq('region_code', regionFilter);
  const ids = (regionAssetIds || []).map((r) => r.asset_id);
  if (ids.length > 0) {
    assetsQuery = assetsQuery.in('id', ids);
  } else {
    assetsQuery = assetsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
  }
}
if (tagFilter) {
  const { data: tagRows } = await supabaseAdmin
    .from('dam_tags')
    .select('id')
    .or(`label.ilike.%${tagFilter}%,slug.ilike.%${tagFilter}%`);
  const tagIds = (tagRows || []).map((r) => r.id);
  if (tagIds.length > 0) {
    const { data: tagMapRows } = await supabaseAdmin
      .from('dam_asset_tag_map')
      .select('asset_id')
      .in('tag_id', tagIds);
    const ids = [...new Set((tagMapRows || []).map((r) => r.asset_id))];
    if (ids.length > 0) {
      assetsQuery = assetsQuery.in('id', ids);
    } else {
      assetsQuery = assetsQuery.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }
}
```

Then remove the client-side filter block (lines ~249–275).

**Option B – Keep client-side filters but fix totals:**  
Fetch all matching assets with a higher limit (or no limit) when locale/region/tag filters are set, then paginate in memory. Simpler but can be slow for large datasets. Prefer Option A.

---

## Patch 8: Remove or Guard dam_asset_audience_map (P1)

**File:** `app/api/dam/assets/client/route.ts`

If `dam_asset_audience_map` and `dam_audiences` are deprecated:

- Remove the query to these tables.
- Remove `audiencesByAsset` and any reference to `audiences` in the response.
- If the table might not exist, wrap the audience query in try/catch and default to `{}` on error.

---

## Patch 9: Consolidate Asset Fetches in Download Route (P2)

**File:** `app/api/assets/[id]/download/route.ts`

Replace multiple asset fetches with a single query:

```ts
const { data: asset, error: assetError } = await supabaseAdmin
  .from('dam_assets')
  .select('id, title, is_archived, use_title_as_filename')
  .eq('id', version.asset_id)
  .maybeSingle();
```

Use this result for:
- existence check
- `asset.id !== params.id`
- `asset.is_archived`
- `useTitleAsFilename`

Remove the duplicate fetches and the try/catch fallback for `use_title_as_filename` if the column exists in your schema.

---

## Patch 10: Shared Auth Helper (Optional)

To reduce duplication, create a small helper:

**New file:** `lib/api-auth.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAuth } from '../platform/auth';
import type { AuthUser } from '../platform/auth';

export async function requireAdmin(request: NextRequest): Promise<AuthUser> {
  const auth = createAuth();
  return auth.requireRole(request, 'admin');
}

export async function requireAuth(request: NextRequest): Promise<AuthUser> {
  const auth = createAuth();
  const user = await auth.getUserFromRequest(request);
  if (!user) {
    throw NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return user;
}
```

Then in routes, replace `createAuth()` + `requireRole` with:

```ts
import { requireAdmin } from '../../../lib/api-auth';
// ...
const user = await requireAdmin(request);
```

---

## Testing Checklist

After applying patches:

1. **Auto-save draft:** Add items, close tab – draft should save. Unauthenticated POST should return 401. POST with another user’s `user_id` should return 403.
2. **Order delete:** As client, delete only own company’s draft. As admin, delete any draft/cancelled. Unauthenticated should get 401.
3. **Order documents:** As client, view/download documents on an order for your company. As client for another company, should get 403 on the signed-url API.
4. **User profile:** GET own profile works. GET another user’s profile as non-admin returns 403. POST no longer creates random admins.
5. **Reports:** Unauthenticated GET returns 401. Admin GET returns data.
6. **DAM:** Filters and pagination behave correctly. Asset list loads faster with the N+1 fix.

---

## Rollout Order

1. Patch 1 (auto-save-draft) – High impact, low risk.
2. Patch 4 (user-profile) – Critical security.
3. Patch 2 (order delete) – High impact.
4. Patch 3 (documents signed-url) – Fixes client downloads.
5. Patch 5 (reports, send-email, etc.) – Broad coverage.
6. Patch 6 (DAM N+1) – Performance.
7. Patches 7–9 – DAM filters and download route.

Implement incrementally and verify each patch before moving to the next.
