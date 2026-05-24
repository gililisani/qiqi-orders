# Redesign handoff

You (Claude Opus 4.7 in Cursor) are picking up the qq design-system rollout for Qiqi Partners Hub. This doc tells you what's done, what's still on the old style, and the conventions to follow so you don't break the patterns already in place.

**Read `CLAUDE.md` first** — that covers the project basics (Supabase, auth model, RLS, workflow, owner preferences). This file only covers redesign-specific state.

---

## TL;DR — what's left

**Mostly polish on `/admin/dam`:**

1. Bulk-actions bar (blue strip above the grid when tiles are selected) + the "Select all" tickbox row → small surfaces, easy
2. Upload drawer (slide-over from right when clicking "Upload asset") → single-asset upload form, sizable
3. Edit Asset modal (clicking Edit on a tile) → sibling to upload drawer
4. `app/components/dam/BulkUploadCard.tsx` form body → the expanded fields per card inside Bulk Upload / Bulk Edit panels. Icons are already lucide; only the form fields need a qq pass.

**Larger items deferred indefinitely (waiting on something else):**

- `/admin/inventory` — DAM-style page, but the NetSuite inventory sync underneath is broken. Fix sync first, then style.
- `/admin/reports` — needs rebuild, not just restyle.
- `app/components/shared/NoteForm.tsx` — functional, isolated modal used inside NotesView. Convert to qq Dialog whenever.

**Everything else is done.**

---

## Design system at a glance

### Where the qq primitives live

`app/components/qq/` — treat these as the source of truth:

| Primitive | What to reach for |
|---|---|
| `page-header` | Top of every page. Has `title`, `description`, `actions` props. |
| `card`, `card-header`, `card-content`, `card-title` | All boxes. The old `app/components/ui/Card` (with a `header` prop) is dead; do not import it. |
| `button` | All buttons. Variants: default, outline, ghost, secondary, accent, destructive. Has `loading` prop. |
| `input`, `label` | Form fields. Pair with `form-field` for label+helper layout. |
| `select` (Radix-based) | All dropdowns. **Avoid `value=""`** — Radix complains. Use a sentinel like `__all__` or `__none__` and convert at the boundary. See `FilterSelect` patterns in `/client/assets` and `/admin/dam`. |
| `dialog` | All modals. Use `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`. |
| `sheet` | Side drawers (mobile nav, slide-overs). |
| `tabs` | Tab navigation. |
| `table` | Tabular data. |
| `badge` | Status pills. Variants: default, secondary, outline, accent (periwinkle), destructive (magenta), success (emerald), warning (amber), muted. |
| `status-badge` | Order statuses specifically. |
| `support-fund-badge` | SF % tags. |
| `pagination` | Page navigation + page-size selector. |
| `empty-state` | When a list has nothing. |
| `alert`, `alert-description` | Inline errors / info banners. |
| `separator` | Hairline dividers. |
| `dropdown-menu` | Row-action menus (the `⋯` button). |
| `avatar` | User avatars. |
| `tooltip` | Hover tooltips. |
| `skeleton` | Loading placeholders. |
| `brand`, `topbar`, `sidebar`, `app-shell` | Layout chrome. Already wired into admin + client layouts. |

### Tokens

Use semantic Tailwind tokens, not raw colors:

| Use | Class |
|---|---|
| Page background | `bg-background` (or just inherit) |
| Card / surface | `bg-background` with `border-border` |
| Muted surface | `bg-muted/40` or `bg-muted/30` |
| Body text | `text-foreground` |
| Secondary text | `text-muted-foreground` |
| Brand purple (active, accent badges) | `text-brand-periwinkle` / `bg-brand-periwinkle/10` |
| Brand pink (destructive, balance owing) | `text-brand-magenta` / `bg-brand-magenta/10` |
| Success | `text-green-700` / `bg-green-50` (do NOT use `emerald-500` — JIT-purges; use `green-500` for dots) |
| Destructive | `text-destructive` / `bg-destructive/10` |

### Helpers built during this redesign

- `app/components/admin/AdminListPage.tsx` — generic admin list with search + table + dropdown actions. Used by 7+ admin lookup pages.
- `app/components/admin/AdminFormShell.tsx` — page chrome for admin create/edit forms (back link, header, error alert, Save/Cancel bar).
- `app/components/admin/CategoryFormFields.tsx`, `ProductFormFields.tsx`, `SLIFormFields.tsx` — shared form-body components for create/edit pairs.
- `app/components/client/Client*View.tsx` — forked from the legacy shared/Order* files. Admin has its own `Admin*View.tsx` equivalents.

### Feedback utilities

- `useToast()` from `app/components/ui/ToastProvider` — `toast.success(msg)`, `toast.error(msg)`. Replace every `alert()`.
- `useConfirm()` from `app/components/ui/ConfirmProvider` — `await confirm({ title, description, variant: 'danger', confirmLabel })`. Replace every `window.confirm()`.

---

## Conventions to follow

### Page structure

