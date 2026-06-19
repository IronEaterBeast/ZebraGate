-- Remove the redundant parameter-values snapshot from AI options.
-- The final provider request JSON is now the single source of truth.

alter table public.ai_options
  drop column if exists actual_parameter_values_json;
