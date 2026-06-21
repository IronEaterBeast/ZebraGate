import { invoke } from "@tauri-apps/api/core";
import { ZEBRAGATE_MODEL } from "./zebragate-shared";

// 本地代理最近一次状态的稳定结构化码，与 Rust ProxyRequestStatus 枚举的序列化值对齐。
// 前端据此判断「启动/停止失败」等需展示给用户的状态，并按码用 i18n 渲染文案，
// 不再依赖文案字符串匹配。面向用户的明细走 lastErrorMessage。
export type ProxyRequestStatus =
  | "IDLE"
  | "STARTING"
  | "STARTED"
  | "STOPPING"
  | "STOPPED"
  | "FAILED_TO_START"
  | "STOPPED_WITH_ERROR"
  | "STOP_VERIFICATION_TIMED_OUT"
  | "REQUEST_SUCCEEDED"
  | "REQUEST_FAILED";

export interface LocalProxyStatus {
  running: boolean;
  port: number | null;
  address: string;
  lastRequestStatus: ProxyRequestStatus;
  lastErrorMessage: string | null;
}

export interface DesktopGroupSummary {
  id: string;
  name: string;
  localKey: string;
  lastUsedAt: number | null;
  isDefault: boolean;
  selectedModelCount: number;
}

export interface DesktopGroupConfig {
  id: string;
  name: string;
  localKey: string;
  lastUsedAt: number | null;
  selectedModels: string[];
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

export interface ModelSelectionSnapshot {
  models: string[];
}

export interface UnavailableModelNotice {
  groupName: string;
  modelNames: string[];
}

export interface ModelCatalogSnapshot {
  models: string[];
  fetchedAt: number | null;
  isStale: boolean;
  unavailableModelNotices: UnavailableModelNotice[];
  // 仅当用户当前实际无法使用（本地无可用 model 且最近拉取失败/服务器返回空）时非空。
  // 本地有缓存数据时即使最近拉取失败也为 null——不打扰用户。由后端统一推导。
  catalogError: string | null;
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

export async function getModelCatalog(): Promise<ModelCatalogSnapshot> {
  return invoke<ModelCatalogSnapshot>("get_model_catalog");
}

export async function refreshModelCatalog(): Promise<ModelCatalogSnapshot> {
  return invoke<ModelCatalogSnapshot>("refresh_model_catalog");
}

// 进入首屏 / 分组管理时主动触发一次拉取。无论成败都不抛错：是否报错由返回快照的
// catalogError 决定（本地有数据时即使失败也静默，仅在用户实际不可用时才提示）。
export async function refreshModelCatalogSilently(): Promise<ModelCatalogSnapshot> {
  return invoke<ModelCatalogSnapshot>("refresh_model_catalog_silently");
}

export async function clearUnavailableModelNotices(): Promise<void> {
  return invoke<void>("clear_unavailable_model_notices");
}

export async function getModelSelection(groupId: string): Promise<ModelSelectionSnapshot> {
  return invoke<ModelSelectionSnapshot>("get_model_selection", { groupId });
}

export async function saveModelSelection(
  groupId: string,
  models: string[]
): Promise<ModelSelectionSnapshot> {
  return invoke<ModelSelectionSnapshot>("save_model_selection", { groupId, models });
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
