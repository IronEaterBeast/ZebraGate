create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_type text not null,
  original_credits integer not null check (original_credits >= 0),
  remaining_credits integer not null check (remaining_credits >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  batch_id uuid references public.credit_batches (id) on delete set null,
  amount integer not null,
  balance_after integer not null check (balance_after >= 0),
  type text not null,
  source_type text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  base_url text not null,
  api_key_encrypted text,
  model text not null,
  credit_multiplier numeric(10, 2) not null default 1,
  status text not null default 'unknown',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_ai_selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider_id uuid not null references public.ai_providers (id) on delete cascade,
  -- TODO: Current MVP desktop flow stores provider selections locally and sends provider_ids per request.
  -- The API server does not currently depend on this table for default provider routing.
  created_at timestamptz not null default now(),
  unique (user_id, provider_id)
);

create table if not exists public.api_request_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  provider_id uuid references public.ai_providers (id) on delete set null,
  status text not null,
  is_stream boolean not null default false,
  credits_used integer not null default 0,
  latency_ms integer not null default 0,
  error_code text,
  retry_trace jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.abuse_risk_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  ip_hash text,
  device_id text,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_batches_user_id_created_at
  on public.credit_batches (user_id, created_at);
create index if not exists idx_credit_batches_user_id_expires_at
  on public.credit_batches (user_id, expires_at);
create index if not exists idx_credit_batches_user_id_remaining_expires_at
  on public.credit_batches (user_id, remaining_credits, expires_at);
create unique index if not exists idx_credit_batches_register_gift_once
  on public.credit_batches (user_id, source_type)
  where source_type = 'register_gift';
create index if not exists idx_credit_ledger_user_id_created_at
  on public.credit_ledger (user_id, created_at desc);
create index if not exists idx_credit_ledger_request_id
  on public.credit_ledger (request_id);
create index if not exists idx_credit_ledger_user_id_source_type_created_at
  on public.credit_ledger (user_id, source_type, created_at desc);
create index if not exists idx_ai_providers_status_enabled
  on public.ai_providers (status, is_enabled);
create index if not exists idx_user_ai_selections_user_id
  on public.user_ai_selections (user_id);
create index if not exists idx_user_ai_selections_user_id_provider_id
  on public.user_ai_selections (user_id, provider_id);
create index if not exists idx_api_request_logs_user_id_created_at
  on public.api_request_logs (user_id, created_at desc);
create index if not exists idx_api_request_logs_provider_id_created_at
  on public.api_request_logs (provider_id, created_at desc);
create index if not exists idx_abuse_risk_events_user_id_created_at
  on public.abuse_risk_events (user_id, created_at desc);
create index if not exists idx_abuse_risk_events_ip_hash_created_at
  on public.abuse_risk_events (ip_hash, created_at desc);

alter table public.profiles enable row level security;
alter table public.credit_batches enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.ai_providers enable row level security;
alter table public.user_ai_selections enable row level security;
alter table public.api_request_logs enable row level security;
alter table public.abuse_risk_events enable row level security;

-- TODO: MVP tighten these policies per role and service boundary.
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "credit_batches_select_own"
  on public.credit_batches
  for select
  using (auth.uid() = user_id);

create policy "credit_ledger_select_own"
  on public.credit_ledger
  for select
  using (auth.uid() = user_id);

create policy "ai_providers_select_authenticated"
  on public.ai_providers
  for select
  using (auth.role() = 'authenticated');

create policy "user_ai_selections_select_own"
  on public.user_ai_selections
  for select
  using (auth.uid() = user_id);

create policy "api_request_logs_select_own"
  on public.api_request_logs
  for select
  using (auth.uid() = user_id);

create policy "abuse_risk_events_service_only_placeholder"
  on public.abuse_risk_events
  for select
  using (false);
