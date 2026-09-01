-- Admin permission restructure (owner spec 2026-09-01): category-based
-- View/Edit keys replace the flat 8-key model. One key per sidebar category
-- and action level: orders:view/orders:edit, catalog:*, assets:*, amazon:*,
-- shopify:*, config:*, distributors:*, users:*, plus enable-only keys
-- 'dashboard' (granted to every admin) and 'insights'.
--
-- CLIENT permissions are deliberately unchanged ('orders','dam','reports' —
-- referenced by RLS policies via auth_has_permission).
--
-- Legacy -> new mapping:
--   orders                       -> orders:view, orders:edit
--   dam                          -> assets:view, assets:edit
--   reports                      -> insights
--   users:manage / admins:manage -> users:view, users:edit
--   companies:manage             -> distributors:view, distributors:edit
--   netsuite                     -> amazon:*, shopify:*, config:*
--   settings                     -> catalog:*, config:*
--
-- Idempotent: only touches rows still holding legacy keys, so a re-run is a
-- no-op. APPLY ORDER: run immediately BEFORE deploying the code (the new
-- sidebar/guards read the new keys; in the minutes between, admins see a
-- reduced sidebar — refresh after deploy fixes it).

update public.admins
set permissions = (
  select coalesce(array_agg(distinct p order by p), '{}')
  from unnest(
    array['dashboard']
    || case when permissions && array['orders']
         then array['orders:view', 'orders:edit'] else array[]::text[] end
    || case when permissions && array['dam']
         then array['assets:view', 'assets:edit'] else array[]::text[] end
    || case when permissions && array['reports']
         then array['insights'] else array[]::text[] end
    || case when permissions && array['users:manage', 'admins:manage']
         then array['users:view', 'users:edit'] else array[]::text[] end
    || case when permissions && array['companies:manage']
         then array['distributors:view', 'distributors:edit'] else array[]::text[] end
    || case when permissions && array['netsuite']
         then array['amazon:view', 'amazon:edit', 'shopify:view', 'shopify:edit',
                    'config:view', 'config:edit'] else array[]::text[] end
    || case when permissions && array['settings']
         then array['catalog:view', 'catalog:edit',
                    'config:view', 'config:edit'] else array[]::text[] end
  ) p
)
where permissions && array['orders', 'dam', 'reports', 'users:manage',
                           'admins:manage', 'companies:manage', 'netsuite', 'settings'];
