-- Lock down search_path on the 12 functions flagged by the Supabase
-- Security Advisor under `function_search_path_mutable`. Without an
-- explicit search_path, a malicious caller can shadow `public` objects
-- via their own schema and trick the function into running attacker
-- code. Setting `search_path = public, pg_catalog` removes that surface.
--
-- We use ALTER FUNCTION (not CREATE OR REPLACE) so we don't need to
-- know the function bodies. A DO block enumerates each affected
-- function and applies the change, gracefully skipping any that don't
-- exist (e.g. if a function has been renamed since the lint ran).

DO $$
DECLARE
  fn record;
  fn_name text;
  affected text[] := ARRAY[
    'update_updated_at_column',
    'is_admin',
    'dam_touch_updated_at',
    'dam_update_search_vector',
    'dam_set_current_version',
    'update_historical_sales_updated_at',
    'dam_job_queue_touch_updated_at',
    'calculate_target_period_progress',
    'update_all_target_periods_progress',
    'get_countries_list',
    'generate_sli_number',
    'update_standalone_slis_updated_at'
  ];
BEGIN
  FOREACH fn_name IN ARRAY affected LOOP
    FOR fn IN
      SELECT
        n.nspname || '.' || p.proname AS qualified_name,
        pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = fn_name
    LOOP
      EXECUTE format(
        'ALTER FUNCTION %s(%s) SET search_path = public, pg_catalog',
        fn.qualified_name, fn.args
      );
      RAISE NOTICE 'Locked search_path on %(%)', fn.qualified_name, fn.args;
    END LOOP;
  END LOOP;
END $$;
