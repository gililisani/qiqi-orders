-- Inventory Investigation — chain-aware recommendations.
--
-- The worklist row now describes a CHAIN of edits (multi-document for
-- intercompany transfers, plus optional upstream prerequisite fixes), and can
-- carry alternative options. Rather than explode into many columns, the
-- structured parts are stored as JSONB.

ALTER TABLE public.inv_inv_worklist
  ADD COLUMN IF NOT EXISTS recommendation_type TEXT,        -- 'Change date'|'Reduce quantity'|'Delete chain'|'Create transfer'|'Manual review'|'Broken chain'
  ADD COLUMN IF NOT EXISTS edits_required JSONB,            -- ordered EditStep[] (incl. manual TO-in-UI note)
  ADD COLUMN IF NOT EXISTS prerequisite_summary TEXT,       -- 'None' | 'Backdate IR... ' | 'Backdate ASBIL... + components verified'
  ADD COLUMN IF NOT EXISTS is_broken_chain BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS options JSONB;                   -- alternative candidates (Option A/B/...)

-- iscrosssubtransaction is uniformly false in this account; intercompany is
-- detected by differing subsidiary across a TOrdCost IF->IR pair. We store the
-- subsidiary name on each cached transaction line so the UI / broken-chain
-- checks can use it without re-querying NetSuite.
ALTER TABLE public.inv_inv_transactions
  ADD COLUMN IF NOT EXISTS subsidiary_name TEXT,
  ADD COLUMN IF NOT EXISTS chain_role TEXT,                 -- 'if' | 'ir' | NULL  (intercompany TOrdCost leg)
  ADD COLUMN IF NOT EXISTS chain_partner_tx_id TEXT;        -- the paired IF/IR transaction internal id
