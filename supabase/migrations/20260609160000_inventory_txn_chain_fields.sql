-- Per-item cached transactions now carry the raw NetSuite type code and the
-- TOrdCost chain linkage, so the negative-window cause analysis can tell an
-- Item Fulfillment generated from a Transfer Order (editable) from a client
-- shipment (not editable), and resolve replenishment chains.
ALTER TABLE public.inv_inv_transactions
  ADD COLUMN IF NOT EXISTS ns_type_code text;
ALTER TABLE public.inv_inv_transactions
  ADD COLUMN IF NOT EXISTS chain_role text;        -- 'if' | 'ir' | NULL
ALTER TABLE public.inv_inv_transactions
  ADD COLUMN IF NOT EXISTS chain_partner_tx_id text;
