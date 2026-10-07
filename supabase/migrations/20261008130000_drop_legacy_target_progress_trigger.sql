-- Remove the original Hub's database-side goal-progress calculation.
--
-- update_target_progress_on_order_change (AFTER INSERT/UPDATE/DELETE on
-- orders) rewrote target_periods.current_progress for the order's company on
-- EVERY order change, as Done orders' total minus support funds by order
-- CREATION date — a definition no screen has used since May 2026. With
-- reports on the sales ledger (20261008120000) it fought the ledger
-- recalculation: e.g. the warehouse poll touching an order reset that
-- company's stored progress (seen 2026-10-07 20:20 UTC). No screen reads the
-- stored column (all compute live from the ledger); it is kept current by the
-- ledger sync (lib/targetPeriods.ts).
--
-- APPLY ORDER: any time. Safe for deployed code (nothing calls these).

drop trigger if exists update_target_progress_on_order_change on public.orders;
drop function if exists public.update_all_target_periods_progress();
drop function if exists public.calculate_target_period_progress(uuid, date, date);
