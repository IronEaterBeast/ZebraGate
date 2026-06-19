-- Split the legacy ai_providers mixed responsibility into Provider / Model /
-- Dimension / Runtime Preset / AI Option structures while keeping the old table
-- name available for the current MVP gateway compatibility path.

alter table public.ai_providers
  add column if not exists provider_label text,
  add column if not exists default_headers jsonb not null default '{}'::jsonb,
  add column if not exists default_query_params jsonb not null default '{}'::jsonb,
  add column if not exists admin_note text,
  add column if not exists migration_note text,
  add column if not exists health_status text not null default 'unknown',
  add column if not exists disable_reason text;

update public.ai_providers
set
  provider_label = coalesce(provider_label, display_name),
  migration_note = coalesce(
    migration_note,
    'Migrated from legacy ai_providers row. Legacy model and credit_multiplier columns are retained for compatibility and should not remain the long-term source of truth.'
  )
where provider_label is null
   or migration_note is null;

alter table public.ai_providers
  alter column provider_label set not null;

comment on table public.ai_providers is
  'Provider/upstream connection records. Legacy model and credit_multiplier columns are retained temporarily for gateway compatibility.';

comment on column public.ai_providers.api_key_encrypted is
  'TODO: MVP may contain plaintext or legacy encrypted values. Replace with a complete encryption/decryption flow before production hardening.';
comment on column public.ai_providers.model is
  'Deprecated compatibility field. Use ai_models.upstream_model instead.';
comment on column public.ai_providers.credit_multiplier is
  'Deprecated compatibility field. Use ai_models.base_credit_multiplier and ai_options.credit_multiplier instead.';

create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.ai_providers (id) on delete cascade,
  model_key text not null,
  model_label text not null,
  upstream_model text not null,
  base_credit_multiplier numeric(10, 2) not null default 1,
  status text not null default 'unknown',
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  admin_note text,
  migration_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, model_key)
);

create table if not exists public.ai_model_dimensions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.ai_models (id) on delete cascade,
  dimension_key text not null,
  label text not null,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, dimension_key)
);

create table if not exists public.ai_model_dimension_values (
  id uuid primary key default gen_random_uuid(),
  dimension_id uuid not null references public.ai_model_dimensions (id) on delete cascade,
  value_key text not null,
  label text not null,
  is_default boolean not null default false,
  omit_when_default boolean not null default false,
  include_in_summary boolean not null default true,
  credit_multiplier_delta numeric(10, 2) not null default 0,
  request_parameter_fragment jsonb not null default '{}'::jsonb,
  depends_on jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dimension_id, value_key)
);

create table if not exists public.ai_runtime_presets (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.ai_models (id) on delete cascade,
  name text not null,
  parameter_values jsonb not null default '{}'::jsonb,
  normalized_parameter_values jsonb not null default '{}'::jsonb,
  request_parameters jsonb not null default '{}'::jsonb,
  has_request_parameter_conflict boolean not null default false,
  conflict_details jsonb not null default '[]'::jsonb,
  status text not null default 'unknown',
  is_enabled boolean not null default true,
  admin_note text,
  migration_note text,
  generated_by text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_id, normalized_parameter_values)
);

create table if not exists public.ai_options (
  id uuid primary key default gen_random_uuid(),
  runtime_preset_id uuid not null references public.ai_runtime_presets (id) on delete cascade,
  provider_id uuid not null references public.ai_providers (id) on delete cascade,
  model_id uuid not null references public.ai_models (id) on delete cascade,
  public_name text not null,
  generated_config_summary text not null default '',
  display_config_summary text not null default '',
  display_config_summary_overridden boolean not null default false,
  generated_credit_multiplier numeric(10, 2) not null default 1,
  credit_multiplier numeric(10, 2) not null default 1,
  credit_multiplier_overridden boolean not null default false,
  display_badges jsonb not null default '[]'::jsonb,
  is_recommended boolean not null default true,
  is_public boolean not null default true,
  is_enabled boolean not null default true,
  status text not null default 'unknown',
  health_status text not null default 'unknown',
  disable_reason text,
  sort_order integer not null default 0,
  admin_note text,
  migration_note text,
  generated_by text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (runtime_preset_id)
);

insert into public.ai_models (
  provider_id,
  model_key,
  model_label,
  upstream_model,
  base_credit_multiplier,
  status,
  is_enabled,
  migration_note
)
select
  provider.id,
  provider.model,
  provider.model,
  provider.model,
  provider.credit_multiplier,
  provider.status,
  provider.is_enabled,
  'Created from legacy ai_providers.model and ai_providers.credit_multiplier during 0003 migration.'
