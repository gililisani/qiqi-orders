-- Cross-Subsidiary Fulfillment (CSF) flag on the client record.
--
-- When TRUE, the client's chosen Location belongs to a DIFFERENT subsidiary than
-- the client's own (selling) subsidiary — e.g. Qiqi INC client fulfilled from
-- Qiqi Global's Brandfox warehouse. The Hub then pushes the Sales Order with the
-- line's Inventory Location = that location (NetSuite handles cross-sub
-- fulfillment + intercompany accounting), leaving the selling Location blank.
--
-- This flag drives the company-form UI (it filters the Location dropdown to the
-- other subsidiary's locations and records intent). The push still derives the
-- cross-sub behaviour from the chosen location's subsidiary vs the company's, so
-- the two can never disagree.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cross_subsidiary_fulfillment boolean NOT NULL DEFAULT false;
