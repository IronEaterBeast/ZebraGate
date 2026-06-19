create table if not exists public.ai_call_traces (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null unique,
  user_id uuid references public.profiles (id) on delete set null,
  device_id text,
  desktop_instance_id text,
  entrypoint text,
  request_kind text,
  client_request_model text,
  resolved_ai_option_id uuid references public.ai_options (id) on delete set null,
  resolved_model_id uuid references public.ai_models (id) on delete set null,
  resolved_upstream_model text,
  provider_id uuid references public.ai_providers (id) on delete set null,
  is_stream boolean not null default false,
  status text not null default 'started',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_latency_ms integer,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_call_trace_events (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null references public.ai_call_traces (trace_id) on delete cascade,
  seq_no integer not null,
  stage text not null,
  direction text not null,
  component text not null,
  status text not null,
  occurred_at timestamptz not null default now(),
  latency_ms integer,
  http_status integer,
  error_code text,
  error_message text,
  payload_json jsonb,
  payload_preview_text text,
  headers_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (trace_id, seq_no)
);

create index if not exists idx_ai_call_traces_started_at
  on public.ai_call_traces (started_at desc);
create index if not exists idx_ai_call_traces_user_id_started_at
  on public.ai_call_traces (user_id, started_at desc);
create index if not exists idx_ai_call_traces_provider_id_started_at
  on public.ai_call_traces (provider_id, started_at desc);
create index if not exists idx_ai_call_trace_events_trace_id_occurred_at
  on public.ai_call_trace_events (trace_id, occurred_at asc);
create index if not exists idx_ai_call_trace_events_stage_occurred_at
  on public.ai_call_trace_events (stage, occurred_at desc);

alter table public.ai_call_traces enable row level security;
alter table public.ai_call_trace_events enable row level security;

create policy "ai_call_traces_no_direct_client_select"
  on public.ai_call_traces
  for select
  using (false);

create policy "ai_call_trace_events_no_direct_client_select"
  on public.ai_call_trace_events
  for select
  using (false);
