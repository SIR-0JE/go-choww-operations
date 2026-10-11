-- Order timeline: one row per step in an order's life.
-- Paste this whole file into the Supabase SQL editor and run it once. Safe to re-run.

create table if not exists "OrderEvent" (
  "id"        text primary key default gen_random_uuid()::text,
  "orderDbId" text not null references "DeliveryOrder"("id") on delete cascade,
  "kind"      text not null,
  "at"        timestamp(3) not null,
  "source"    text not null,
  "exact"     boolean not null default true,
  "actorName" text,
  "detail"    text,
  "createdAt" timestamp(3) not null default current_timestamp
);

create index if not exists "OrderEvent_orderDbId_at_idx" on "OrderEvent"("orderDbId", "at");
create index if not exists "OrderEvent_kind_at_idx" on "OrderEvent"("kind", "at");

-- A GoChow status is recorded once per order (re-sync can never duplicate it)
create unique index if not exists "OrderEvent_gochow_once"
  on "OrderEvent"("orderDbId", "kind") where "kind" like 'gochow\_%';

-- Same protection as the other tables holding people's data
alter table "OrderEvent" enable row level security;

-- Bring in what we already know: rider and rep taps from the activity log (since 28 Sep)
insert into "OrderEvent" ("id", "orderDbId", "kind", "at", "source", "actorName", "detail")
select gen_random_uuid()::text, a."orderDbId",
       case a."type"
         when 'claim' then 'rider_accepted'
         when 'pickup' then 'rider_picked_up'
         when 'deliver' then 'rider_delivered'
         when 'drop' then 'rider_dropped'
         when 'transfer' then 'rider_transferred'
         when 'collector_handed' then 'rep_handed'
         when 'collector_received' then 'rep_received'
         when 'collector_delivered' then 'rep_delivered'
         when 'collector_not_reachable' then 'rep_not_reachable'
         when 'collector_returned' then 'rep_returned'
       end,
       a."createdAt",
       case when a."type" like 'collector\_%' then 'rep' else 'rider' end,
       a."riderName",
       a."detail"
from "RiderActivity" a
join "DeliveryOrder" o on o."id" = a."orderDbId"
where a."orderDbId" is not null
  and a."type" in ('claim','pickup','deliver','drop','transfer','collector_handed','collector_received','collector_delivered','collector_not_reachable','collector_returned')
  and not exists (select 1 from "OrderEvent" e where e."orderDbId" = a."orderDbId" and e."at" = a."createdAt" and e."source" in ('rider','rep'));
