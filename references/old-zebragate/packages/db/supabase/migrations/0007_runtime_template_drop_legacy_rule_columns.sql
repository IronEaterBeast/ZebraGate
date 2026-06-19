-- The runtime template "parameter schema JSON" now embeds request fragments,
-- summary text, naming, and credit rules per option. The separate rule JSON
-- columns are redundant and removed (MVP stage, no data migration needed).

alter table public.ai_runtime_templates
  drop column if exists request_build_rules_json,
  drop column if exists summary_rules_json,
  drop column if exists naming_rules_json,
  drop column if exists credit_rules_json;

alter table public.ai_runtime_templates
  alter column parameter_schema_json set default '{"parameters":{}}'::jsonb;