```tsx
<div className="px-6 py-8 space-y-6">
  {/* Optional back link */}
  <div>
    <Link href="..." className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
      <ArrowLeft className="h-4 w-4 mr-1" /> Back
    </Link>
  </div>

  <PageHeader title="…" description="…" actions={<>…</>} />

  {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

  {/* Content cards */}
</div>
```

### Auth — **don't get bitten**

The bearer token lives in **localStorage**, not cookies. Every browser → protected API call MUST go through `lib/fetchWithAuth.ts`. Plain `fetch()` to `/api/…` will fail with "Not authenticated". This has bitten us in:

- SLI pages (fixed)
- FeedbackPopup (fixed)
- sync-check (then deleted — was misleading)

Pattern:
```ts
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
const res = await fetchWithAuth('/api/...', { method: 'POST', headers: {...}, body: ... });
```

`fetchWithAuth` works with `FormData` too — don't set Content-Type manually for multipart, the browser handles it.

### Fork vs. convert in place

- **Fork** when admin and client need to diverge meaningfully → see `AdminOrderFormView` vs the eventual `ClientOrderFormView` (we did both).
- **Convert in place** when the component is purely visual and shared cleanly (e.g. `NotesView`, `PackingSlipView`, `AssetCard`, `AssetDetailModal`).
- **Promote to qq** when it's a pure primitive nobody owns yet.

When forking, leave the original alive until the other surface is also forked. Then delete the original.

### Don't split monster files preemptively

The owner's explicit preference (in `CLAUDE.md`). Files >1000 LOC that we kept whole:

- `app/components/admin/AdminOrderFormView.tsx`
- `app/components/admin/AdminOrderDetailsView.tsx`
- `app/admin/dam/page.tsx` (3,905 LOC — only chrome was converted; deeper modals/forms inside still old-style)
- `app/components/shared/PackingSlipView.tsx`

When touching these, do surgical edits (find/replace the chrome, replace heroicons with lucide, swap Card imports). Don't try to extract them into smaller components unless absolutely needed.

---

## Commit + push cadence

Direct to `main`. Vercel auto-deploys. No staging branch.

```
git add <specific files>
git commit -m "$(cat <<'EOF'
feat(design): <area> — <what>

<2–3 sentence explanation>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin HEAD:main
```

**Always typecheck before pushing:**
```
npx tsc --noEmit 2>&1 | head -20
```

If it returns no output, you're clean.

**SQL migrations** live in `supabase/migrations/`. The owner applies them manually in the Supabase SQL editor. Don't try to run `supabase db push`. Order: push code first, then tell the user to apply the migration.

---

## Quick gotchas worth knowing

1. **Tailwind JIT purges** unused color shades. `bg-emerald-500` got purged once; we swapped to `bg-green-500`. If a class doesn't render, that's the first thing to check.

2. **Radix Select** chokes on `value=""`. Always use a sentinel string for "no selection" / "all".

3. **ResizeObserver vs requestAnimationFrame**: when measuring DOM after a React render, `requestAnimationFrame` callbacks may run before the browser does layout — measurements come back stale. If you need post-layout measurements (chevron-when-overflowing, etc.), use `ResizeObserver` on the container. We've been burned by this in the order-form cart.

4. **The DAM `<!--VIDEO_FORMATS:…-->` HTML comment trick**: the admin asset endpoint extracts dynamic Vimeo formats out of the asset description and returns them as `vimeo_download_formats`. The client endpoint **must do the same** or the raw comment leaks into the client UI. See `app/api/dam/assets/client/route.ts` for the parsing block.

5. **The PencilIcon → Pencil swap** in heroicons → lucide is a common one. If you import `Pencil` but JSX still has `<PencilIcon`, TS won't catch it (Icon is a generic word). Search and replace `<HeroIconName` to `<LucideName` carefully.

6. **`OrderFormView` cart layout uses `xl:h-[calc(100vh-12rem)]`** — 7rem was too tight on ultrawides, 10rem still cropped sometimes; 12rem is the safe number.

---

## Where to look first when picking up

- `CLAUDE.md` (project basics)
- This file (redesign state)
- `app/admin/dam/page.tsx` (the file with the remaining old-style chunks — Upload drawer, Edit modal, bulk-actions bar, Select-all row)
- `app/components/dam/BulkUploadCard.tsx` (form body still old)
- `app/components/shared/NoteForm.tsx` (orphan modal)

---

## Recent commits worth scanning for pattern reference

- `feat(design): B2 + B3 — DAM campaigns and settings on qq` — good example of the in-place rewrite pattern for lookup pages with API endpoints (inline edit, create dialog, useConfirm delete).
- `feat(design): C4 — client order form on qq` — pattern for a complex form view with a tabbed sticky cart sidebar.
- `feat(design): B1 — admin DAM main page chrome on qq` — pattern for surgical chrome conversion of a monster file.
- `feat(layout): Qiqi logo + Feedback button + unread-notes dot` — pattern for cross-cutting layout features (sidebar badge, topbar action, brand logo).

If you do nothing else, read those commits' diffs and you'll have the playbook.
