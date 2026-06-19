import type { AdminAiOptionRecord, AdminModelRecord } from "../../../lib/admin-api-client";

export const ALL_SELECTION = "all";

export function filterModelsByProvider(models: AdminModelRecord[], providerId: string): AdminModelRecord[] {
  if (providerId === ALL_SELECTION) {
    return models;
  }

  return models.filter((model) => model.providerId === providerId);
}

export function filterOptionsBySelection(
  aiOptions: AdminAiOptionRecord[],
  providerId: string,
  modelId: string
): AdminAiOptionRecord[] {
  let result = aiOptions;

  if (providerId !== ALL_SELECTION) {
    result = result.filter((option) => option.providerId === providerId);
  }

  if (modelId !== ALL_SELECTION) {
    result = result.filter((option) => option.modelId === modelId);
  }

  return [...result].sort((a, b) => a.publicName.localeCompare(b.publicName));
}

export interface AiConfigViewState {
  providerId: string;
  modelId: string;
  detailType?: string;
  detailId?: string;
  optionAction?: string;
  providerCollapsed?: boolean;
  modelCollapsed?: boolean;
  optionCollapsed?: boolean;
}

export function buildSelectionHref(
  basePath: string,
  current: AiConfigViewState,
  update: { providerId?: string; modelId?: string }
): string {
  const params = new URLSearchParams();
  const providerId = update.providerId ?? current.providerId;
  const modelId = update.modelId ?? current.modelId;

  if (providerId !== ALL_SELECTION) {
    params.set("providerId", providerId);
  }
  if (modelId !== ALL_SELECTION) {
    params.set("modelId", modelId);
  }
  if (current.providerCollapsed) {
    params.set("pc", "1");
  }
  if (current.modelCollapsed) {
    params.set("mc", "1");
  }
  if (current.optionCollapsed) {
    params.set("oc", "1");
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildViewStateHref(basePath: string, state: AiConfigViewState): string {
  const params = new URLSearchParams();

  if (state.providerId !== ALL_SELECTION) {
    params.set("providerId", state.providerId);
  }
  if (state.modelId !== ALL_SELECTION) {
    params.set("modelId", state.modelId);
  }
  if (state.detailType && state.detailId) {
    params.set("detailType", state.detailType);
    params.set("detailId", state.detailId);
  }
  if (state.optionAction) {
    params.set("optionAction", state.optionAction);
  }
  if (state.providerCollapsed) {
    params.set("pc", "1");
  }
  if (state.modelCollapsed) {
    params.set("mc", "1");
  }
  if (state.optionCollapsed) {
    params.set("oc", "1");
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function buildCollapseToggleHref(
  basePath: string,
  state: AiConfigViewState,
  column: "provider" | "model" | "option"
): string {
  if (column === "provider") {
    return buildViewStateHref(basePath, { ...state, providerCollapsed: !state.providerCollapsed });
  }

  if (column === "model") {
    return buildViewStateHref(basePath, { ...state, modelCollapsed: !state.modelCollapsed });
  }

  return buildViewStateHref(basePath, { ...state, optionCollapsed: !state.optionCollapsed });
}
