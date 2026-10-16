-- Runners: staff stationed at a cafeteria who mark orders Ready as soon as they're packed.
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Needs the order timeline table (supabase/order_events.sql) to exist first: run that one first if you haven't.

create table if not exists "Runner" (
  "id"        text primary key default gen_random_uuid()::text,
  "name"      text not null,
  "phone"     text not null,
  "pin"       text not null default '1234',
  "status"    text not null default 'Active',
  "cafeteria" text not null,
  "createdAt" timestamp(3) not null default current_timestamp
);
create unique index if not exists "Runner_phone_key" on "Runner"("phone");

-- One active runner per cafeteria at a time
create unique index if not exists "Runner_one_active_per_cafeteria"
  on "Runner"(lower("cafeteria")) where "status" = 'Active';

-- An order can be marked Ready by a runner only once
create unique index if not exists "OrderEvent_runner_ready_once"
  on "OrderEvent"("orderDbId") where "kind" = 'runner_ready';

alter table "Runner" enable row level security;
