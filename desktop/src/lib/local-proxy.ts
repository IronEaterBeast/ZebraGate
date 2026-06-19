import { invoke } from "@tauri-apps/api/core";
import { ZEBRAGATE_MODEL } from "@zebragate/shared";
import type { PublicAiOption } from "@zebragate/shared";

export type { PublicAiOption } from "@zebragate/shared";

export interface LocalProxyStatus {
  running: boolean;
  port: number | null;
  address: string;
  lastRequestStatus: string;
  lastErrorMessage: string | null;
}

export interface DesktopGroupSummary {
  id: string;
  name: string;
  localKey: string;
  lastUsedAt: number | null;
  isDefault: boolean;
  selectedAiOptionCount: number;
}

export interface DesktopGroupConfig {
  id: string;
  name: string;
  localKey: string;
  lastUsedAt: number | null;
  selectedAiOptionIds: string[];
}

export interface DesktopConfigSnapshot {
  remoteApiBaseUrl: string;
  devUserId: string;
  lastPort: number | null;
  deviceId: string;
  privacyProtectionEnabled: boolean;
  groups: DesktopGroupConfig[];
  defaultGroupId: string;
}

export interface DesktopRuntimeSnapshot {
  proxyStatus: LocalProxyStatus;
  deviceId: string;
  model: string;
  credits: number | null;
  remoteApiErrorMessage: string | null;
  groups: DesktopGroupSummary[];
}

export interface AiOptionSelectionSnapshot {
  aiOptionIds: string[];
}

export interface UnavailableAiOptionNotice {
  groupName: string;
  aiOptionNames: string[];
}

export interface AiOptionCatalogSnapshot {
  aiOptions: PublicAiOption[];
  fetchedAt: number | null;
  isStale: boolean;
  unavailableAiOptionNotices: UnavailableAiOptionNotice[];
}

export interface AuthStatusSnapshot {
  loggedIn: boolean;
  email: string | null;
  userId: string | null;
}

export async function startLocalProxy(
  preferredPort: number | null = null
): Promise<LocalProxyStatus> {
  return invoke<LocalProxyStatus>("start_local_proxy", { preferredPort });
}

export async function stopLocalProxy(): Promise<LocalProxyStatus> {
  return invoke<LocalProxyStatus>("stop_local_proxy");
}

export async function getLocalProxyStatus(): Promise<LocalProxyStatus> {
  return invoke<LocalProxyStatus>("get_local_proxy_status");
}

export async function getDesktopRuntimeSnapshot(): Promise<DesktopRuntimeSnapshot> {
  return invoke<DesktopRuntimeSnapshot>("get_desktop_runtime_snapshot");
}

export async function getDesktopBootstrapSnapshot(): Promise<DesktopRuntimeSnapshot> {
  return invoke<DesktopRuntimeSnapshot>("get_desktop_bootstrap_snapshot");
}

export async function getDesktopConfig(): Promise<DesktopConfigSnapshot> {
  return invoke<DesktopConfigSnapshot>("get_desktop_config");
}

export async function getAiOptionCatalog(): Promise<AiOptionCatalogSnapshot> {
  return invoke<AiOptionCatalogSnapshot>("get_ai_option_catalog");
}

export async function refreshAiOptionCatalog(): Promise<AiOptionCatalogSnapshot> {
  return invoke<AiOptionCatalogSnapshot>("refresh_ai_option_catalog");
}

export async function clearUnavailableAiOptionNotices(): Promise<void> {
  return invoke<void>("clear_unavailable_ai_option_notices");
}

export async function getAiOptionSelection(groupId: string): Promise<AiOptionSelectionSnapshot> {
  return invoke<AiOptionSelectionSnapshot>("get_ai_option_selection", { groupId });
}

export async function saveAiOptionSelection(
  groupId: string,
  aiOptionIds: string[]
): Promise<AiOptionSelectionSnapshot> {
  return invoke<AiOptionSelectionSnapshot>("save_ai_option_selection", { groupId, aiOptionIds });
}

export async function listGroups(): Promise<DesktopGroupSummary[]> {
  return invoke<DesktopGroupSummary[]>("list_groups");
}

export async function createGroup(name: string): Promise<DesktopGroupSummary> {
  return invoke<DesktopGroupSummary>("create_group", { name });
}

export async function renameGroup(groupId: string, name: string): Promise<void> {
  return invoke<void>("rename_group", { groupId, name });
}

export async function deleteGroup(groupId: string): Promise<void> {
  return invoke<void>("delete_group", { groupId });
}

export async function openLoginUrl(): Promise<void> {
  return invoke<void>("open_login_url");
}

export async function getAuthStatus(): Promise<AuthStatusSnapshot> {
  return invoke<AuthStatusSnapshot>("get_auth_status");
}

export async function logout(): Promise<AuthStatusSnapshot> {
  return invoke<AuthStatusSnapshot>("logout");
}

export async function openGroupManagementWindow(groupId: string): Promise<void> {
  return invoke<void>("open_group_management_window", { groupId });
}

export async function openErrorLogWindow(errors: string[]): Promise<void> {
  return invoke<void>("open_error_log_window", { errors });
}

export async function openStatusReportWindow(items: string[]): Promise<void> {
  return invoke<void>("open_error_log_window", { errors: items });
}

export async function showMainWindowWhenReady(): Promise<void> {
  return invoke<void>("show_main_window_when_ready");
}

export async function resizeMainWindowToContent(contentHeightLogical: number): Promise<void> {
  return invoke<void>("resize_main_window_to_content", { contentHeightLogical });
}

export const LOCAL_PROXY_MODEL = ZEBRAGATE_MODEL;
