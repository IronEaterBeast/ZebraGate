-- The public AI option catalog previously only checked the AI option's own
-- is_public/is_enabled flags. If an admin disabled the parent provider or
-- model, options belonging to it could still appear as selectable to users,
-- but requests using them would fail because the provider is excluded from
-- the selectable provider pool. Recreate the view so it also requires the
-- parent model and provider to be enabled and not disabled.

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
join public.ai_providers provider on provider.id = option.provider_id
where model.is_enabled
  and model.status <> 'disabled'
  and provider.is_enabled
  and provider.status <> 'disabled';
