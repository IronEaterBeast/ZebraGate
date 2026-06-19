-- Align AI Option storage with the new "AI Option owns final runtime params" model.
-- runtime_preset_id is kept only for backward compatibility with historical data.

alter table public.ai_options
  alter column runtime_preset_id drop not null;

alter table public.ai_options
  drop constraint if exists ai_options_runtime_preset_id_key;

comment on column public.ai_options.runtime_preset_id is
  'Legacy compatibility link to ai_runtime_presets. New AI options may leave this null because actual runtime params now live directly on the AI option row.';
