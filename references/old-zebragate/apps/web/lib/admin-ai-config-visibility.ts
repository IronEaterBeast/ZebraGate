import type { AdminAiConfigCatalog } from "./admin-api-client";

export function countCustomerVisibleAiOptions(catalog: AdminAiConfigCatalog): number {
  return getCustomerVisibleAiOptions(catalog).length;
}

export function countCustomerVisibleRecommendedAiOptions(catalog: AdminAiConfigCatalog): number {
  return getCustomerVisibleAiOptions(catalog).filter((option) => option.isRecommended).length;
}

function getCustomerVisibleAiOptions(catalog: AdminAiConfigCatalog) {
  return catalog.aiOptions.filter((option) => {
    if (!option.isPublic || !option.isEnabled || option.status === "disabled") {
      return false;
    }

    const model = catalog.models.find((candidate) => candidate.id === option.modelId);
    if (!model || !model.isEnabled || model.status === "disabled") {
      return false;
    }

    const provider = catalog.providers.find((candidate) => candidate.id === option.providerId);
    if (!provider || !provider.isEnabled || provider.status === "disabled") {
      return false;
    }

    return true;
  });
}
