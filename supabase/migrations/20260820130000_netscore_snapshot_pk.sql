-- Sandbox is a copy of prod: internal ids collide across targets. Key by
-- (ns_target, id) so snapshots of both environments coexist.
alter table public.netscore_customer_stamps drop constraint netscore_customer_stamps_pkey;
alter table public.netscore_customer_stamps add primary key (ns_target, ns_customer_id);
alter table public.netscore_transaction_stamps drop constraint netscore_transaction_stamps_pkey;
alter table public.netscore_transaction_stamps add primary key (ns_target, ns_transaction_id);
alter table public.netscore_item_stamps drop constraint netscore_item_stamps_pkey;
alter table public.netscore_item_stamps add primary key (ns_target, ns_item_id);
