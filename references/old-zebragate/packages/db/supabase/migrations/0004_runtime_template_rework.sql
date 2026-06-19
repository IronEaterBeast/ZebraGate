-- Prepare the next-stage AI option model:
-- 1. Runtime templates become the rule source bound by models.
-- 2. AI options store their own final executable request parameters.
-- 3. Old runtime preset / dimension structures remain for gradual migration.

create table if not exists public.ai_runtime_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  name text not null,
  description text,
  parameter_schema_json jsonb not null default '{"parameters":[],"dependencies":[]}'::jsonb,
  request_build_rules_json jsonb not null default '{}'::jsonb,
  summary_rules_json jsonb not null default '{}'::jsonb,
  naming_rules_json jsonb not null default '{}'::jsonb,
  credit_rules_json jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  admin_note text,
  migration_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_key)
);

alter table public.ai_models
  add column if not exists runtime_template_id uuid references public.ai_runtime_templates (id) on delete set null;

alter table public.ai_options
  add column if not exists actual_parameter_values_json jsonb not null default '{}'::jsonb,
  add column if not exists actual_request_parameters_json jsonb not null default '{}'::jsonb;

comment on table public.ai_runtime_templates is
  'Runtime parameter templates that define the full parameter space and generation rules for AI options.';

comment on column public.ai_models.runtime_template_id is
  'Each model binds to one runtime template, while one template may be reused by many models.';

comment on column public.ai_options.actual_parameter_values_json is
  'Concrete selected parameter values represented by this AI option.';

comment on column public.ai_options.actual_request_parameters_json is
  'Final provider request parameters resolved for this AI option.';

create index if not exists idx_ai_runtime_templates_enabled_created_at
  on public.ai_runtime_templates (is_enabled, created_at);

create index if not exists idx_ai_models_runtime_template_id
  on public.ai_models (runtime_template_id);
