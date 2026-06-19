import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("provider selection migration correction", () => {
  it("keeps 0002 as a no-op deprecation note with manual cleanup guidance", async () => {
    const migrationPath = resolve(
      process.cwd(),
      "../../packages/db/supabase/migrations/0002_user_ai_selection_provider_key.sql"
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("Deprecated migration kept only to preserve local migration ordering.");
    expect(migrationSql).toContain("drop column if exists provider_key");
    expect(migrationSql).toContain("unique (user_id, provider_id)");
  });
});

describe("AI option configuration migration", () => {
  it("creates split Provider / Model / Dimension / Runtime Preset / AI Option structures", async () => {
    const migrationSql = await readAiConfigurationMigration();

    expect(migrationSql).toContain("alter table public.ai_providers");
    expect(migrationSql).toContain("create table if not exists public.ai_models");
    expect(migrationSql).toContain("base_credit_multiplier numeric(10, 2) not null default 1");
    expect(migrationSql).toContain("create table if not exists public.ai_model_dimensions");
    expect(migrationSql).toContain("create table if not exists public.ai_model_dimension_values");
    expect(migrationSql).toContain("request_parameter_fragment jsonb not null default '{}'::jsonb");
    expect(migrationSql).toContain("credit_multiplier_delta numeric(10, 2) not null default 0");
    expect(migrationSql).toContain("create table if not exists public.ai_runtime_presets");
    expect(migrationSql).toContain("unique (model_id, normalized_parameter_values)");
    expect(migrationSql).toContain("create table if not exists public.ai_options");
  });

  it("migrates legacy ai_providers rows into default models, presets, and options", async () => {
    const migrationSql = await readAiConfigurationMigration();

    expect(migrationSql).toContain("insert into public.ai_models");
    expect(migrationSql).toContain("provider.model");
    expect(migrationSql).toContain("provider.credit_multiplier");
    expect(migrationSql).toContain("insert into public.ai_runtime_presets");
    expect(migrationSql).toContain("'{}'::jsonb");
    expect(migrationSql).toContain("insert into public.ai_options");
    expect(migrationSql).toContain("Default AI option created from legacy ai_providers row");
  });

  it("reserves request log linkage fields for the future AI Option execution path", async () => {
    const migrationSql = await readAiConfigurationMigration();

    expect(migrationSql).toContain("add column if not exists ai_option_id uuid references public.ai_options");
    expect(migrationSql).toContain(
      "add column if not exists runtime_preset_id uuid references public.ai_runtime_presets"
    );
    expect(migrationSql).toContain("add column if not exists model_id uuid references public.ai_models");
  });

  it("provides a safe public catalog view and removes direct client reads from provider secrets", async () => {
    const migrationSql = await readAiConfigurationMigration();

    expect(migrationSql).toContain("create or replace view public.ai_option_public_catalog");
    expect(migrationSql).toContain("option.id as ai_option_id");
    expect(migrationSql).not.toContain("api_key_encrypted as");
    expect(migrationSql).not.toContain("base_url as");
    expect(migrationSql).not.toContain("request_parameters as");
    expect(migrationSql).toContain("drop policy if exists \"ai_providers_select_authenticated\"");
    expect(migrationSql).toContain("ai_providers_no_direct_client_select");
  });
});

describe("runtime template rework migration", () => {
  it("adds runtime templates and prepares models to bind exactly one template", async () => {
    const migrationSql = await readRuntimeTemplateReworkMigration();

    expect(migrationSql).toContain("create table if not exists public.ai_runtime_templates");
    expect(migrationSql).toContain("template_key text not null");
    expect(migrationSql).toContain("parameter_schema_json jsonb not null");
    expect(migrationSql).toContain("add column if not exists runtime_template_id uuid references public.ai_runtime_templates");
  });

  it("stores final executable request parameters directly on ai_options", async () => {
    const migrationSql = await readRuntimeTemplateReworkMigration();

    expect(migrationSql).toContain("add column if not exists actual_parameter_values_json jsonb not null default '{}'::jsonb");
    expect(migrationSql).toContain("add column if not exists actual_request_parameters_json jsonb not null default '{}'::jsonb");
    expect(migrationSql).toContain("Final provider request parameters resolved for this AI option");
  });
});

describe("ai option runtime param ownership migration", () => {
  it("lets AI options store final params without requiring a runtime preset row", async () => {
    const migrationSql = await readAiOptionRuntimePresetNullableMigration();

    expect(migrationSql).toContain("alter column runtime_preset_id drop not null");
    expect(migrationSql).toContain("drop constraint if exists ai_options_runtime_preset_id_key");
    expect(migrationSql).toContain("New AI options may leave this null");
  });
});

describe("remove redundant ai option parameter-values snapshot migration", () => {
  it("drops the intermediate parameter-values column and keeps only final request params", async () => {
    const migrationSql = await readDropAiOptionParameterValuesMigration();

    expect(migrationSql).toContain("drop column if exists actual_parameter_values_json");
    expect(migrationSql).toContain("single source of truth");
  });
});

describe("ai option public catalog status cascade migration", () => {
  it("hides options whose parent model or provider is disabled", async () => {
    const migrationSql = await readAiOptionPublicCatalogStatusCascadeMigration();

    expect(migrationSql).toContain("create or replace view public.ai_option_public_catalog");
    expect(migrationSql).toContain("model.is_enabled");
    expect(migrationSql).toContain("model.status <> 'disabled'");
    expect(migrationSql).toContain("provider.is_enabled");
    expect(migrationSql).toContain("provider.status <> 'disabled'");
  });
});

describe("ai call trace migration", () => {
  it("creates trace master and event tables for end-to-end AI call monitoring", async () => {
    const migrationSql = await readAiCallTraceMigration();

    expect(migrationSql).toContain("create table if not exists public.ai_call_traces");
    expect(migrationSql).toContain("trace_id text not null unique");
    expect(migrationSql).toContain("resolved_upstream_model text");
    expect(migrationSql).toContain("create table if not exists public.ai_call_trace_events");
    expect(migrationSql).toContain("stage text not null");
    expect(migrationSql).toContain("payload_json jsonb");
    expect(migrationSql).toContain("unique (trace_id, seq_no)");
  });
});

describe("ai call trace service-role policy migration", () => {
  it("allows the api service role to read and write trace records under RLS", async () => {
    const migrationSql = await readAiCallTraceServiceRolePolicyMigration();

    expect(migrationSql).toContain("create policy \"ai_call_traces_service_role_all\"");
    expect(migrationSql).toContain("on public.ai_call_traces");
    expect(migrationSql).toContain("to service_role");
    expect(migrationSql).toContain("with check (true)");
    expect(migrationSql).toContain("create policy \"ai_call_trace_events_service_role_all\"");
    expect(migrationSql).toContain("on public.ai_call_trace_events");
  });
});

async function readAiConfigurationMigration(): Promise<string> {
  const migrationPath = resolve(
    process.cwd(),
    "../../packages/db/supabase/migrations/0003_ai_option_configuration.sql"
  );
  return readFile(migrationPath, "utf8");
}

async function readRuntimeTemplateReworkMigration(): Promise<string> {
  const migrationPath = resolve(
    process.cwd(),
    "../../packages/db/supabase/migrations/0004_runtime_template_rework.sql"
  );
  return readFile(migrationPath, "utf8");
}

async function readAiOptionRuntimePresetNullableMigration(): Promise<string> {
  const migrationPath = resolve(
    process.cwd(),
    "../../packages/db/supabase/migrations/0005_ai_option_runtime_preset_nullable.sql"
  );
  return readFile(migrationPath, "utf8");
}

async function readDropAiOptionParameterValuesMigration(): Promise<string> {
  const migrationPath = resolve(
    process.cwd(),
    "../../packages/db/supabase/migrations/0006_drop_ai_option_parameter_values.sql"
  );
  return readFile(migrationPath, "utf8");
}

async function readAiOptionPublicCatalogStatusCascadeMigration(): Promise<string> {
  const migrationPath = resolve(
    process.cwd(),
    "../../packages/db/supabase/migrations/0008_ai_option_public_catalog_status_cascade.sql"
  );
  return readFile(migrationPath, "utf8");
}

async function readAiCallTraceMigration(): Promise<string> {
  const migrationPath = resolve(
    process.cwd(),
    "../../packages/db/supabase/migrations/0010_ai_call_traces.sql"
  );
  return readFile(migrationPath, "utf8");
}

async function readAiCallTraceServiceRolePolicyMigration(): Promise<string> {
  const migrationPath = resolve(
    process.cwd(),
    "../../packages/db/supabase/migrations/0011_ai_call_traces_service_role_policy.sql"
  );
  return readFile(migrationPath, "utf8");
}

describe("ai call trace token usage migration", () => {
  it("adds input_tokens, output_tokens, and total_tokens columns to ai_call_traces", async () => {
    const migrationPath = resolve(
      process.cwd(),
      "../../packages/db/supabase/migrations/0012_ai_call_traces_token_usage.sql"
    );
    const migrationSql = await readFile(migrationPath, "utf8");

    expect(migrationSql).toContain("alter table public.ai_call_traces");
    expect(migrationSql).toContain("add column if not exists input_tokens integer");
    expect(migrationSql).toContain("add column if not exists output_tokens integer");
    expect(migrationSql).toContain("add column if not exists total_tokens integer");
  });
});