from public.ai_providers provider
where not exists (
  select 1
  from public.ai_models model
  where model.provider_id = provider.id
    and model.model_key = provider.model
);

insert into public.ai_runtime_presets (
  model_id,
  name,
  parameter_values,
  normalized_parameter_values,
  request_parameters,
  status,
  is_enabled,
  migration_note,
  generated_by
)
select
  model.id,
  model.model_label || ' default',
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  model.status,
  model.is_enabled,
  'Default runtime preset created from legacy ai_providers row during 0003 migration.',
  'legacy_migration'
from public.ai_models model
where not exists (
  select 1
  from public.ai_runtime_presets preset
  where preset.model_id = model.id
    and preset.normalized_parameter_values = '{}'::jsonb
);

insert into public.ai_options (
  runtime_preset_id,
  provider_id,
  model_id,
  public_name,
  generated_config_summary,
  display_config_summary,
  generated_credit_multiplier,
  credit_multiplier,
  is_recommended,
  is_public,
  is_enabled,
  status,
  health_status,
  disable_reason,
  migration_note,
  generated_by
)
select
  preset.id,
  model.provider_id,
  model.id,
  provider.display_name,
  '',
  '',
  model.base_credit_multiplier,
  model.base_credit_multiplier,
  true,
  true,
  provider.is_enabled and model.is_enabled and preset.is_enabled,
  provider.status,
  provider.health_status,
  provider.disable_reason,
  'Default AI option created from legacy ai_providers row during 0003 migration.',
  'legacy_migration'
from public.ai_runtime_presets preset
join public.ai_models model on model.id = preset.model_id
join public.ai_providers provider on provider.id = model.provider_id
where preset.normalized_parameter_values = '{}'::jsonb
  and not exists (
    select 1
    from public.ai_options option
    where option.runtime_preset_id = preset.id
  );

alter table public.api_request_logs
  add column if not exists ai_option_id uuid references public.ai_options (id) on delete set null,
  add column if not exists runtime_preset_id uuid references public.ai_runtime_presets (id) on delete set null,
  add column if not exists model_id uuid references public.ai_models (id) on delete set null;

create index if not exists idx_ai_models_provider_id_sort_order
  on public.ai_models (provider_id, sort_order, created_at);
create index if not exists idx_ai_model_dimensions_model_id_sort_order
  on public.ai_model_dimensions (model_id, sort_order, created_at);
create index if not exists idx_ai_model_dimension_values_dimension_id_sort_order
  on public.ai_model_dimension_values (dimension_id, sort_order, created_at);
create index if not exists idx_ai_runtime_presets_model_id_enabled
  on public.ai_runtime_presets (model_id, is_enabled, status);
create index if not exists idx_ai_options_public_recommended_sort_order
  on public.ai_options (is_public, is_enabled, is_recommended, sort_order, created_at);
create index if not exists idx_api_request_logs_ai_option_id_created_at
  on public.api_request_logs (ai_option_id, created_at desc);
create index if not exists idx_api_request_logs_runtime_preset_id_created_at
  on public.api_request_logs (runtime_preset_id, created_at desc);
create index if not exists idx_api_request_logs_model_id_created_at
  on public.api_request_logs (model_id, created_at desc);

create or replace view public.ai_option_public_catalog as
select
  option.id as ai_option_id,
  provider.provider_label,
  model.model_label,
  option.public_name,
  option.display_config_summary,
  option.display_badges,
  option.credit_multiplier,
  option.is_recommended,
  option.status,
  option.disable_reason,
  option.sort_order,
  option.is_public,
  option.is_enabled
from public.ai_options option
join public.ai_models model on model.id = option.model_id
join public.ai_providers provider on provider.id = option.provider_id;

drop policy if exists "ai_providers_select_authenticated" on public.ai_providers;

create policy "ai_providers_no_direct_client_select"
  on public.ai_providers
  for select
  using (false);

alter table public.ai_models enable row level security;
alter table public.ai_model_dimensions enable row level security;
alter table public.ai_model_dimension_values enable row level security;
alter table public.ai_runtime_presets enable row level security;
alter table public.ai_options enable row level security;

create policy "ai_models_no_direct_client_select"
  on public.ai_models
  for select
  using (false);
create policy "ai_model_dimensions_no_direct_client_select"
  on public.ai_model_dimensions
  for select
  using (false);
create policy "ai_model_dimension_values_no_direct_client_select"
  on public.ai_model_dimension_values
  for select
  using (false);
create policy "ai_runtime_presets_no_direct_client_select"
  on public.ai_runtime_presets
  for select
  using (false);
create policy "ai_options_no_direct_client_select"
  on public.ai_options
  for select
  using (false);
