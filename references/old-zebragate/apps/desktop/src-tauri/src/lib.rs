use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use aes_gcm::aead::rand_core::RngCore as AesRngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng as AesOsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use axum::body::{Body, Bytes};
use axum::extract::State;
use axum::http::header::{AUTHORIZATION, CACHE_CONTROL, CONTENT_TYPE};
use axum::http::{HeaderMap, Response, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use rand::TryRng;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State as TauriState, WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tokio::net::TcpListener;
use tokio::sync::{oneshot, Mutex};
use tokio::time::{interval, sleep, Duration};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

const DEFAULT_LOCAL_PROXY_PORT: u16 = 7788;
const DEFAULT_REMOTE_API_BASE_URL: &str = "http://localhost:3001";
const DEFAULT_WEB_BASE_URL: &str = "http://localhost:3000";
const DEFAULT_DEV_USER_ID: &str = "00000000-0000-0000-0000-000000000001";
const DEFAULT_MODEL: &str = "zebragate_model";
const LOCAL_PROXY_HOST: &str = "127.0.0.1";
const LOCAL_PROXY_MAX_PORT_ATTEMPTS: u16 = 10;
/// Bounds how long the desktop's HTTP client waits to establish a TCP connection.
/// Without it, a request to an unreachable remote API (the API server is not running,
/// or a system proxy swallows localhost traffic) hangs for the OS default (~21s on
/// Windows). This only limits the connect phase, so it is safe for long-lived
/// streaming chat responses.
const REMOTE_HTTP_CONNECT_TIMEOUT_SECS: u64 = 5;
/// Per-request timeout for short remote metadata calls (AI option catalog, credits
/// balance). Applied per request so it never truncates streamed chat completions.
const REMOTE_METADATA_REQUEST_TIMEOUT_SECS: u64 = 15;
const DESKTOP_CONFIG_FILENAME: &str = "desktop-config.json";
const AI_OPTION_CATALOG_CACHE_FILENAME: &str = "ai-options-catalog.cache";
const AI_OPTION_CATALOG_CACHE_VERSION: u32 = 1;
const AI_OPTION_CATALOG_REFRESH_INTERVAL_SECS: u64 = 60 * 60;
const AI_OPTION_CATALOG_STALE_AFTER_SECS: i64 = 2 * 24 * 60 * 60;
const AUTH_SESSION_FILENAME: &str = "auth-session.bin";
const AUTH_KEY_FILENAME: &str = "auth-key.bin";
const NO_AI_OPTION_SELECTED_USER_MESSAGE: &str =
  "No AI option is selected in ZebraGate Desktop. Please select at least one AI option and try again.";
const NOT_LOGGED_IN_USER_MESSAGE: &str =
    "You are not signed in to ZebraGate Desktop. Please sign in and try again.";
/// How long before the access token's `expires_at` we proactively refresh it,
/// so requests don't race an access token that expires mid-flight.
const TOKEN_REFRESH_LEEWAY_SECS: i64 = 120;
const BAD_GATEWAY_USER_MESSAGE: &str =
    "ZebraGate is temporarily unavailable. Please try again in a moment.";
const UPSTREAM_ERROR_USER_MESSAGE: &str =
    "ZebraGate could not complete this request. Please try again later.";
const TRACE_ID_HEADER: &str = "x-zebragate-trace-id";
const TRACE_EVENTS_ROUTE: &str = "/v1/openai/trace-events";
const REDACTED_TRACE_MESSAGE_CONTENT: &str = "[redacted: user input]";

const MAIN_WINDOW_LABEL: &str = "main";
const GROUP_MANAGEMENT_WINDOW_LABEL: &str = "group-management";
const DESKTOP_GROUPS_CHANGED_EVENT: &str = "desktop-groups-changed";
const GROUP_MANAGEMENT_WINDOW_WIDTH: f64 = 520.0;
const GROUP_MANAGEMENT_WINDOW_HEIGHT: f64 = 640.0;
const ERROR_LOG_WINDOW_LABEL: &str = "error-log";
const ERROR_LOG_WINDOW_WIDTH: f64 = 480.0;
const ERROR_LOG_WINDOW_HEIGHT: f64 = 120.0;
const TRAY_ICON_BYTES: &[u8] = include_bytes!("../icons/32x32.png");
const TRAY_ACTIVE_ICON_BYTES: &[u8] = include_bytes!("../icons/tray-active.png");
const TRAY_BLINK_INTERVAL_MS: u64 = 500;
const WINDOW_GEOMETRY_WIDTH_DIVISOR: u32 = 3;
const WINDOW_GEOMETRY_HEIGHT_DIVISOR: u32 = 5;
const WINDOW_GEOMETRY_MARGIN: i32 = 20;
// Logical (CSS) pixel height used for the main window before the frontend has
// measured its actual content height (e.g. on first paint). The frontend
// reports the real content height via `resize_main_window_to_content` shortly
// after mounting, which replaces this estimate.
const MAIN_WINDOW_MIN_CONTENT_HEIGHT_LOGICAL: f64 = 205.0;
const TRAY_MENU_TOGGLE_ID: &str = "toggle_main_window";
const TRAY_MENU_QUIT_ID: &str = "quit";
const TRAY_MENU_OPEN_WINDOW_TEXT: &str = "打开窗口";
const TRAY_MENU_HIDE_WINDOW_TEXT: &str = "隐藏窗口";
const TRAY_QUIT_CONFIRMATION_TITLE: &str = "确认退出 ZebraGate";
const TRAY_QUIT_CONFIRMATION_MESSAGE: &str =
    "退出后，所有通过 ZebraGate Desktop 发起的访问请求都将失败，直到你重新打开软件。";

/// Computes the desktop window's default size and bottom-right position based on the
/// primary monitor's work area (the screen area excluding the taskbar):
/// width = work_area_width / 3, height = work_area_height / 5.
fn compute_window_geometry(
    work_area_position: PhysicalPosition<i32>,
    work_area_size: PhysicalSize<u32>,
) -> (PhysicalSize<u32>, PhysicalPosition<i32>) {
    let width = (work_area_size.width / WINDOW_GEOMETRY_WIDTH_DIVISOR).max(1);
    let height = (work_area_size.height / WINDOW_GEOMETRY_HEIGHT_DIVISOR).max(1);

    let x = work_area_position.x
        + (work_area_size.width as i32 - width as i32 - WINDOW_GEOMETRY_MARGIN).max(0);
    let y = work_area_bottom_aligned_y(
        work_area_position.y,
        work_area_size.height as i32,
        height as i32,
    );

    (
        PhysicalSize::new(width, height),
        PhysicalPosition::new(x, y),
    )
}

fn apply_initial_window_geometry(window: &tauri::WebviewWindow) {
    // Best-effort sizing/positioning. If the monitor work area is unavailable we
    // still fall through to `show()` below so the window can never get stuck hidden
    // (this is now the only code path that reveals the window).
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let work_area = monitor.work_area();
        let (mut size, mut position) = compute_window_geometry(work_area.position, work_area.size);

        // `compute_window_geometry` divides the monitor's *physical* work area, which
        // does not account for DPI scaling. On scaled displays (125%/150%/...) that can
        // produce a content area shorter than the UI actually needs, causing a vertical
        // scrollbar. Ensure the window is always at least tall enough in logical (CSS)
        // pixels to fit the main page without scrolling.
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let min_height_physical =
            (MAIN_WINDOW_MIN_CONTENT_HEIGHT_LOGICAL * scale_factor).ceil() as u32;
        if size.height < min_height_physical {
            size.height = min_height_physical;
            position.y = work_area_bottom_aligned_y(
                work_area.position.y,
                work_area.size.height as i32,
                size.height as i32,
            );
        }

        if let Err(error) = window.set_size(size) {
            eprintln!("Failed to set desktop window size: {error}");
        }

        // `set_size` resizes the inner (content) area, but the window's outer bounds
        // include OS decorations (title bar/borders). Shrink the target position by
        // that decoration size so the outer window bottom-right stays within the
        // work area instead of sliding under the taskbar.
        if let (Ok(outer_size), Ok(inner_size)) = (window.outer_size(), window.inner_size()) {
            let decoration_width = outer_size.width.saturating_sub(inner_size.width) as i32;
            let decoration_height = outer_size.height.saturating_sub(inner_size.height) as i32;
            position.x -= decoration_width;
            position.y -= decoration_height;
        }

        if let Err(error) = window.set_position(position) {
            eprintln!("Failed to set desktop window position: {error}");
        }
    }

    if let Err(error) = window.show() {
        eprintln!("Failed to show desktop window: {error}");
    }

    update_tray_menu_for_main_window(window.app_handle());
}

fn work_area_bottom_aligned_y(work_area_y: i32, work_area_height: i32, window_height: i32) -> i32 {
    work_area_y + (work_area_height - window_height - WINDOW_GEOMETRY_MARGIN).max(0)
}

/// Holds the tray's "打开窗口/隐藏窗口" menu item so its label can be updated
/// when the main window's visibility changes.
struct TrayToggleMenuItem(MenuItem<tauri::Wry>);

fn setup_system_tray(app: &tauri::App) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(
        app,
        TRAY_MENU_TOGGLE_ID,
        tray_toggle_menu_text(false),
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, TRAY_MENU_QUIT_ID, "退出", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show_item, &separator, &quit_item])?;

    let normal_icon = Image::from_bytes(TRAY_ICON_BYTES)?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(normal_icon)
        .tooltip("ZebraGate")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app_handle, event| match event.id().as_ref() {
            TRAY_MENU_TOGGLE_ID => toggle_main_window_visibility(app_handle),
            TRAY_MENU_QUIT_ID => confirm_and_quit_app(app_handle),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window_visibility(tray.app_handle());
            }
        })
        .build(app)?;

    app.manage(tray);
    app.manage(TrayToggleMenuItem(show_item));

    spawn_tray_blink_task(app.handle().clone());

    Ok(())
}

fn tray_toggle_menu_text(is_visible: bool) -> &'static str {
    if is_visible {
        TRAY_MENU_HIDE_WINDOW_TEXT
    } else {
        TRAY_MENU_OPEN_WINDOW_TEXT
    }
}

fn is_main_window_visible(app_handle: &AppHandle) -> bool {
    app_handle
        .get_webview_window(MAIN_WINDOW_LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

fn update_tray_menu_for_main_window(app_handle: &AppHandle) {
    let toggle_item = app_handle.state::<TrayToggleMenuItem>();
    let _ = toggle_item
        .0
        .set_text(tray_toggle_menu_text(is_main_window_visible(app_handle)));
}

fn show_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
    update_tray_menu_for_main_window(app_handle);
}

fn hide_main_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.hide();
    }
    update_tray_menu_for_main_window(app_handle);
}

fn toggle_main_window_visibility(app_handle: &AppHandle) {
    if is_main_window_visible(app_handle) {
        hide_main_window(app_handle);
    } else {
        show_main_window(app_handle);
    }
}

fn confirm_and_quit_app(app_handle: &AppHandle) {
    let app_handle = app_handle.clone();
    let mut dialog = app_handle
        .dialog()
        .message(TRAY_QUIT_CONFIRMATION_MESSAGE)
        .title(TRAY_QUIT_CONFIRMATION_TITLE)
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "退出".into(),
            "取消".into(),
        ));

    if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
        dialog = dialog.parent(&window);
    }

    dialog.show(move |confirmed| {
        if confirmed {
            quit_app(&app_handle);
        }
    });
}

fn quit_app(app_handle: &AppHandle) {
    let app_handle = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let state = app_handle.state::<DesktopSharedState>();
        let shutdown_tx = {
            let mut runtime = state.inner.lock().await;
            runtime.proxy_status.running = false;
            runtime.shutdown_tx.take()
        };
        if let Some(sender) = shutdown_tx {
            let _ = sender.send(());
        }
        app_handle.exit(0);
    });
}

fn spawn_tray_blink_task(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let normal_icon =
            Image::from_bytes(TRAY_ICON_BYTES).expect("tray icon bytes should decode");
        let active_icon = Image::from_bytes(TRAY_ACTIVE_ICON_BYTES)
            .expect("tray active icon bytes should decode");
        let mut showing_active_icon = false;
        let mut ticker = interval(Duration::from_millis(TRAY_BLINK_INTERVAL_MS));

        loop {
            ticker.tick().await;

            let Some(tray) = app_handle.tray_by_id("main-tray") else {
                continue;
            };
            let state = app_handle.state::<DesktopSharedState>();
            let has_active_requests = state.active_request_count.load(Ordering::Relaxed) > 0;

            if has_active_requests {
                showing_active_icon = !showing_active_icon;
                let icon = if showing_active_icon {
                    &active_icon
                } else {
                    &normal_icon
                };
                let _ = tray.set_icon(Some(icon.clone()));
            } else if showing_active_icon {
                showing_active_icon = false;
                let _ = tray.set_icon(Some(normal_icon.clone()));
            }
        }
    });
}

enum LocalPortBindingStrategy {
    Exact(u16),
    FallbackRange { start_port: u16, max_attempts: u16 },
}

#[derive(Clone)]
struct DesktopSharedState {
    client: Client,
    config_path: Arc<PathBuf>,
    ai_option_catalog_cache_path: Arc<PathBuf>,
    auth_session_path: Arc<PathBuf>,
    auth_key_path: Arc<PathBuf>,
    privacy_keywords: Arc<Vec<String>>,
    inner: Arc<Mutex<DesktopRuntimeState>>,
    active_request_count: Arc<AtomicU32>,
}

/// Marks a local proxy request as "in progress" for the tray icon blink indicator.
/// Increments the shared counter on creation and decrements it on drop, covering
/// both early returns and (when held by a `GuardedStream`) the lifetime of a streamed response.
struct ActiveRequestGuard {
    active_request_count: Arc<AtomicU32>,
}

impl ActiveRequestGuard {
    fn new(active_request_count: Arc<AtomicU32>) -> Self {
        active_request_count.fetch_add(1, Ordering::Relaxed);
        Self {
            active_request_count,
        }
    }
}

impl Drop for ActiveRequestGuard {
    fn drop(&mut self) {
        self.active_request_count.fetch_sub(1, Ordering::Relaxed);
    }
}

/// Wraps a byte stream so the `ActiveRequestGuard` stays alive until the stream
/// is fully consumed or dropped (e.g. when the streamed response finishes or the client disconnects).
///
/// Also accumulates an SSE summary of the bytes forwarded to the local client and
/// records a `desktop_to_client` trace event ("finished" on normal completion,
/// "cancelled" if the stream is dropped before exhaustion) once polling ends.
struct GuardedStream<S> {
    inner: S,
    _guard: ActiveRequestGuard,
    state: DesktopSharedState,
    config: DesktopConfig,
    trace_id: String,
    summary: Option<SseTraceSummaryState>,
    ended: bool,
}

impl<S> futures_util::Stream for GuardedStream<S>
where
    S: futures_util::Stream<Item = reqwest::Result<Bytes>> + Unpin,
{
    type Item = S::Item;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        let poll = std::pin::Pin::new(&mut self.inner).poll_next(cx);

        match &poll {
            std::task::Poll::Ready(Some(Ok(bytes))) => {
                if let Some(summary) = self.summary.as_mut() {
                    summary.push(bytes);
                }
            }
            std::task::Poll::Ready(None) => {
                self.finish_trace(true);
            }
            _ => {}
        }

        poll
    }
}

impl<S> GuardedStream<S> {
    fn finish_trace(&mut self, completed_normally: bool) {
        if self.ended {
            return;
        }
        self.ended = true;

        let Some(summary) = self.summary.take() else {
            return;
        };

        let state = self.state.clone();
        let config = self.config.clone();
        let trace_id = self.trace_id.clone();
        let status = if completed_normally {
            "finished"
        } else {
            "cancelled"
        };

        tokio::spawn(async move {
            let summary_json = summary.finish();
            let preview =
                summarize_sse_stream_summary_for_trace(&summary_json, "stream forwarded to client");
            record_trace_event(
                &state,
                &config,
                json!({
                  "traceId": trace_id,
                  "stage": "desktop_to_client",
                  "direction": "outbound",
                  "component": "desktop",
                  "status": status,
                  "entrypoint": "desktop_local_proxy",
                  "requestKind": "chat.completions",
                  "isStream": true,
                  "payloadJson": { "streamSummary": summary_json },
                  "payloadPreviewText": preview,
                  "metadataJson": {}
                }),
            )
            .await;
        });
    }
}

impl<S> Drop for GuardedStream<S> {
    fn drop(&mut self) {
        self.finish_trace(false);
    }
}

struct DesktopRuntimeState {
    config: DesktopConfig,
    proxy_status: LocalProxyStatusSnapshot,
    shutdown_tx: Option<oneshot::Sender<()>>,
    auth_session: Option<AuthSession>,
    unavailable_ai_option_notices: Vec<UnavailableAiOptionNotice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthSession {
    access_token: String,
    refresh_token: String,
    email: Option<String>,
    #[serde(default)]
    user_id: Option<String>,
    expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthStatusSnapshot {
    logged_in: bool,
    email: Option<String>,
    user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthCallbackPayload {
    access_token: String,
    refresh_token: String,
    email: Option<String>,
    user_id: String,
    expires_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopGroup {
    id: String,
    name: String,
    local_key: String,
    #[serde(default)]
    last_used_at: Option<i64>,
    #[serde(default)]
    selected_ai_option_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUserConfig {
    #[serde(default = "default_privacy_protection_enabled")]
    privacy_protection_enabled: bool,
    groups: Vec<DesktopGroup>,
    default_group_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopConfig {
    remote_api_base_url: String,
    dev_user_id: String,
    last_port: Option<u16>,
    device_id: String,
    #[serde(default)]
    current_user_id: Option<String>,
    #[serde(default = "default_privacy_protection_enabled")]
    privacy_protection_enabled: bool,
    groups: Vec<DesktopGroup>,
    default_group_id: String,
}

impl DesktopConfig {
    fn group(&self, group_id: &str) -> Option<&DesktopGroup> {
        self.groups.iter().find(|group| group.id == group_id)
    }

    fn group_mut(&mut self, group_id: &str) -> Option<&mut DesktopGroup> {
        self.groups.iter_mut().find(|group| group.id == group_id)
    }

    fn user_config(&self) -> DesktopUserConfig {
        DesktopUserConfig {
            privacy_protection_enabled: self.privacy_protection_enabled,
            groups: self.groups.clone(),
            default_group_id: self.default_group_id.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedDesktopConfig {
    remote_api_base_url: String,
    dev_user_id: String,
    last_port: Option<u16>,
    device_id: String,
    #[serde(default)]
    active_user_id: Option<String>,
    #[serde(default)]
    anonymous_user_config: Option<DesktopUserConfig>,
    #[serde(default)]
    user_configs: HashMap<String, DesktopUserConfig>,
}

impl PersistedDesktopConfig {
    fn into_runtime_config(self) -> DesktopConfig {
        let current_user_id = self.active_user_id;
        let selected_user_config = match current_user_id.as_ref() {
            Some(user_id) => self
                .user_configs
                .get(user_id)
                .cloned()
                .unwrap_or_else(build_default_user_config),
            None => self
                .anonymous_user_config
                .unwrap_or_else(build_default_user_config),
        };

        DesktopConfig {
            remote_api_base_url: self.remote_api_base_url,
            dev_user_id: self.dev_user_id,
            last_port: self.last_port,
            device_id: self.device_id,
            current_user_id,
            privacy_protection_enabled: selected_user_config.privacy_protection_enabled,
            groups: selected_user_config.groups,
            default_group_id: selected_user_config.default_group_id,
        }
    }
}

const DEFAULT_GROUP_NAME: &str = "default";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalProxyStatusSnapshot {
    running: bool,
    port: Option<u16>,
    address: String,
    last_request_status: String,
    last_error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopGroupSummary {
    id: String,
    name: String,
    local_key: String,
    last_used_at: Option<i64>,
    is_default: bool,
    selected_ai_option_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeSnapshot {
    proxy_status: LocalProxyStatusSnapshot,
    device_id: String,
    model: String,
    credits: Option<i32>,
    remote_api_error_message: Option<String>,
    groups: Vec<DesktopGroupSummary>,
}

fn build_runtime_snapshot(
    config: &DesktopConfig,
    proxy_status: LocalProxyStatusSnapshot,
    credits: Option<i32>,
    remote_api_error_message: Option<String>,
    groups: Vec<DesktopGroupSummary>,
) -> DesktopRuntimeSnapshot {
    DesktopRuntimeSnapshot {
        proxy_status,
        device_id: config.device_id.clone(),
        model: DEFAULT_MODEL.to_string(),
        credits,
        remote_api_error_message,
        groups,
    }
}

fn build_group_summaries(config: &DesktopConfig) -> Vec<DesktopGroupSummary> {
    config
        .groups
        .iter()
        .map(|group| DesktopGroupSummary {
            id: group.id.clone(),
            name: group.name.clone(),
            local_key: group.local_key.clone(),
            last_used_at: group.last_used_at,
            is_default: group.id == config.default_group_id,
            selected_ai_option_count: group.selected_ai_option_ids.len(),
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiOptionSelectionSnapshot {
    ai_option_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SelectableAiOption {
    ai_option_id: String,
    provider_label: String,
    model_label: String,
    public_name: String,
    display_config_summary: String,
    display_badges: Vec<Value>,
    credit_multiplier: f64,
    is_recommended: bool,
    status: ProviderStatus,
    disable_reason: Option<String>,
    sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiOptionCatalogCache {
    version: u32,
    fetched_at: i64,
    ai_options: Vec<SelectableAiOption>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiOptionCatalogSnapshot {
    ai_options: Vec<SelectableAiOption>,
    fetched_at: Option<i64>,
    is_stale: bool,
    unavailable_ai_option_notices: Vec<UnavailableAiOptionNotice>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UnavailableAiOptionNotice {
    group_name: String,
    ai_option_names: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EncryptedLocalPayload {
    nonce: String,
    ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum ProviderStatus {
    Healthy,
    Degraded,
    Disabled,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize)]
struct AiOptionCatalogResponse {
    #[serde(rename = "aiOptions")]
    ai_options: Vec<SelectableAiOption>,
}

#[derive(Debug, Serialize, Deserialize)]
struct RemoteCreditsBalanceResponse {
    balance: i32,
}

#[derive(Debug, Serialize, Deserialize)]
struct ProxyHealthResponse {
    ok: bool,
    running: bool,
    address: String,
    model: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct LocalModelListResponse {
    object: String,
    data: Vec<LocalModelEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LocalModelEntry {
    id: String,
    object: String,
    created: u64,
    owned_by: String,
}

#[derive(Debug)]
struct ParsedChatRequest {
    body: Value,
    text_for_privacy_scan: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAiErrorEnvelope {
    error: OpenAiErrorBody,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAiErrorBody {
    message: String,
    code: String,
    #[serde(rename = "type")]
    error_type: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // Show + position the main window as soon as its webview finishes loading,
        // independent of any frontend network calls. The window is created hidden
        // (`visible: false` in tauri.conf.json); previously its display was gated behind
        // the React startup data fetch, so a slow/unreachable remote API made it appear
        // very late and as a blank window at the default top-left position.
        .on_page_load(|webview, payload| {
            if webview.label() == MAIN_WINDOW_LABEL
                && payload.event() == tauri::webview::PageLoadEvent::Finished
            {
                if let Some(window) = webview.app_handle().get_webview_window(MAIN_WINDOW_LABEL) {
                    apply_initial_window_geometry(&window);
                }
            }
        })
        .setup(|app| {
            let config_path = get_desktop_config_path(&app.handle()).map_err(io::Error::other)?;
            let config =
                load_or_initialize_desktop_config(&config_path).map_err(io::Error::other)?;
            let proxy_status = LocalProxyStatusSnapshot {
                running: false,
                port: config.last_port,
                address: build_local_address(config.last_port.unwrap_or(DEFAULT_LOCAL_PROXY_PORT)),
                last_request_status: "Local proxy is idle.".to_string(),
                last_error_message: None,
            };

            let config_dir = config_path
                .parent()
                .map(Path::to_path_buf)
                .unwrap_or_else(|| PathBuf::from("."));
            let auth_session_path = config_dir.join(AUTH_SESSION_FILENAME);
            let auth_key_path = config_dir.join(AUTH_KEY_FILENAME);
            let ai_option_catalog_cache_path = config_dir.join(AI_OPTION_CATALOG_CACHE_FILENAME);
            let auth_session =
                load_auth_session(&auth_session_path, &auth_key_path).map_err(io::Error::other)?;
            let config = match auth_session
                .as_ref()
                .and_then(|session| session.user_id.as_deref())
            {
                Some(user_id) => load_desktop_config_for_user(&config_path, Some(user_id))
                    .map_err(io::Error::other)?,
                None => config,
            };

            let state = DesktopSharedState {
                client: Client::builder()
                    .connect_timeout(Duration::from_secs(REMOTE_HTTP_CONNECT_TIMEOUT_SECS))
                    .build()
                    .map_err(|error| {
                        io::Error::other(format!("Failed to build desktop HTTP client: {error}"))
                    })?,
                config_path: Arc::new(config_path),
                ai_option_catalog_cache_path: Arc::new(ai_option_catalog_cache_path),
                auth_session_path: Arc::new(auth_session_path),
                auth_key_path: Arc::new(auth_key_path),
                privacy_keywords: Arc::new(load_privacy_keywords().map_err(io::Error::other)?),
                inner: Arc::new(Mutex::new(DesktopRuntimeState {
                    config,
                    proxy_status,
                    shutdown_tx: None,
                    auth_session,
                    unavailable_ai_option_notices: Vec::new(),
                })),
                active_request_count: Arc::new(AtomicU32::new(0)),
            };

            let refresh_state = state.clone();
            app.manage(state);
            spawn_ai_option_catalog_refresh_loop(refresh_state);

            setup_system_tray(app)?;

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<DesktopSharedState>();
                if let Err(error) = start_local_proxy(state, None).await {
                    eprintln!("Failed to auto-start local proxy: {error}");
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == MAIN_WINDOW_LABEL {
                match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        hide_main_window(window.app_handle());
                    }
                    // The window's DPI scale factor changes when it is dragged onto a monitor
                    // with a different scaling setting. Re-run the initial geometry logic so the
                    // minimum-content-height check is re-evaluated against the new scale factor,
                    // otherwise the window can end up too short and show a vertical scrollbar.
                    WindowEvent::ScaleFactorChanged { .. } => {
                        if let Some(webview_window) =
                            window.app_handle().get_webview_window(MAIN_WINDOW_LABEL)
                        {
                            apply_initial_window_geometry(&webview_window);
                        }
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_desktop_bootstrap_snapshot,
            get_desktop_runtime_snapshot,
            get_desktop_config,
            start_local_proxy,
            stop_local_proxy,
            get_local_proxy_status,
            get_ai_option_catalog,
            refresh_ai_option_catalog,
            clear_unavailable_ai_option_notices,
            get_ai_option_selection,
            save_ai_option_selection,
            list_groups,
            create_group,
            rename_group,
            delete_group,
            open_login_url,
            get_auth_status,
            logout,
            open_group_management_window,
            open_error_log_window,
            show_main_window_when_ready,
            resize_main_window_to_content
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn get_desktop_bootstrap_snapshot(
    state: TauriState<'_, DesktopSharedState>,
) -> Result<DesktopRuntimeSnapshot, String> {
    let (config, proxy_status) = {
        let runtime = state.inner.lock().await;
        (runtime.config.clone(), runtime.proxy_status.clone())
    };

    Ok(build_runtime_snapshot(
        &config,
        proxy_status,
        None,
        None,
        build_group_summaries(&config),
    ))
}

#[tauri::command]
async fn get_desktop_runtime_snapshot(
    state: TauriState<'_, DesktopSharedState>,
) -> Result<DesktopRuntimeSnapshot, String> {
    let config = refresh_effective_ai_option_selections(&state, &state.inner).await?;
    let (credits, remote_api_error_message) =
        match fetch_remote_credits_balance(state.inner(), &config).await {
            Ok(credits) => (Some(credits), None),
            Err(error) => (None, Some(error)),
        };
    let proxy_status = {
        let runtime = state.inner.lock().await;
        runtime.proxy_status.clone()
    };

    Ok(build_runtime_snapshot(
        &config,
        proxy_status,
        credits,
        remote_api_error_message,
        build_group_summaries(&config),
    ))
}

#[tauri::command]
async fn get_desktop_config(
    state: TauriState<'_, DesktopSharedState>,
) -> Result<DesktopConfig, String> {
    let runtime = state.inner.lock().await;
    Ok(runtime.config.clone())
}

#[tauri::command]
async fn start_local_proxy(
    state: TauriState<'_, DesktopSharedState>,
    preferred_port: Option<u16>,
) -> Result<LocalProxyStatusSnapshot, String> {
    {
        let runtime = state.inner.lock().await;
        if runtime.proxy_status.running {
            return Ok(runtime.proxy_status.clone());
        }
    }

    let starting_port = preferred_port.or_else(|| futuresafe_blocking_read_last_port(&state.inner));
    let bind_strategy = match starting_port {
        Some(port) => LocalPortBindingStrategy::Exact(port),
        None => LocalPortBindingStrategy::FallbackRange {
            start_port: DEFAULT_LOCAL_PROXY_PORT,
            max_attempts: LOCAL_PROXY_MAX_PORT_ATTEMPTS,
        },
    };
    let (listener, bound_port) = bind_local_proxy_listener(bind_strategy).await?;
    let address = build_local_address(bound_port);
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let startup_warning = {
        let mut runtime = state.inner.lock().await;
        runtime.config.last_port = Some(bound_port);
        persist_desktop_config(state.config_path.as_path(), &runtime.config)?;

        let selected_ai_warning = if runtime
            .config
            .groups
            .iter()
            .all(|group| group.selected_ai_option_ids.is_empty())
        {
            Some(
        "尚未选择 AI。本地服务可以启动，但客户端的请求会被本地拒绝，请选择至少一个 AI 选项。"
          .to_string(),
      )
        } else {
            None
        };

        runtime.proxy_status = LocalProxyStatusSnapshot {
            running: false,
            port: Some(bound_port),
            address: address.clone(),
            last_request_status: format!("Starting local proxy on {address}..."),
            last_error_message: selected_ai_warning.clone(),
        };
        runtime.shutdown_tx = Some(shutdown_tx);
        selected_ai_warning
    };

    let server_state = state.inner.clone();
    let app = build_local_proxy_router(
        state.inner.clone(),
        state.client.clone(),
        state.config_path.clone(),
        state.ai_option_catalog_cache_path.clone(),
        state.auth_session_path.clone(),
        state.auth_key_path.clone(),
        state.privacy_keywords.clone(),
        state.active_request_count.clone(),
    );

    tauri::async_runtime::spawn(async move {
        let server_result = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            })
            .await;

        let mut runtime = server_state.lock().await;
        runtime.proxy_status.running = false;
        runtime.shutdown_tx = None;

        if let Err(error) = server_result {
            runtime.proxy_status.last_request_status =
                "Local proxy stopped with an error.".to_string();
            runtime.proxy_status.last_error_message = Some(error.to_string());
        } else if runtime
            .proxy_status
            .last_request_status
            .starts_with("Local proxy started on")
        {
            runtime.proxy_status.last_request_status = "Local proxy stopped.".to_string();
        }
    });

    match verify_local_proxy_health(&state.client, &address).await {
        Ok(()) => {
            let mut runtime = state.inner.lock().await;
            runtime.proxy_status.running = true;
            runtime.proxy_status.last_request_status =
                format!("Local proxy started on {address}. Health check passed.");
            runtime.proxy_status.last_error_message = startup_warning;
            Ok(runtime.proxy_status.clone())
        }
        Err(error) => {
            let shutdown_tx = {
                let mut runtime = state.inner.lock().await;
                runtime.proxy_status.running = false;
                runtime.proxy_status.last_request_status =
                    "Local proxy failed to start.".to_string();
                runtime.proxy_status.last_error_message = Some(error.clone());
                runtime.shutdown_tx.take()
            };

            if let Some(sender) = shutdown_tx {
                let _ = sender.send(());
            }

            Err(error)
        }
    }
}

#[tauri::command]
async fn stop_local_proxy(
    state: TauriState<'_, DesktopSharedState>,
) -> Result<LocalProxyStatusSnapshot, String> {
    let shutdown_tx = {
        let mut runtime = state.inner.lock().await;
        runtime.proxy_status.running = false;
        runtime.proxy_status.last_request_status = "Stopping local proxy...".to_string();
        runtime.shutdown_tx.take()
    };

    if let Some(sender) = shutdown_tx {
        let _ = sender.send(());
    }

    let stop_verification = {
        let runtime = state.inner.lock().await;
        runtime.proxy_status.address.clone()
    };
    let stop_result = verify_local_proxy_stopped(&state.client, &stop_verification).await;

    let mut runtime = state.inner.lock().await;
    runtime.proxy_status.running = false;
    runtime.shutdown_tx = None;
    runtime.proxy_status.last_request_status = "Local proxy stopped.".to_string();
    if let Err(error) = stop_result {
        runtime.proxy_status.last_request_status =
            "Local proxy stop verification timed out.".to_string();
        runtime.proxy_status.last_error_message = Some(error);
    }
    Ok(runtime.proxy_status.clone())
}

#[tauri::command]
async fn get_local_proxy_status(
    state: TauriState<'_, DesktopSharedState>,
) -> Result<LocalProxyStatusSnapshot, String> {
    let runtime = state.inner.lock().await;
    Ok(runtime.proxy_status.clone())
}

#[tauri::command]
async fn get_ai_option_catalog(
    state: TauriState<'_, DesktopSharedState>,
) -> Result<AiOptionCatalogSnapshot, String> {
    Ok(build_ai_option_catalog_snapshot(state.inner()).await)
}

#[tauri::command]
async fn refresh_ai_option_catalog(
    state: TauriState<'_, DesktopSharedState>,
) -> Result<AiOptionCatalogSnapshot, String> {
    refresh_ai_option_catalog_from_remote(state.inner()).await?;
    Ok(build_ai_option_catalog_snapshot(state.inner()).await)
}

#[tauri::command]
async fn clear_unavailable_ai_option_notices(
    state: TauriState<'_, DesktopSharedState>,
) -> Result<(), String> {
    let mut runtime = state.inner.lock().await;
    runtime.unavailable_ai_option_notices.clear();
    Ok(())
}

#[tauri::command]
async fn get_ai_option_selection(
    state: TauriState<'_, DesktopSharedState>,
    group_id: String,
) -> Result<AiOptionSelectionSnapshot, String> {
    let config = refresh_effective_ai_option_selections(&state, &state.inner).await?;
    let group = config
        .group(&group_id)
        .ok_or_else(|| format!("Unknown group id: {group_id}."))?;
    Ok(AiOptionSelectionSnapshot {
        ai_option_ids: group.selected_ai_option_ids.clone(),
    })
}

#[tauri::command]
async fn save_ai_option_selection(
    app_handle: AppHandle,
    state: TauriState<'_, DesktopSharedState>,
    group_id: String,
    ai_option_ids: Vec<String>,
) -> Result<AiOptionSelectionSnapshot, String> {
    let config = {
        let runtime = state.inner.lock().await;
        runtime.config.clone()
    };

    if config.group(&group_id).is_none() {
        return Err(format!("Unknown group id: {group_id}."));
    }

    let deduped_ai_option_ids = dedupe_ai_option_ids(ai_option_ids);
    if !deduped_ai_option_ids.is_empty() {
        let cache = read_ai_option_catalog_cache(state.inner()).await?;
        validate_ai_option_selection_against_catalog(&deduped_ai_option_ids, cache.as_ref())?;
    }

    {
        let mut runtime = state.inner.lock().await;
        let group = runtime
            .config
            .group_mut(&group_id)
            .ok_or_else(|| format!("Unknown group id: {group_id}."))?;
        group.selected_ai_option_ids = deduped_ai_option_ids.clone();
        persist_desktop_config(state.config_path.as_path(), &runtime.config)?;
    }

    emit_desktop_groups_changed(&app_handle);

    Ok(AiOptionSelectionSnapshot {
        ai_option_ids: deduped_ai_option_ids,
    })
}

#[tauri::command]
async fn list_groups(
    state: TauriState<'_, DesktopSharedState>,
) -> Result<Vec<DesktopGroupSummary>, String> {
    let config = refresh_effective_ai_option_selections(&state, &state.inner).await?;
    Ok(build_group_summaries(&config))
}

#[tauri::command]
async fn create_group(
    app_handle: AppHandle,
    state: TauriState<'_, DesktopSharedState>,
    name: String,
) -> Result<DesktopGroupSummary, String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Group name must not be empty.".to_string());
    }

    let recommended_ai_option_ids = {
        let config = {
            let runtime = state.inner.lock().await;
            runtime.config.clone()
        };
        fetch_ai_option_catalog(state.inner(), &config)
            .await
            .map(|ai_options| recommended_ai_option_ids(&ai_options))
            .unwrap_or_default()
    };

    let new_group = DesktopGroup {
        id: Uuid::new_v4().to_string(),
        name: trimmed_name.to_string(),
        local_key: format!("zg-local-{}", Uuid::new_v4().simple()),
        last_used_at: None,
        selected_ai_option_ids: recommended_ai_option_ids,
    };

    let mut runtime = state.inner.lock().await;
    runtime.config.groups.push(new_group.clone());
    persist_desktop_config(state.config_path.as_path(), &runtime.config)?;
    emit_desktop_groups_changed(&app_handle);

    Ok(DesktopGroupSummary {
        id: new_group.id,
        name: new_group.name,
        local_key: new_group.local_key,
        last_used_at: new_group.last_used_at,
        is_default: false,
        selected_ai_option_count: new_group.selected_ai_option_ids.len(),
    })
}

#[tauri::command]
async fn rename_group(
    app_handle: AppHandle,
    state: TauriState<'_, DesktopSharedState>,
    group_id: String,
    name: String,
) -> Result<(), String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Group name must not be empty.".to_string());
    }

    let mut runtime = state.inner.lock().await;
    let group = runtime
        .config
        .group_mut(&group_id)
        .ok_or_else(|| format!("Unknown group id: {group_id}."))?;
    group.name = trimmed_name.to_string();
    persist_desktop_config(state.config_path.as_path(), &runtime.config)?;
    emit_desktop_groups_changed(&app_handle);

    Ok(())
}

#[tauri::command]
async fn delete_group(
    app_handle: AppHandle,
    state: TauriState<'_, DesktopSharedState>,
    group_id: String,
) -> Result<(), String> {
    let mut runtime = state.inner.lock().await;

    delete_group_from_config(&mut runtime.config, &group_id)?;

    persist_desktop_config(state.config_path.as_path(), &runtime.config)?;
    emit_desktop_groups_changed(&app_handle);

    Ok(())
}

fn emit_desktop_groups_changed(app_handle: &AppHandle) {
    if let Err(error) = app_handle.emit(DESKTOP_GROUPS_CHANGED_EVENT, ()) {
        eprintln!("Failed to emit desktop groups changed event: {error}");
    }
}

fn delete_group_from_config(config: &mut DesktopConfig, group_id: &str) -> Result<(), String> {
    let delete_index = config
        .groups
        .iter()
        .position(|group| group.id == group_id)
        .ok_or_else(|| format!("Unknown group id: {group_id}."))?;

    if config.groups.len() == 1 {
        return Err("The last group cannot be deleted.".to_string());
    }

    config.groups.remove(delete_index);

    if !config
        .groups
        .iter()
        .any(|group| group.id == config.default_group_id)
    {
        config.default_group_id = config
            .groups
            .first()
            .map(|group| group.id.clone())
            .ok_or_else(|| "The last group cannot be deleted.".to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn open_group_management_window(
    app_handle: tauri::AppHandle,
    group_id: String,
) -> Result<(), String> {
    let hash = format!(
        "#/group-management?groupId={}",
        urlencoding_encode(&group_id)
    );

    if let Some(window) = app_handle.get_webview_window(GROUP_MANAGEMENT_WINDOW_LABEL) {
        window
            .eval(&format!("window.location.hash = {hash:?}"))
            .map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        &app_handle,
        GROUP_MANAGEMENT_WINDOW_LABEL,
        tauri::WebviewUrl::App(format!("index.html{hash}").into()),
    )
    .title("分组管理")
    .inner_size(
        GROUP_MANAGEMENT_WINDOW_WIDTH,
        GROUP_MANAGEMENT_WINDOW_HEIGHT,
    )
    .min_inner_size(360.0, 400.0)
    .resizable(true)
    .maximized(true)
    .center()
    .build()
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
async fn open_error_log_window(
    app_handle: tauri::AppHandle,
    errors: Vec<String>,
) -> Result<(), String> {
    let errors_json = serde_json::to_string(&errors).map_err(|error| error.to_string())?;
    let hash = format!("#/error-log?errors={}", urlencoding_encode(&errors_json));

    if let Some(window) = app_handle.get_webview_window(ERROR_LOG_WINDOW_LABEL) {
        window
            .eval(&format!("window.location.hash = {hash:?}"))
            .map_err(|error| error.to_string())?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    tauri::WebviewWindowBuilder::new(
        &app_handle,
        ERROR_LOG_WINDOW_LABEL,
        tauri::WebviewUrl::App(format!("index.html{hash}").into()),
    )
    .title("当前错误")
    .inner_size(ERROR_LOG_WINDOW_WIDTH, ERROR_LOG_WINDOW_HEIGHT)
    .resizable(true)
    .build()
    .map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
async fn open_login_url(
    app_handle: tauri::AppHandle,
    state: TauriState<'_, DesktopSharedState>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let port = {
        let runtime = state.inner.lock().await;
        runtime.config.last_port.unwrap_or(DEFAULT_LOCAL_PROXY_PORT)
    };
    let callback_url = format!("{}/auth/callback", build_local_address(port));
    let web_base_url = resolve_web_base_url();
    let login_url = format!(
        "{}/desktop-login?callback={}",
        web_base_url.trim_end_matches('/'),
        urlencoding_encode(&callback_url)
    );

    app_handle
        .opener()
        .open_url(login_url, None::<&str>)
        .map_err(|error| format!("Failed to open system browser: {error}"))
}

#[tauri::command]
async fn get_auth_status(
    state: TauriState<'_, DesktopSharedState>,
) -> Result<AuthStatusSnapshot, String> {
    let runtime = state.inner.lock().await;
    Ok(match &runtime.auth_session {
        Some(session) => AuthStatusSnapshot {
            logged_in: true,
            email: session.email.clone(),
            user_id: session.user_id.clone(),
        },
        None => AuthStatusSnapshot {
            logged_in: false,
            email: None,
            user_id: None,
        },
    })
}

#[tauri::command]
async fn show_main_window_when_ready(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window(MAIN_WINDOW_LABEL) {
        apply_initial_window_geometry(&window);
    }
    Ok(())
}

/// Resizes the main window's height to fit `content_height_logical` (the
/// frontend's measured `.app-shell` height in CSS pixels), so the window is
/// exactly tall enough to show its content without a vertical scrollbar.
/// The width is left unchanged. If the content is taller than the monitor's
/// work area, the height is clamped and the frontend's own scroll container
/// takes over.
#[tauri::command]
async fn resize_main_window_to_content(
    app_handle: tauri::AppHandle,
    content_height_logical: f64,
) -> Result<(), String> {
    let window = app_handle
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "Main window not found.".to_string())?;

    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let current_size = window.inner_size().map_err(|error| error.to_string())?;

    let mut target_height = (content_height_logical * scale_factor).ceil() as u32;
    target_height = target_height.max(1);

    if let Ok(Some(monitor)) = window.primary_monitor() {
        let work_area = monitor.work_area();
        let max_height = work_area
            .size
            .height
            .saturating_sub((WINDOW_GEOMETRY_MARGIN * 2).max(0) as u32)
            .max(1);
        target_height = target_height.min(max_height);
    }

    if target_height == current_size.height {
        return Ok(());
    }

    window
        .set_size(PhysicalSize::new(current_size.width, target_height))
        .map_err(|error| error.to_string())?;

    if let (Ok(Some(monitor)), Ok(position)) = (window.primary_monitor(), window.outer_position()) {
        let work_area = monitor.work_area();
        let decoration_height = window
            .outer_size()
            .ok()
            .and_then(|outer_size| {
                window
                    .inner_size()
                    .ok()
                    .map(|inner_size| (outer_size, inner_size))
            })
            .map(|(outer_size, inner_size)| {
                outer_size.height.saturating_sub(inner_size.height) as i32
            })
            .unwrap_or(0);
        let outer_height = target_height as i32 + decoration_height;
        let target_y = work_area_bottom_aligned_y(
            work_area.position.y,
            work_area.size.height as i32,
            outer_height,
        );

        if position.y != target_y {
            if let Err(error) = window.set_position(PhysicalPosition::new(position.x, target_y)) {
                eprintln!("Failed to reposition desktop window after resize: {error}");
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn logout(state: TauriState<'_, DesktopSharedState>) -> Result<AuthStatusSnapshot, String> {
    let mut runtime = state.inner.lock().await;
    runtime.auth_session = None;
    runtime.config = load_desktop_config_for_user(state.config_path.as_path(), None)?;
    clear_auth_session(state.auth_session_path.as_path())?;
    Ok(AuthStatusSnapshot {
        logged_in: false,
        email: None,
        user_id: None,
    })
}

fn build_local_proxy_router(
    inner: Arc<Mutex<DesktopRuntimeState>>,
    client: Client,
    config_path: Arc<PathBuf>,
    ai_option_catalog_cache_path: Arc<PathBuf>,
    auth_session_path: Arc<PathBuf>,
    auth_key_path: Arc<PathBuf>,
    privacy_keywords: Arc<Vec<String>>,
    active_request_count: Arc<AtomicU32>,
) -> Router {
    let state = DesktopSharedState {
        client,
        config_path,
        ai_option_catalog_cache_path,
        auth_session_path,
        auth_key_path,
        privacy_keywords,
        inner,
        active_request_count,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(local_health_handler))
        .route("/v1/models", get(local_models_handler))
        .route("/v1/chat/completions", post(local_chat_completions_handler))
        .route(
            "/v1/openai/chat/completions",
            post(local_chat_completions_handler),
        )
        .route("/auth/callback", post(auth_callback_handler))
        .fallback(local_not_found_handler)
        .layer(cors)
        .with_state(state)
}

async fn auth_callback_handler(
    State(state): State<DesktopSharedState>,
    Json(payload): Json<AuthCallbackPayload>,
) -> Response<Body> {
    let session = AuthSession {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        email: payload.email,
        user_id: Some(payload.user_id.clone()),
        expires_at: payload.expires_at,
    };

    if let Err(error) = save_auth_session(
        state.auth_session_path.as_path(),
        state.auth_key_path.as_path(),
        &session,
    ) {
        return openai_error_response(StatusCode::INTERNAL_SERVER_ERROR, &error, "INTERNAL_ERROR");
    }

    {
        let mut runtime = state.inner.lock().await;
        runtime.auth_session = Some(session.clone());
    }
    let _ = refresh_ai_option_catalog_from_remote(&state).await;
    let recommended_ai_option_ids = read_ai_option_catalog_cache(&state)
        .await
        .ok()
        .flatten()
        .map(|cache| recommended_ai_option_ids(&cache.ai_options))
        .unwrap_or_default();

    {
        let mut runtime = state.inner.lock().await;
        let migrate_existing_anonymous = runtime.config.current_user_id.is_none();
        let fallback_user_config = if migrate_existing_anonymous {
            let mut user_config = runtime.config.user_config();
            fill_single_empty_default_group_selection(&mut user_config, &recommended_ai_option_ids);
            Some(user_config)
        } else {
            Some(build_default_user_config_with_ai_option_ids(
                &recommended_ai_option_ids,
            ))
        };
        let next_config = match load_desktop_config_for_user_with_fallback(
            state.config_path.as_path(),
            Some(payload.user_id.as_str()),
            fallback_user_config,
        ) {
            Ok(config) => config,
            Err(error) => {
                return openai_error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &error,
                    "INTERNAL_ERROR",
                )
            }
        };
        runtime.config = next_config;
    }

    json_response(StatusCode::OK, &json!({ "ok": true }))
}

async fn local_health_handler(State(state): State<DesktopSharedState>) -> impl IntoResponse {
    let runtime = state.inner.lock().await;
    Json(ProxyHealthResponse {
        ok: true,
        running: runtime.proxy_status.running,
        address: runtime.proxy_status.address.clone(),
        model: DEFAULT_MODEL.to_string(),
    })
}

async fn local_models_handler(
    State(state): State<DesktopSharedState>,
    headers: HeaderMap,
) -> Response<Body> {
    if let Err(response) = authorize_local_request(&state, &headers).await {
        return response;
    }

    let payload = LocalModelListResponse {
        object: "list".to_string(),
        data: vec![LocalModelEntry {
            id: DEFAULT_MODEL.to_string(),
            object: "model".to_string(),
            created: 0,
            owned_by: "zebragate".to_string(),
        }],
    };

    json_response(StatusCode::OK, &payload)
}

async fn local_chat_completions_handler(
    State(state): State<DesktopSharedState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response<Body> {
    let active_request_guard = ActiveRequestGuard::new(state.active_request_count.clone());
    let trace_id = Uuid::new_v4().to_string();

    let group_id = match authorize_local_request(&state, &headers).await {
        Ok(group_id) => group_id,
        Err(response) => return response,
    };

    let mut parsed_request = match parse_chat_completion_request(&body) {
        Ok(request) => request,
        Err(message) => {
            record_proxy_error(
                &state,
                "Local request validation failed.",
                Some(message.clone()),
            )
            .await;
            return openai_error_response(StatusCode::BAD_REQUEST, &message, "BAD_REQUEST");
        }
    };

    let privacy_protection_enabled = {
        let runtime = state.inner.lock().await;
        runtime.config.privacy_protection_enabled
    };
    if privacy_protection_enabled {
        let matched_keywords = detect_sensitive_keywords(
            &parsed_request.text_for_privacy_scan,
            &state.privacy_keywords,
        );
        if !matched_keywords.is_empty() {
            eprintln!(
                "ZebraGate Desktop blocked a request due to sensitive content. matched_count={}",
                matched_keywords.len()
            );
            record_proxy_error(
        &state,
        "Blocked by local privacy protection.",
        Some("Sensitive content category detected. Please remove sensitive information and try again.".to_string()),
      )
      .await;
            return openai_error_response(
        StatusCode::FORBIDDEN,
        "ZebraGate blocked this request because it may contain sensitive information. Please remove sensitive content and try again.",
        "PRIVACY_BLOCKED",
      );
        }
    }

    let config = {
        let runtime = state.inner.lock().await;
        runtime.config.clone()
    };

    record_trace_event(
    &state,
    &config,
    build_trace_event_payload(
      &trace_id,
      "desktop_inbound",
      "inbound",
      "desktop",
      "started",
      &parsed_request.body,
      request_trace_headers(&headers),
      json!({
        "entrypoint": "desktop_local_proxy",
        "requestKind": "chat.completions",
        "clientRequestModel": parsed_request.body.get("model").and_then(Value::as_str).unwrap_or_default(),
        "isStream": parsed_request.body.get("stream").and_then(Value::as_bool).unwrap_or(false)
      }),
      None,
      None,
      None,
    ),
  )
  .await;

    if let Err(message) = ensure_user_logged_in_for_proxy(&state.inner).await {
        record_proxy_error(&state, "User is not signed in.", Some(message.clone())).await;
        return openai_error_response(StatusCode::UNAUTHORIZED, &message, "NOT_LOGGED_IN");
    }

    let effective_config = match refresh_effective_ai_option_selections(&state, &state.inner).await
    {
        Ok(config) => config,
        Err(error) => {
            record_proxy_error(
                &state,
                "Failed to load local AI option selection.",
                Some(error.clone()),
            )
            .await;
            return openai_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                &error,
                "INTERNAL_ERROR",
            );
        }
    };

    let effective_selected_ai_option_ids = effective_config
        .group(&group_id)
        .map(|group| group.selected_ai_option_ids.clone())
        .unwrap_or_default();

    if let Err(message) = ensure_ai_option_selection_for_proxy(&effective_selected_ai_option_ids) {
        record_proxy_error(&state, "No AI option selected.", Some(message.clone())).await;
        return openai_error_response(
            StatusCode::BAD_REQUEST,
            NO_AI_OPTION_SELECTED_USER_MESSAGE,
            "NO_AI_OPTION_SELECTED",
        );
    }

    inject_ai_option_ids(&mut parsed_request.body, &effective_selected_ai_option_ids);

    record_trace_event(
    &state,
    &config,
    build_trace_event_payload(
      &trace_id,
      "desktop_to_server",
      "outbound",
      "desktop",
      "started",
      &parsed_request.body,
      json!({
        "x-device-id": config.device_id.clone(),
        "x-zebragate-local-proxy": "true",
        TRACE_ID_HEADER: trace_id.clone()
      }),
      json!({
        "entrypoint": "desktop_local_proxy",
        "requestKind": "chat.completions",
        "clientRequestModel": parsed_request.body.get("model").and_then(Value::as_str).unwrap_or_default(),
        "isStream": parsed_request.body.get("stream").and_then(Value::as_bool).unwrap_or(false),
        "selectedAiOptionIds": effective_selected_ai_option_ids
      }),
      None,
      None,
      None,
    ),
  )
  .await;

    let remote_url = format!(
        "{}/v1/openai/chat/completions",
        config.remote_api_base_url.trim_end_matches('/')
    );
    let mut remote_request = state
        .client
        .post(remote_url)
        .header(CONTENT_TYPE, "application/json")
        .header("x-device-id", config.device_id.clone())
        .header("x-zebragate-local-proxy", "true")
        .header(TRACE_ID_HEADER, trace_id.clone())
        .json(&parsed_request.body);

    remote_request = apply_user_auth_header(remote_request, &state, &config).await;

    let remote_response = match remote_request.send().await {
        Ok(response) => response,
        Err(error) => {
            eprintln!("ZebraGate Desktop could not reach ZebraGate API Server: {error}");
            record_proxy_error(
                &state,
                "ZebraGate API 服务未连接，请确认 API 服务已启动。",
                Some("ZebraGate API 服务未连接，请确认 API 服务已启动。".to_string()),
            )
            .await;
            return openai_error_response(
                StatusCode::BAD_GATEWAY,
                BAD_GATEWAY_USER_MESSAGE,
                "BAD_GATEWAY",
            );
        }
    };

    build_proxy_response(
        state,
        config,
        trace_id,
        remote_response,
        active_request_guard,
    )
    .await
}

async fn local_not_found_handler() -> Response<Body> {
    openai_error_response(
        StatusCode::NOT_FOUND,
        "Local proxy route was not found.",
        "NOT_FOUND",
    )
}

async fn apply_user_auth_header(
    request: reqwest::RequestBuilder,
    state: &DesktopSharedState,
    config: &DesktopConfig,
) -> reqwest::RequestBuilder {
    let access_token = ensure_fresh_access_token(state, config).await;

    if let Some(token) = access_token {
        return request.bearer_auth(token);
    }

    if !config.dev_user_id.trim().is_empty() {
        return request.header("x-zebragate-user-id", config.dev_user_id.clone());
    }

    request
}

/// Returns the current access token, transparently refreshing it first if it is
/// at or past its `expires_at` (with a leeway buffer). Returns `None` when the
/// user is not logged in.
async fn ensure_fresh_access_token(
    state: &DesktopSharedState,
    config: &DesktopConfig,
) -> Option<String> {
    let session = {
        let runtime = state.inner.lock().await;
        runtime.auth_session.clone()
    };

    let session = session?;

    let needs_refresh = match session.expires_at {
        Some(expires_at) => current_unix_timestamp() + TOKEN_REFRESH_LEEWAY_SECS >= expires_at,
        None => false,
    };

    if !needs_refresh {
        return Some(session.access_token);
    }

    match refresh_auth_session(state, config, &session.refresh_token).await {
        Ok(refreshed) => Some(refreshed.access_token),
        Err(error) => {
            eprintln!("ZebraGate Desktop failed to refresh the access token: {error}");
            Some(session.access_token)
        }
    }
}

/// Exchanges the refresh token for a fresh access token via the ZebraGate API,
/// persisting the result so the desktop stays signed in across access-token
/// expirations (~1 hour) without requiring the user to log in again.
async fn refresh_auth_session(
    state: &DesktopSharedState,
    config: &DesktopConfig,
    refresh_token: &str,
) -> Result<AuthSession, String> {
    let url = format!(
        "{}/v1/auth/refresh",
        config.remote_api_base_url.trim_end_matches('/')
    );

    let response = state
        .client
        .post(url)
        .timeout(Duration::from_secs(REMOTE_METADATA_REQUEST_TIMEOUT_SECS))
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({ "refreshToken": refresh_token }))
        .send()
        .await
        .map_err(|error| format!("Failed to reach ZebraGate API for token refresh: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        if status == StatusCode::UNAUTHORIZED {
            let mut runtime = state.inner.lock().await;
            runtime.auth_session = None;
            let _ = clear_auth_session(state.auth_session_path.as_path());
        }
        return Err(format!(
            "Token refresh request failed with {}.",
            status.as_u16()
        ));
    }

    let session = response
        .json::<AuthSession>()
        .await
        .map_err(|error| format!("Failed to decode token refresh response: {error}"))?;

    save_auth_session(
        state.auth_session_path.as_path(),
        state.auth_key_path.as_path(),
        &session,
    )?;

    {
        let mut runtime = state.inner.lock().await;
        let next_user_id = session.user_id.as_deref();
        runtime.config = load_desktop_config_for_user_with_fallback(
            state.config_path.as_path(),
            next_user_id,
            next_user_id
                .filter(|_| runtime.config.current_user_id.is_none())
                .map(|_| runtime.config.user_config()),
        )?;
        runtime.auth_session = Some(session.clone());
    }

    Ok(session)
}

fn current_unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

/// Authorizes a local proxy request by matching the `Authorization: Bearer <key>`
/// header against every group's `local_key`. Returns the matched group's id so
/// callers can use that group's AI option selection.
async fn authorize_local_request(
    state: &DesktopSharedState,
    headers: &HeaderMap,
) -> Result<String, Response<Body>> {
    let authorization_header = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .trim()
        .to_string();

    let local_key = authorization_header
        .strip_prefix("Bearer ")
        .unwrap_or_default();

    let matched_group_id = {
        let mut runtime = state.inner.lock().await;
        let matched_group_index = runtime
            .config
            .groups
            .iter()
            .position(|group| group.local_key == local_key);
        match matched_group_index {
            Some(index) => {
                runtime.config.groups[index].last_used_at = Some(current_unix_timestamp());
                let group_id = runtime.config.groups[index].id.clone();
                if let Err(error) =
                    persist_desktop_config(state.config_path.as_path(), &runtime.config)
                {
                    let message = format!("Failed to persist group usage time: {error}");
                    drop(runtime);
                    record_proxy_error(
                        state,
                        "Failed to persist group usage time.",
                        Some(message.clone()),
                    )
                    .await;
                    return Err(openai_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        &message,
                        "INTERNAL_ERROR",
                    ));
                }
                Some(group_id)
            }
            None => None,
        }
    };

    if let Some(group_id) = matched_group_id {
        return Ok(group_id);
    }

    record_proxy_error(
        state,
        "Local proxy key rejected.",
        Some("Invalid local proxy key.".to_string()),
    )
    .await;
    Err(openai_error_response(
        StatusCode::UNAUTHORIZED,
        "Invalid local proxy key.",
        "UNAUTHORIZED",
    ))
}

async fn build_proxy_response(
    state: DesktopSharedState,
    config: DesktopConfig,
    trace_id: String,
    remote_response: reqwest::Response,
    active_request_guard: ActiveRequestGuard,
) -> Response<Body> {
    let status = remote_response.status();
    let content_type = remote_response.headers().get(CONTENT_TYPE).cloned();
    let cache_control = remote_response.headers().get(CACHE_CONTROL).cloned();
    let is_stream = content_type
        .as_ref()
        .and_then(|value| value.to_str().ok())
        .map(|value| value.contains("text/event-stream"))
        .unwrap_or(false);

    if is_stream {
        if status.is_success() {
            record_proxy_success(&state, "Remote stream request succeeded.").await;
        } else {
            record_proxy_error(
                &state,
                &format!("Remote request returned {}.", status.as_u16()),
                None,
            )
            .await;
        }

        record_trace_event(
      &state,
      &config,
      json!({
        "traceId": trace_id,
        "stage": "desktop_to_client",
        "direction": "outbound",
        "component": "desktop",
        "status": if status.is_success() { "streaming" } else { "error" },
        "entrypoint": "desktop_local_proxy",
        "requestKind": "chat.completions",
        "isStream": true,
        "httpStatus": status.as_u16(),
        "headersJson": response_trace_headers(&content_type, &cache_control),
        "metadataJson": {
          "contentType": content_type.as_ref().and_then(|value| value.to_str().ok()).unwrap_or_default()
        }
      }),
    )
    .await;

        let mut builder = Response::builder().status(status);
        if let Some(value) = content_type {
            builder = builder.header(CONTENT_TYPE, value);
        }
        if let Some(value) = cache_control {
            builder = builder.header(CACHE_CONTROL, value);
        }
        let guarded_stream = GuardedStream {
            inner: remote_response.bytes_stream(),
            _guard: active_request_guard,
            state: state.clone(),
            config: config.clone(),
            trace_id: trace_id.clone(),
            summary: Some(SseTraceSummaryState::default()),
            ended: false,
        };
        return builder
            .body(Body::from_stream(guarded_stream))
            .unwrap_or_else(|_| {
                openai_error_response(
                    StatusCode::BAD_GATEWAY,
                    UPSTREAM_ERROR_USER_MESSAGE,
                    "UPSTREAM_ERROR",
                )
            });
    }

    let body_bytes = match remote_response.bytes().await {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("ZebraGate Desktop failed to read ZebraGate API response body: {error}");
            record_proxy_error(
                &state,
                "ZebraGate API 响应读取失败，请稍后重试。",
                Some("ZebraGate API 响应读取失败，请稍后重试。".to_string()),
            )
            .await;
            return openai_error_response(
                StatusCode::BAD_GATEWAY,
                UPSTREAM_ERROR_USER_MESSAGE,
                "UPSTREAM_ERROR",
            );
        }
    };

    if status.is_success() {
        record_proxy_success(&state, "Remote request succeeded.").await;
    } else {
        record_proxy_error(
            &state,
            &format!("Remote request returned {}.", status.as_u16()),
            None,
        )
        .await;
    }

    let response_payload = json_body_for_trace(&body_bytes).unwrap_or_else(|| {
        json!({
          "rawTextPreview": truncate_text(&String::from_utf8_lossy(&body_bytes), 1000)
        })
    });
    record_trace_event(
        &state,
        &config,
        build_trace_event_payload(
            &trace_id,
            "desktop_to_client",
            "outbound",
            "desktop",
            if status.is_success() {
                "success"
            } else {
                "error"
            },
            &response_payload,
            response_trace_headers(&content_type, &cache_control),
            json!({
              "entrypoint": "desktop_local_proxy",
              "requestKind": "chat.completions",
              "isStream": false
            }),
            Some(status.as_u16()),
            None,
            None,
        ),
    )
    .await;

    let mut builder = Response::builder().status(status);
    if let Some(value) = content_type {
        builder = builder.header(CONTENT_TYPE, value);
    }
    builder
        .body(Body::from(body_bytes.to_vec()))
        .unwrap_or_else(|_| {
            openai_error_response(
                StatusCode::BAD_GATEWAY,
                UPSTREAM_ERROR_USER_MESSAGE,
                "UPSTREAM_ERROR",
            )
        })
}

fn json_response<T: Serialize>(status: StatusCode, value: &T) -> Response<Body> {
    match serde_json::to_vec(value) {
        Ok(bytes) => Response::builder()
            .status(status)
            .header(CONTENT_TYPE, "application/json")
            .body(Body::from(bytes))
            .unwrap_or_else(|_| Response::new(Body::from("{}"))),
        Err(_) => openai_error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to encode JSON response.",
            "INTERNAL_ERROR",
        ),
    }
}

fn openai_error_response(status: StatusCode, message: &str, code: &str) -> Response<Body> {
    json_response(
        status,
        &OpenAiErrorEnvelope {
            error: OpenAiErrorBody {
                message: message.to_string(),
                code: code.to_string(),
                error_type: "invalid_request_error".to_string(),
            },
        },
    )
}

fn parse_chat_completion_request(body: &[u8]) -> Result<ParsedChatRequest, String> {
    let mut request_body = serde_json::from_slice::<Value>(body)
        .map_err(|error| format!("Request body must be valid JSON: {error}"))?;
    let request_object = request_body
        .as_object_mut()
        .ok_or_else(|| "Request body must be a JSON object.".to_string())?;

    if request_object
        .get("model")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .is_none()
    {
        return Err("Request body must include a non-empty model.".to_string());
    }

    let messages = request_object
        .get("messages")
        .and_then(Value::as_array)
        .ok_or_else(|| "Request body must include a messages array.".to_string())?;

    let mut combined_message_text = Vec::with_capacity(messages.len());
    for message in messages {
        let role = message
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let content = message
            .get("content")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                "Only string messages[].content are supported in the desktop MVP proxy.".to_string()
            })?;
        if role == "user" {
            combined_message_text.push(content.to_string());
        }
    }

    Ok(ParsedChatRequest {
        body: request_body,
        text_for_privacy_scan: combined_message_text.join("\n"),
    })
}

fn inject_ai_option_ids(request_body: &mut Value, selected_ai_option_ids: &[String]) {
    if let Some(request_object) = request_body.as_object_mut() {
        request_object.insert("ai_option_ids".to_string(), json!(selected_ai_option_ids));
    }
}

async fn record_trace_event(state: &DesktopSharedState, config: &DesktopConfig, payload: Value) {
    let url = format!(
        "{}{}",
        config.remote_api_base_url.trim_end_matches('/'),
        TRACE_EVENTS_ROUTE
    );
    let mut request = state
        .client
        .post(url)
        .timeout(Duration::from_secs(REMOTE_METADATA_REQUEST_TIMEOUT_SECS))
        .header(CONTENT_TYPE, "application/json")
        .header("x-device-id", config.device_id.clone())
        .json(&payload);
    request = apply_user_auth_header(request, state, config).await;

    if let Err(error) = request.send().await {
        eprintln!("ZebraGate Desktop failed to record trace event: {error}");
    }
}

fn build_trace_event_payload(
    trace_id: &str,
    stage: &str,
    direction: &str,
    component: &str,
    status: &str,
    payload: &Value,
    headers: Value,
    metadata: Value,
    http_status: Option<u16>,
    error_code: Option<&str>,
    error_message: Option<&str>,
) -> Value {
    let redacted_payload = redact_trace_payload(payload);
    json!({
      "traceId": trace_id,
      "stage": stage,
      "direction": direction,
      "component": component,
      "status": status,
      "payloadJson": redacted_payload.clone(),
      "payloadPreviewText": truncate_text(&redacted_payload.to_string(), 1000),
      "headersJson": headers,
      "metadataJson": metadata,
      "httpStatus": http_status,
      "errorCode": error_code,
      "errorMessage": error_message,
    })
}

fn redact_trace_payload(payload: &Value) -> Value {
    let mut clone = payload.clone();
    if let Some(messages) = clone.get_mut("messages").and_then(Value::as_array_mut) {
        for message in messages {
            if message.get("role").and_then(Value::as_str) == Some("user") {
                if let Some(object) = message.as_object_mut() {
                    object.insert(
                        "content".to_string(),
                        Value::String(REDACTED_TRACE_MESSAGE_CONTENT.to_string()),
                    );
                }
            }
        }
    }
    clone
}

fn request_trace_headers(headers: &HeaderMap) -> Value {
    json!({
      "content-type": headers.get(CONTENT_TYPE).and_then(|value| value.to_str().ok()).unwrap_or_default(),
      "authorizationPresent": headers.get(AUTHORIZATION).is_some()
    })
}

fn response_trace_headers(
    content_type: &Option<axum::http::HeaderValue>,
    cache_control: &Option<axum::http::HeaderValue>,
) -> Value {
    json!({
      "content-type": content_type.as_ref().and_then(|value| value.to_str().ok()).unwrap_or_default(),
      "cache-control": cache_control.as_ref().and_then(|value| value.to_str().ok()).unwrap_or_default()
    })
}

fn json_body_for_trace(body_bytes: &Bytes) -> Option<Value> {
    serde_json::from_slice::<Value>(body_bytes).ok()
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

const SSE_SUMMARY_PREVIEW_MAX_CHARS: usize = 1000;

/// Accumulates a preview of an SSE stream (chunk count, output text preview, finish
/// reason) as bytes pass through, mirroring the JS `createSseStreamSummaryAccumulator`
/// used on the server side for the `server_to_desktop (finished)` trace event.
#[derive(Default)]
struct SseTraceSummaryState {
    buffer: String,
    chunk_count: u64,
    output_text_preview: String,
    finish_reason: Option<String>,
    completed: bool,
}

impl SseTraceSummaryState {
    fn push(&mut self, chunk: &[u8]) {
        self.buffer.push_str(&String::from_utf8_lossy(chunk));

        loop {
            let normalized = self.buffer.replace("\r\n", "\n");
            match normalized.find("\n\n") {
                Some(index) => {
                    let event_text = normalized[..index].to_string();
                    self.buffer = normalized[index + 2..].to_string();
                    self.consume_event(&event_text);
                }
                None => {
                    self.buffer = normalized;
                    break;
                }
            }
        }
    }

    fn consume_event(&mut self, event_text: &str) {
        self.chunk_count += 1;

        let data_lines: Vec<&str> = event_text
            .lines()
            .filter(|line| line.starts_with("data:"))
            .map(|line| line.trim_start_matches("data:").trim())
            .filter(|line| !line.is_empty())
            .collect();

        if data_lines.is_empty() {
            return;
        }

        let payload = data_lines.join("\n");
        if payload == "[DONE]" {
            self.completed = true;
            return;
        }

        if let Ok(json_payload) = serde_json::from_str::<Value>(&payload) {
            if let Some(choices) = json_payload.get("choices").and_then(Value::as_array) {
                for choice in choices {
                    if let Some(content) = choice
                        .get("delta")
                        .and_then(|delta| delta.get("content"))
                        .and_then(Value::as_str)
                    {
                        if !content.is_empty()
                            && self.output_text_preview.chars().count()
                                < SSE_SUMMARY_PREVIEW_MAX_CHARS
                        {
                            self.output_text_preview = truncate_text(
                                &format!("{}{}", self.output_text_preview, content),
                                SSE_SUMMARY_PREVIEW_MAX_CHARS,
                            );
                        }
                    }
                    if let Some(finish_reason) = choice.get("finish_reason").and_then(Value::as_str)
                    {
                        if !finish_reason.is_empty() {
                            self.finish_reason = Some(finish_reason.to_string());
                        }
                    }
                }
            }
        }
    }

    fn finish(mut self) -> Value {
        if !self.buffer.is_empty() {
            let event_text = self.buffer.clone();
            self.buffer.clear();
            self.consume_event(&event_text);
        }

        json!({
          "chunkCount": self.chunk_count,
          "outputTextPreview": self.output_text_preview,
          "finishReason": self.finish_reason,
          "completed": self.completed,
        })
    }
}

fn summarize_sse_stream_summary_for_trace(summary: &Value, prefix: &str) -> String {
    let mut parts = vec![prefix.to_string()];

    if let Some(chunk_count) = summary.get("chunkCount") {
        parts.push(format!("chunks={chunk_count}"));
    }
    if let Some(finish_reason) = summary.get("finishReason").and_then(Value::as_str) {
        parts.push(format!("finish={finish_reason}"));
    }
    if let Some(preview) = summary.get("outputTextPreview").and_then(Value::as_str) {
        if !preview.is_empty() {
            parts.push(format!("preview={}", truncate_text(preview, 120)));
        }
    }

    parts.join(" | ")
}

fn ensure_ai_option_selection_for_proxy(selected_ai_option_ids: &[String]) -> Result<(), String> {
    if selected_ai_option_ids.is_empty() {
        return Err(NO_AI_OPTION_SELECTED_USER_MESSAGE.to_string());
    }

    Ok(())
}

async fn ensure_user_logged_in_for_proxy(
    inner: &Arc<Mutex<DesktopRuntimeState>>,
) -> Result<(), String> {
    let runtime = inner.lock().await;
    if runtime.auth_session.is_some() {
        return Ok(());
    }

    Err(NOT_LOGGED_IN_USER_MESSAGE.to_string())
}

fn detect_sensitive_keywords(text: &str, privacy_keywords: &[String]) -> Vec<String> {
    let normalized_text = text.to_lowercase();
    privacy_keywords
        .iter()
        .filter(|keyword| normalized_text.contains(&keyword.to_lowercase()))
        .cloned()
        .collect()
}

/// Filters every group's `selected_ai_option_ids` against the local AI option
/// catalog cache, persisting any changes, and returns the resulting config. If
/// no cache exists yet, the config is returned unchanged.
async fn refresh_effective_ai_option_selections(
    state: &DesktopSharedState,
    inner: &Arc<Mutex<DesktopRuntimeState>>,
) -> Result<DesktopConfig, String> {
    let config = {
        let runtime = inner.lock().await;
        runtime.config.clone()
    };

    let ai_option_catalog = match read_ai_option_catalog_cache(state).await? {
        Some(cache) => cache.ai_options,
        None => return Ok(config),
    };
    let selectable_ai_option_ids = ai_option_catalog
        .iter()
        .map(|ai_option| ai_option.ai_option_id.clone())
        .collect::<HashSet<_>>();

    let mut changed = false;
    let mut runtime = inner.lock().await;
    for group in runtime.config.groups.iter_mut() {
        let filtered_ai_option_ids = group
            .selected_ai_option_ids
            .iter()
            .filter(|ai_option_id| selectable_ai_option_ids.contains(*ai_option_id))
            .cloned()
            .collect::<Vec<_>>();

        if filtered_ai_option_ids != group.selected_ai_option_ids {
            group.selected_ai_option_ids = filtered_ai_option_ids;
            changed = true;
        }
    }

    if changed {
        persist_desktop_config(state.config_path.as_path(), &runtime.config)?;
    }

    Ok(runtime.config.clone())
}

async fn fetch_ai_option_catalog(
    state: &DesktopSharedState,
    config: &DesktopConfig,
) -> Result<Vec<SelectableAiOption>, String> {
    let url = format!(
        "{}/v1/ai-options?recommendedOnly=false",
        config.remote_api_base_url.trim_end_matches('/')
    );
    let mut request = state
        .client
        .get(url)
        .timeout(Duration::from_secs(REMOTE_METADATA_REQUEST_TIMEOUT_SECS))
        .header(CONTENT_TYPE, "application/json");
    request = apply_user_auth_header(request, state, config).await;

    let response = request.send().await.map_err(|error| {
        format!("Failed to fetch AI option catalog from ZebraGate API: {error}")
    })?;
    let status = response.status();
    let body_bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Failed to read AI option catalog response body: {error}"))?;

    if !status.is_success() {
        let message = String::from_utf8_lossy(&body_bytes).to_string();
        return Err(format!(
            "ZebraGate API AI option catalog request failed: {message}"
        ));
    }

    serde_json::from_slice::<AiOptionCatalogResponse>(&body_bytes)
        .map(|payload| payload.ai_options)
        .map_err(|error| format!("Failed to decode AI option catalog response: {error}"))
}

fn spawn_ai_option_catalog_refresh_loop(state: DesktopSharedState) {
    tauri::async_runtime::spawn(async move {
        let _ = refresh_ai_option_catalog_from_remote(&state).await;
        loop {
            sleep(Duration::from_secs(AI_OPTION_CATALOG_REFRESH_INTERVAL_SECS)).await;
            let _ = refresh_ai_option_catalog_from_remote(&state).await;
        }
    });
}

async fn build_ai_option_catalog_snapshot(state: &DesktopSharedState) -> AiOptionCatalogSnapshot {
    let cache = read_ai_option_catalog_cache(state).await.ok().flatten();
    let now = current_unix_timestamp();
    let (ai_options, fetched_at, is_stale) = match cache {
        Some(cache) => {
            let is_stale =
                now.saturating_sub(cache.fetched_at) > AI_OPTION_CATALOG_STALE_AFTER_SECS;
            (cache.ai_options, Some(cache.fetched_at), is_stale)
        }
        None => (Vec::new(), None, false),
    };
    let unavailable_ai_option_notices = {
        let runtime = state.inner.lock().await;
        runtime.unavailable_ai_option_notices.clone()
    };

    AiOptionCatalogSnapshot {
        ai_options,
        fetched_at,
        is_stale,
        unavailable_ai_option_notices,
    }
}

async fn refresh_ai_option_catalog_from_remote(
    state: &DesktopSharedState,
) -> Result<AiOptionCatalogCache, String> {
    let config = {
        let runtime = state.inner.lock().await;
        runtime.config.clone()
    };
    let old_cache = read_ai_option_catalog_cache(state).await?;
    let ai_options = fetch_ai_option_catalog(state, &config)
        .await?
        .into_iter()
        .filter(|ai_option| ai_option.status != ProviderStatus::Disabled)
        .collect::<Vec<_>>();
    let cache = AiOptionCatalogCache {
        version: AI_OPTION_CATALOG_CACHE_VERSION,
        fetched_at: current_unix_timestamp(),
        ai_options,
    };

    write_ai_option_catalog_cache(state, &cache).await?;
    reconcile_group_ai_option_selections_with_catalog(state, old_cache.as_ref(), &cache).await?;
    Ok(cache)
}

async fn read_ai_option_catalog_cache(
    state: &DesktopSharedState,
) -> Result<Option<AiOptionCatalogCache>, String> {
    if !state.ai_option_catalog_cache_path.exists() {
        return Ok(None);
    }

    let cache = load_encrypted_compressed_json::<AiOptionCatalogCache>(
        state.ai_option_catalog_cache_path.as_path(),
        state.auth_key_path.as_path(),
        "AI option catalog cache",
    )?;
    if cache.version != AI_OPTION_CATALOG_CACHE_VERSION {
        return Ok(None);
    }
    Ok(Some(cache))
}

async fn write_ai_option_catalog_cache(
    state: &DesktopSharedState,
    cache: &AiOptionCatalogCache,
) -> Result<(), String> {
    save_encrypted_compressed_json(
        state.ai_option_catalog_cache_path.as_path(),
        state.auth_key_path.as_path(),
        cache,
        "AI option catalog cache",
    )
}

async fn reconcile_group_ai_option_selections_with_catalog(
    state: &DesktopSharedState,
    old_cache: Option<&AiOptionCatalogCache>,
    cache: &AiOptionCatalogCache,
) -> Result<(), String> {
    let selectable_ai_option_ids = cache
        .ai_options
        .iter()
        .map(|ai_option| ai_option.ai_option_id.clone())
        .collect::<HashSet<_>>();
    let mut ai_option_names = HashMap::<String, String>::new();
    if let Some(old_cache) = old_cache {
        for ai_option in &old_cache.ai_options {
            ai_option_names.insert(
                ai_option.ai_option_id.clone(),
                ai_option.public_name.clone(),
            );
        }
    }
    for ai_option in &cache.ai_options {
        ai_option_names.insert(
            ai_option.ai_option_id.clone(),
            ai_option.public_name.clone(),
        );
    }

    let mut changed = false;
    let mut notices = Vec::new();
    let mut runtime = state.inner.lock().await;
    for group in runtime.config.groups.iter_mut() {
        let removed_ai_option_names = group
            .selected_ai_option_ids
            .iter()
            .filter(|ai_option_id| !selectable_ai_option_ids.contains(*ai_option_id))
            .map(|ai_option_id| {
                ai_option_names
                    .get(ai_option_id)
                    .cloned()
                    .unwrap_or_else(|| ai_option_id.clone())
            })
            .collect::<Vec<_>>();

        if removed_ai_option_names.is_empty() {
            continue;
        }

        group
            .selected_ai_option_ids
            .retain(|ai_option_id| selectable_ai_option_ids.contains(ai_option_id));
        notices.push(UnavailableAiOptionNotice {
            group_name: group.name.clone(),
            ai_option_names: removed_ai_option_names,
        });
        changed = true;
    }

    if changed {
        persist_desktop_config(state.config_path.as_path(), &runtime.config)?;
    }
    merge_unavailable_ai_option_notices(&mut runtime.unavailable_ai_option_notices, notices);

    Ok(())
}

fn merge_unavailable_ai_option_notices(
    current_notices: &mut Vec<UnavailableAiOptionNotice>,
    new_notices: Vec<UnavailableAiOptionNotice>,
) {
    for new_notice in new_notices {
        match current_notices
            .iter_mut()
            .find(|notice| notice.group_name == new_notice.group_name)
        {
            Some(existing_notice) => {
                let mut existing_names = existing_notice
                    .ai_option_names
                    .iter()
                    .cloned()
                    .collect::<HashSet<_>>();
                for ai_option_name in new_notice.ai_option_names {
                    if existing_names.insert(ai_option_name.clone()) {
                        existing_notice.ai_option_names.push(ai_option_name);
                    }
                }
            }
            None => {
                let mut seen_names = HashSet::new();
                let ai_option_names = new_notice
                    .ai_option_names
                    .into_iter()
                    .filter(|ai_option_name| seen_names.insert(ai_option_name.clone()))
                    .collect::<Vec<_>>();
                current_notices.push(UnavailableAiOptionNotice {
                    group_name: new_notice.group_name,
                    ai_option_names,
                });
            }
        }
    }
}

async fn fetch_remote_credits_balance(
    state: &DesktopSharedState,
    config: &DesktopConfig,
) -> Result<i32, String> {
    let url = format!(
        "{}/v1/credits/balance",
        config.remote_api_base_url.trim_end_matches('/')
    );
    let mut request = state
        .client
        .get(url)
        .timeout(Duration::from_secs(REMOTE_METADATA_REQUEST_TIMEOUT_SECS))
        .header(CONTENT_TYPE, "application/json");
    request = apply_user_auth_header(request, state, config).await;

    let response = request
        .send()
        .await
        .map_err(|error| format!("Failed to fetch credits balance from ZebraGate API: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "ZebraGate API credits request failed with {}.",
            response.status().as_u16()
        ));
    }

    response
        .json::<RemoteCreditsBalanceResponse>()
        .await
        .map(|payload| payload.balance)
        .map_err(|error| format!("Failed to decode credits balance response: {error}"))
}

async fn record_proxy_success(state: &DesktopSharedState, status_message: &str) {
    let mut runtime = state.inner.lock().await;
    runtime.proxy_status.last_request_status = status_message.to_string();
    runtime.proxy_status.last_error_message = None;
}

async fn record_proxy_error(
    state: &DesktopSharedState,
    status_message: &str,
    error_message: Option<String>,
) {
    let mut runtime = state.inner.lock().await;
    runtime.proxy_status.last_request_status = status_message.to_string();
    runtime.proxy_status.last_error_message = error_message;
}

fn load_privacy_keywords() -> Result<Vec<String>, String> {
    serde_json::from_str(include_str!("../../src/lib/privacy-keywords.json"))
        .map_err(|error| format!("Failed to load shared privacy keywords: {error}"))
}

fn get_desktop_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve desktop config directory: {error}"))?;
    fs::create_dir_all(&config_dir)
        .map_err(|error| format!("Failed to create desktop config directory: {error}"))?;
    Ok(config_dir.join(DESKTOP_CONFIG_FILENAME))
}

fn load_or_initialize_desktop_config(config_path: &Path) -> Result<DesktopConfig, String> {
    if config_path.exists() {
        let raw = fs::read_to_string(config_path)
            .map_err(|error| format!("Failed to read desktop config file: {error}"))?;
        let raw_value = serde_json::from_str::<Value>(&raw)
            .map_err(|error| format!("Failed to parse desktop config file: {error}"))?;

        let mut config = if raw_value.get("userConfigs").is_some()
            || raw_value.get("anonymousUserConfig").is_some()
        {
            serde_json::from_str::<PersistedDesktopConfig>(&raw)
                .map_err(|error| format!("Failed to parse desktop config file: {error}"))?
                .into_runtime_config()
        } else if raw_value.get("groups").is_some() {
            let legacy_flat_config = serde_json::from_str::<DesktopConfig>(&raw)
                .map_err(|error| format!("Failed to parse desktop config file: {error}"))?;
            DesktopConfig {
                current_user_id: None,
                ..legacy_flat_config
            }
        } else {
            migrate_legacy_desktop_config(&raw_value)?
        };

        config.remote_api_base_url = resolve_remote_api_base_url()?;
        config.dev_user_id = resolve_dev_user_id();
        persist_desktop_config(config_path, &config)?;
        return Ok(config);
    }

    let config = DesktopConfig {
        remote_api_base_url: resolve_remote_api_base_url()?,
        dev_user_id: resolve_dev_user_id(),
        last_port: std::env::var("DEFAULT_LOCAL_PROXY_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .filter(|value| *value != DEFAULT_LOCAL_PROXY_PORT),
        device_id: Uuid::new_v4().to_string(),
        privacy_protection_enabled: default_privacy_protection_enabled(),
        groups: vec![DesktopGroup {
            id: Uuid::new_v4().to_string(),
            name: DEFAULT_GROUP_NAME.to_string(),
            local_key: format!("zg-local-{}", Uuid::new_v4().simple()),
            last_used_at: None,
            selected_ai_option_ids: Vec::new(),
        }],
        default_group_id: String::new(),
        current_user_id: None,
    };
    let default_group_id = config.groups[0].id.clone();
    let config = DesktopConfig {
        default_group_id,
        ..config
    };

    persist_desktop_config(config_path, &config)?;
    Ok(config)
}

fn load_desktop_config_for_user(
    config_path: &Path,
    user_id: Option<&str>,
) -> Result<DesktopConfig, String> {
    load_desktop_config_for_user_with_fallback(config_path, user_id, None)
}

fn load_desktop_config_for_user_with_fallback(
    config_path: &Path,
    user_id: Option<&str>,
    fallback_user_config: Option<DesktopUserConfig>,
) -> Result<DesktopConfig, String> {
    let config = load_or_initialize_desktop_config(config_path)?;
    let mut persisted = load_persisted_desktop_config(config_path, &config)?;
    let next_user_id = user_id.map(str::to_string);

    if let (Some(user_id), Some(fallback_user_config)) = (user_id, fallback_user_config) {
        let inserted_new_user_config = !persisted.user_configs.contains_key(user_id);
        persisted
            .user_configs
            .entry(user_id.to_string())
            .or_insert(fallback_user_config);

        if inserted_new_user_config {
            persisted.anonymous_user_config = Some(build_default_user_config());
        }
    }

    persisted.active_user_id = next_user_id;
    persisted.remote_api_base_url = resolve_remote_api_base_url()?;
    persisted.dev_user_id = resolve_dev_user_id();

    let runtime_config = persisted.clone().into_runtime_config();
    write_persisted_desktop_config(config_path, &persisted)?;
    Ok(runtime_config)
}

/// Migrates a pre-groups desktop config (single top-level `localKey` and
/// `selectedAiOptionIds`) into a single "default" group, preserving the
/// existing key so old client integrations keep working.
fn migrate_legacy_desktop_config(raw_value: &Value) -> Result<DesktopConfig, String> {
    let local_key = raw_value
        .get("localKey")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("zg-local-{}", Uuid::new_v4().simple()));
    let selected_ai_option_ids = raw_value
        .get("selectedAiOptionIds")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let last_port = raw_value
        .get("lastPort")
        .and_then(Value::as_u64)
        .map(|value| value as u16);
    let device_id = raw_value
        .get("deviceId")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let privacy_protection_enabled = raw_value
        .get("privacyProtectionEnabled")
        .and_then(Value::as_bool)
        .unwrap_or_else(default_privacy_protection_enabled);

    let default_group_id = Uuid::new_v4().to_string();

    Ok(DesktopConfig {
        remote_api_base_url: String::new(),
        dev_user_id: String::new(),
        last_port,
        device_id,
        current_user_id: None,
        privacy_protection_enabled,
        groups: vec![DesktopGroup {
            id: default_group_id.clone(),
            name: DEFAULT_GROUP_NAME.to_string(),
            local_key,
            last_used_at: None,
            selected_ai_option_ids,
        }],
        default_group_id,
    })
}

fn persist_desktop_config(config_path: &Path, config: &DesktopConfig) -> Result<(), String> {
    let persisted_config = load_persisted_desktop_config(config_path, config)?;
    write_persisted_desktop_config(config_path, &persisted_config)
}

fn write_persisted_desktop_config(
    config_path: &Path,
    persisted_config: &PersistedDesktopConfig,
) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(persisted_config)
        .map_err(|error| format!("Failed to encode desktop config file: {error}"))?;
    fs::write(config_path, raw)
        .map_err(|error| format!("Failed to write desktop config file: {error}"))
}

fn load_persisted_desktop_config(
    config_path: &Path,
    config: &DesktopConfig,
) -> Result<PersistedDesktopConfig, String> {
    let mut persisted = if config_path.exists() {
        let raw = fs::read_to_string(config_path)
            .map_err(|error| format!("Failed to read desktop config file: {error}"))?;
        let raw_value = serde_json::from_str::<Value>(&raw)
            .map_err(|error| format!("Failed to parse desktop config file: {error}"))?;

        if raw_value.get("userConfigs").is_some() || raw_value.get("anonymousUserConfig").is_some()
        {
            serde_json::from_str::<PersistedDesktopConfig>(&raw)
                .map_err(|error| format!("Failed to parse desktop config file: {error}"))?
        } else {
            PersistedDesktopConfig {
                remote_api_base_url: config.remote_api_base_url.clone(),
                dev_user_id: config.dev_user_id.clone(),
                last_port: config.last_port,
                device_id: config.device_id.clone(),
                active_user_id: None,
                anonymous_user_config: Some(config.user_config()),
                user_configs: HashMap::new(),
            }
        }
    } else {
        PersistedDesktopConfig {
            remote_api_base_url: config.remote_api_base_url.clone(),
            dev_user_id: config.dev_user_id.clone(),
            last_port: config.last_port,
            device_id: config.device_id.clone(),
            active_user_id: None,
            anonymous_user_config: None,
            user_configs: HashMap::new(),
        }
    };

    persisted.remote_api_base_url = config.remote_api_base_url.clone();
    persisted.dev_user_id = config.dev_user_id.clone();
    persisted.last_port = config.last_port;
    persisted.device_id = config.device_id.clone();
    persisted.active_user_id = config.current_user_id.clone();

    if let Some(user_id) = &config.current_user_id {
        persisted
            .user_configs
            .insert(user_id.clone(), config.user_config());
    } else {
        persisted.anonymous_user_config = Some(config.user_config());
    }

    Ok(persisted)
}

fn build_default_user_config() -> DesktopUserConfig {
    build_default_user_config_with_ai_option_ids(&[])
}

fn build_default_user_config_with_ai_option_ids(
    selected_ai_option_ids: &[String],
) -> DesktopUserConfig {
    let default_group_id = Uuid::new_v4().to_string();
    DesktopUserConfig {
        privacy_protection_enabled: default_privacy_protection_enabled(),
        groups: vec![DesktopGroup {
            id: default_group_id.clone(),
            name: DEFAULT_GROUP_NAME.to_string(),
            local_key: format!("zg-local-{}", Uuid::new_v4().simple()),
            last_used_at: None,
            selected_ai_option_ids: selected_ai_option_ids.to_vec(),
        }],
        default_group_id,
    }
}

fn recommended_ai_option_ids(ai_options: &[SelectableAiOption]) -> Vec<String> {
    ai_options
        .iter()
        .filter(|ai_option| ai_option.is_recommended)
        .map(|ai_option| ai_option.ai_option_id.clone())
        .collect()
}

fn fill_single_empty_default_group_selection(
    user_config: &mut DesktopUserConfig,
    selected_ai_option_ids: &[String],
) -> bool {
    if selected_ai_option_ids.is_empty() || user_config.groups.len() != 1 {
        return false;
    }

    let group = &mut user_config.groups[0];
    if group.id != user_config.default_group_id || !group.selected_ai_option_ids.is_empty() {
        return false;
    }

    group.selected_ai_option_ids = selected_ai_option_ids.to_vec();
    true
}

fn load_or_create_auth_key(auth_key_path: &Path) -> Result<[u8; 32], String> {
    if auth_key_path.exists() {
        let raw = fs::read(auth_key_path)
            .map_err(|error| format!("Failed to read auth key file: {error}"))?;
        if raw.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&raw);
            return Ok(key);
        }
    }

    let mut key = [0u8; 32];
    let mut rng = rand::rngs::SysRng;
    rng.try_fill_bytes(&mut key)
        .map_err(|error| format!("Failed to generate auth key bytes: {error}"))?;
    fs::write(auth_key_path, key)
        .map_err(|error| format!("Failed to write auth key file: {error}"))?;
    Ok(key)
}

fn save_encrypted_compressed_json<T: Serialize>(
    path: &Path,
    auth_key_path: &Path,
    value: &T,
    subject: &str,
) -> Result<(), String> {
    let raw = serde_json::to_vec(value)
        .map_err(|error| format!("Failed to encode {subject}: {error}"))?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(&raw)
        .map_err(|error| format!("Failed to compress {subject}: {error}"))?;
    let plaintext = encoder
        .finish()
        .map_err(|error| format!("Failed to finish compressing {subject}: {error}"))?;

    let key_bytes = load_or_create_auth_key(auth_key_path)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    AesOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|error| format!("Failed to encrypt {subject}: {error}"))?;

    let payload = EncryptedLocalPayload {
        nonce: BASE64.encode(nonce_bytes),
        ciphertext: BASE64.encode(ciphertext),
    };
    let encoded_payload = serde_json::to_vec(&payload)
        .map_err(|error| format!("Failed to encode encrypted {subject}: {error}"))?;
    fs::write(path, encoded_payload).map_err(|error| format!("Failed to write {subject}: {error}"))
}

fn load_encrypted_compressed_json<T: for<'de> Deserialize<'de>>(
    path: &Path,
    auth_key_path: &Path,
    subject: &str,
) -> Result<T, String> {
    let raw = fs::read(path).map_err(|error| format!("Failed to read {subject}: {error}"))?;
    let payload = serde_json::from_slice::<EncryptedLocalPayload>(&raw)
        .map_err(|error| format!("Failed to decode encrypted {subject}: {error}"))?;
    let nonce_bytes = BASE64
        .decode(payload.nonce)
        .map_err(|error| format!("Failed to decode {subject} nonce: {error}"))?;
    if nonce_bytes.len() != 12 {
        return Err(format!("Invalid {subject} nonce length."));
    }
    let ciphertext = BASE64
        .decode(payload.ciphertext)
        .map_err(|error| format!("Failed to decode {subject} ciphertext: {error}"))?;
    let key_bytes = load_or_create_auth_key(auth_key_path)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let compressed = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|error| format!("Failed to decrypt {subject}: {error}"))?;
    let mut decoder = GzDecoder::new(compressed.as_slice());
    let mut plaintext = Vec::new();
    decoder
        .read_to_end(&mut plaintext)
        .map_err(|error| format!("Failed to decompress {subject}: {error}"))?;
    serde_json::from_slice::<T>(&plaintext)
        .map_err(|error| format!("Failed to parse {subject}: {error}"))
}

fn save_auth_session(
    auth_session_path: &Path,
    auth_key_path: &Path,
    session: &AuthSession,
) -> Result<(), String> {
    let key_bytes = load_or_create_auth_key(auth_key_path)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    AesOsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = serde_json::to_vec(session)
        .map_err(|error| format!("Failed to encode auth session: {error}"))?;
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|error| format!("Failed to encrypt auth session: {error}"))?;

    let mut payload = Vec::with_capacity(nonce_bytes.len() + ciphertext.len());
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(&ciphertext);

    fs::write(auth_session_path, BASE64.encode(payload))
        .map_err(|error| format!("Failed to write auth session file: {error}"))
}

fn load_auth_session(
    auth_session_path: &Path,
    auth_key_path: &Path,
) -> Result<Option<AuthSession>, String> {
    if !auth_session_path.exists() || !auth_key_path.exists() {
        return Ok(None);
    }

    let encoded = fs::read_to_string(auth_session_path)
        .map_err(|error| format!("Failed to read auth session file: {error}"))?;
    let payload = match BASE64.decode(encoded.trim()) {
        Ok(payload) => payload,
        Err(_) => return Ok(None),
    };
    if payload.len() < 12 {
        return Ok(None);
    }

    let (nonce_bytes, ciphertext) = payload.split_at(12);
    let key_bytes = load_or_create_auth_key(auth_key_path)?;
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = match cipher.decrypt(nonce, ciphertext) {
        Ok(plaintext) => plaintext,
        Err(_) => return Ok(None),
    };

    serde_json::from_slice::<AuthSession>(&plaintext)
        .map(Some)
        .map_err(|error| format!("Failed to decode auth session: {error}"))
}

fn clear_auth_session(auth_session_path: &Path) -> Result<(), String> {
    if auth_session_path.exists() {
        fs::remove_file(auth_session_path)
            .map_err(|error| format!("Failed to remove auth session file: {error}"))?;
    }
    Ok(())
}

fn urlencoding_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push('%');
                encoded.push_str(&format!("{byte:02X}"));
            }
        }
    }
    encoded
}

fn resolve_web_base_url() -> String {
    for candidate in [
        std::env::var("ZEBRAGATE_DESKTOP_WEB_BASE_URL").ok(),
        std::env::var("NEXT_PUBLIC_WEB_BASE_URL").ok(),
        option_env!("ZEBRAGATE_DESKTOP_WEB_BASE_URL").map(ToString::to_string),
        option_env!("NEXT_PUBLIC_WEB_BASE_URL").map(ToString::to_string),
    ] {
        if let Some(value) = candidate {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    DEFAULT_WEB_BASE_URL.to_string()
}

fn build_local_address(port: u16) -> String {
    format!("http://{LOCAL_PROXY_HOST}:{port}")
}

fn default_privacy_protection_enabled() -> bool {
    false
}

fn resolve_remote_api_base_url() -> Result<String, String> {
    if let Ok(value) = std::env::var("ZEBRAGATE_DESKTOP_REMOTE_API_BASE_URL") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    if let Ok(value) = std::env::var("API_BASE_URL") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    if let Ok(value) = std::env::var("NEXT_PUBLIC_API_BASE_URL") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    if let Some(value) = option_env!("ZEBRAGATE_DESKTOP_REMOTE_API_BASE_URL") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    if let Some(value) = option_env!("API_BASE_URL") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    if let Some(value) = option_env!("NEXT_PUBLIC_API_BASE_URL") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    if cfg!(debug_assertions) {
        return Ok(DEFAULT_REMOTE_API_BASE_URL.to_string());
    }

    Err(
    "Desktop remote API base URL is not configured. Set ZEBRAGATE_DESKTOP_REMOTE_API_BASE_URL or API_BASE_URL before building ZebraGate Desktop."
      .to_string(),
  )
}

fn resolve_dev_user_id() -> String {
    for candidate in [
        std::env::var("ZEBRAGATE_MOCK_USER_ID").ok(),
        std::env::var("NEXT_PUBLIC_ZEBRAGATE_MOCK_USER_ID").ok(),
        option_env!("ZEBRAGATE_MOCK_USER_ID").map(ToString::to_string),
        option_env!("NEXT_PUBLIC_ZEBRAGATE_MOCK_USER_ID").map(ToString::to_string),
    ] {
        if let Some(value) = candidate {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    if cfg!(debug_assertions) {
        return DEFAULT_DEV_USER_ID.to_string();
    }

    String::new()
}

async fn verify_local_proxy_health(client: &Client, address: &str) -> Result<(), String> {
    let health_url = format!("{address}/health");

    for _ in 0..20 {
        match client.get(&health_url).send().await {
            Ok(response) if response.status().is_success() => return Ok(()),
            Ok(_) | Err(_) => sleep(Duration::from_millis(50)).await,
        }
    }

    Err(format!("Local proxy health check failed for {health_url}."))
}

async fn verify_local_proxy_stopped(client: &Client, address: &str) -> Result<(), String> {
    let health_url = format!("{address}/health");

    for _ in 0..20 {
        match client.get(&health_url).send().await {
            Ok(_) => sleep(Duration::from_millis(50)).await,
            Err(_) => return Ok(()),
        }
    }

    Err(format!(
        "Local proxy at {health_url} is still reachable after stop request."
    ))
}

async fn bind_local_proxy_listener(
    strategy: LocalPortBindingStrategy,
) -> Result<(TcpListener, u16), String> {
    match strategy {
        LocalPortBindingStrategy::Exact(port) => bind_exact_listener(port).await,
        LocalPortBindingStrategy::FallbackRange {
            start_port,
            max_attempts,
        } => find_available_listener(start_port, max_attempts).await,
    }
}

async fn bind_exact_listener(port: u16) -> Result<(TcpListener, u16), String> {
    TcpListener::bind((LOCAL_PROXY_HOST, port))
    .await
    .map(|listener| (listener, port))
    .map_err(|error| {
      format!(
        "Saved local proxy port {} is unavailable. Please close the program using this port before restarting ZebraGate Desktop. Details: {}",
        port, error
      )
    })
}

async fn find_available_listener(
    preferred_port: u16,
    max_attempts: u16,
) -> Result<(TcpListener, u16), String> {
    for offset in 0..max_attempts {
        let candidate_port = preferred_port.saturating_add(offset);
        match TcpListener::bind((LOCAL_PROXY_HOST, candidate_port)).await {
            Ok(listener) => return Ok((listener, candidate_port)),
            Err(_) => continue,
        }
    }

    Err(format!(
        "Failed to bind local proxy after trying ports {}-{}.",
        preferred_port,
        preferred_port.saturating_add(max_attempts.saturating_sub(1))
    ))
}

fn dedupe_ai_option_ids(ai_option_ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    ai_option_ids
        .into_iter()
        .filter(|ai_option_id| seen.insert(ai_option_id.clone()))
        .collect()
}

fn validate_ai_option_selection_against_catalog(
    ai_option_ids: &[String],
    cache: Option<&AiOptionCatalogCache>,
) -> Result<(), String> {
    let Some(cache) = cache else {
        return Ok(());
    };

    let selectable_ai_option_ids = cache
        .ai_options
        .iter()
        .map(|ai_option| ai_option.ai_option_id.as_str())
        .collect::<HashSet<_>>();

    let invalid_ai_option_ids = ai_option_ids
        .iter()
        .filter(|ai_option_id| !selectable_ai_option_ids.contains(ai_option_id.as_str()))
        .cloned()
        .collect::<Vec<_>>();

    if !invalid_ai_option_ids.is_empty() {
        return Err(format!(
            "AI option selection contains unavailable ai option ids: {}.",
            invalid_ai_option_ids.join(", ")
        ));
    }

    Ok(())
}

fn futuresafe_blocking_read_last_port(inner: &Arc<Mutex<DesktopRuntimeState>>) -> Option<u16> {
    inner
        .try_lock()
        .ok()
        .and_then(|runtime| runtime.config.last_port)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::extract::Request;
    use axum::http::HeaderValue;
    use axum::middleware::Next;
    use axum::response::Response as AxumResponse;
    use axum::routing::any;
    use reqwest::StatusCode as ReqwestStatusCode;
    use serde_json::Value as JsonValue;
    use tempfile::{tempdir, TempDir};
    use tokio::sync::Mutex as TokioMutex;

    #[derive(Clone, Debug)]
    struct MockRemoteRequestRecord {
        path: String,
        headers: Vec<(String, String)>,
        body: JsonValue,
    }

    #[derive(Clone, Debug)]
    enum MockRemoteBehavior {
        JsonSuccess,
        StreamSuccess,
        Error {
            status: StatusCode,
            code: &'static str,
            message: &'static str,
        },
    }

    #[derive(Clone)]
    struct MockRemoteState {
        behavior: MockRemoteBehavior,
        requests: Arc<TokioMutex<Vec<MockRemoteRequestRecord>>>,
    }

    /// Builds a `DesktopConfig` with a single "default" group, for tests that don't
    /// exercise the multi-group behavior directly.
    fn test_config_with_group(
        remote_api_base_url: String,
        dev_user_id: String,
        last_port: Option<u16>,
        local_key: &str,
        selected_ai_option_ids: Vec<String>,
        device_id: &str,
        privacy_protection_enabled: bool,
    ) -> DesktopConfig {
        let group_id = "group-default".to_string();
        DesktopConfig {
            remote_api_base_url,
            dev_user_id,
            last_port,
            device_id: device_id.to_string(),
            current_user_id: None,
            privacy_protection_enabled,
            groups: vec![DesktopGroup {
                id: group_id.clone(),
                name: DEFAULT_GROUP_NAME.to_string(),
                local_key: local_key.to_string(),
                last_used_at: None,
                selected_ai_option_ids,
            }],
            default_group_id: group_id,
        }
    }

    fn test_selectable_ai_option(ai_option_id: &str, is_recommended: bool) -> SelectableAiOption {
        SelectableAiOption {
            ai_option_id: ai_option_id.to_string(),
            provider_label: "Provider".to_string(),
            model_label: "Model".to_string(),
            public_name: ai_option_id.to_string(),
            display_config_summary: "Summary".to_string(),
            display_badges: Vec::new(),
            credit_multiplier: 1.0,
            is_recommended,
            status: ProviderStatus::Healthy,
            disable_reason: None,
            sort_order: 0,
        }
    }

    #[test]
    fn delete_group_from_config_allows_deleting_default_group_when_others_remain() {
        let mut config = test_config_with_group(
            "http://127.0.0.1:3001".to_string(),
            "user-1".to_string(),
            None,
            "zg-local-default",
            Vec::new(),
            "device-1",
            true,
        );
        let default_group_id = config.default_group_id.clone();
        let other_group_id = "group-other".to_string();
        config.groups.push(DesktopGroup {
            id: other_group_id.clone(),
            name: "other".to_string(),
            local_key: "zg-local-other".to_string(),
            last_used_at: None,
            selected_ai_option_ids: Vec::new(),
        });

        delete_group_from_config(&mut config, &default_group_id)
            .expect("default group should be deletable");

        assert_eq!(config.groups.len(), 1);
        assert_eq!(config.groups[0].id, other_group_id);
        assert_eq!(config.default_group_id, other_group_id);
    }

    #[test]
    fn delete_group_from_config_rejects_deleting_last_group() {
        let mut config = test_config_with_group(
            "http://127.0.0.1:3001".to_string(),
            "user-1".to_string(),
            None,
            "zg-local-default",
            Vec::new(),
            "device-1",
            true,
        );
        let group_id = config.default_group_id.clone();

        let error = delete_group_from_config(&mut config, &group_id)
            .expect_err("last group should not be deleted");

        assert_eq!(error, "The last group cannot be deleted.");
        assert_eq!(config.groups.len(), 1);
        assert_eq!(config.default_group_id, group_id);
    }

    #[test]
    fn detect_sensitive_keywords_flags_existing_rules() {
        let keywords = vec!["private key".to_string(), "助记词".to_string()];
        let matches = detect_sensitive_keywords(
            "Please never paste your private key or 助记词 here.",
            &keywords,
        );

        assert_eq!(
            matches,
            vec!["private key".to_string(), "助记词".to_string()]
        );
    }

    #[test]
    fn compute_window_geometry_sizes_window_relative_to_monitor() {
        let (size, _position) =
            compute_window_geometry(PhysicalPosition::new(0, 0), PhysicalSize::new(1920, 1080));

        assert_eq!(size.width, 1920 / WINDOW_GEOMETRY_WIDTH_DIVISOR);
        assert_eq!(size.height, 1080 / WINDOW_GEOMETRY_HEIGHT_DIVISOR);
    }

    #[test]
    fn compute_window_geometry_positions_window_at_bottom_right_of_work_area() {
        let (size, position) =
            compute_window_geometry(PhysicalPosition::new(0, 0), PhysicalSize::new(1920, 1040));

        let expected_x = 1920 - size.width as i32 - WINDOW_GEOMETRY_MARGIN;
        let expected_y = 1040 - size.height as i32 - WINDOW_GEOMETRY_MARGIN;

        assert_eq!(position.x, expected_x);
        assert_eq!(position.y, expected_y);
        assert!(position.x > 0);
        assert!(position.y > 0);
    }

    #[test]
    fn compute_window_geometry_offsets_by_work_area_position() {
        let (size, position) = compute_window_geometry(
            PhysicalPosition::new(100, 50),
            PhysicalSize::new(1920, 1040),
        );

        let expected_x = 100 + (1920 - size.width as i32 - WINDOW_GEOMETRY_MARGIN);
        let expected_y = 50 + (1040 - size.height as i32 - WINDOW_GEOMETRY_MARGIN);

        assert_eq!(position.x, expected_x);
        assert_eq!(position.y, expected_y);
    }

    #[test]
    fn work_area_bottom_aligned_y_anchors_window_to_bottom_with_margin() {
        let y = work_area_bottom_aligned_y(50, 1040, 300);

        assert_eq!(y, 50 + (1040 - 300 - WINDOW_GEOMETRY_MARGIN));
    }

    #[test]
    fn work_area_bottom_aligned_y_clamps_when_window_taller_than_work_area() {
        let y = work_area_bottom_aligned_y(50, 200, 300);

        assert_eq!(y, 50);
    }

    #[test]
    fn compute_window_geometry_clamps_to_zero_for_tiny_monitors() {
        let (size, position) =
            compute_window_geometry(PhysicalPosition::new(0, 0), PhysicalSize::new(10, 10));

        assert!(size.width >= 1);
        assert!(size.height >= 1);
        assert_eq!(position.x, 0);
        assert_eq!(position.y, 0);
    }

    #[test]
    fn active_request_guard_increments_and_decrements_counter() {
        let counter = Arc::new(AtomicU32::new(0));

        {
            let _guard = ActiveRequestGuard::new(counter.clone());
            assert_eq!(counter.load(Ordering::Relaxed), 1);
        }

        assert_eq!(counter.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn tray_toggle_menu_text_matches_main_window_visibility() {
        assert_eq!(tray_toggle_menu_text(false), TRAY_MENU_OPEN_WINDOW_TEXT);
        assert_eq!(tray_toggle_menu_text(true), TRAY_MENU_HIDE_WINDOW_TEXT);
    }

    #[test]
    fn tray_quit_confirmation_copy_explains_proxy_impact() {
        assert!(TRAY_QUIT_CONFIRMATION_TITLE.contains("退出"));
        assert!(TRAY_QUIT_CONFIRMATION_MESSAGE.contains("访问请求"));
        assert!(TRAY_QUIT_CONFIRMATION_MESSAGE.contains("重新打开软件"));
    }

    #[test]
    fn inject_ai_option_ids_overrides_client_values() {
        let mut request_body = json!({
          "model": "zebragate_model",
          "messages": [{ "role": "user", "content": "hello" }],
          "ai_option_ids": ["client-value"]
        });

        inject_ai_option_ids(&mut request_body, &["ai-option-openai-mock".to_string()]);
        assert_eq!(
            request_body["ai_option_ids"],
            json!(["ai-option-openai-mock"])
        );
    }

    #[test]
    fn ensure_ai_option_selection_for_proxy_rejects_empty_selection() {
        let error = ensure_ai_option_selection_for_proxy(&[])
            .expect_err("empty ai option selection should be rejected");

        assert_eq!(error, NO_AI_OPTION_SELECTED_USER_MESSAGE);
    }

    #[test]
    fn recommended_ai_option_ids_returns_recommended_catalog_ids() {
        let ai_options = vec![
            test_selectable_ai_option("option-recommended-a", true),
            test_selectable_ai_option("option-not-recommended", false),
            test_selectable_ai_option("option-recommended-b", true),
        ];

        assert_eq!(
            recommended_ai_option_ids(&ai_options),
            vec![
                "option-recommended-a".to_string(),
                "option-recommended-b".to_string()
            ]
        );
    }

    #[test]
    fn fill_single_empty_default_group_selection_only_updates_empty_default_group() {
        let recommended_ids = vec!["option-recommended".to_string()];
        let mut user_config = build_default_user_config();

        assert!(fill_single_empty_default_group_selection(
            &mut user_config,
            &recommended_ids
        ));
        assert_eq!(
            user_config.groups[0].selected_ai_option_ids,
            recommended_ids
        );

        assert!(!fill_single_empty_default_group_selection(
            &mut user_config,
            &["option-other".to_string()]
        ));
        assert_eq!(
            user_config.groups[0].selected_ai_option_ids,
            vec!["option-recommended".to_string()]
        );
    }

    #[test]
    fn persist_and_reload_desktop_config_round_trips() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config_path = temp_directory.path().join("desktop-config.json");
        let config = test_config_with_group(
            "http://localhost:3001".to_string(),
            "user-1".to_string(),
            Some(7788),
            "zg-local-test",
            vec!["ai-option-openai-mock".to_string()],
            "device-1",
            false,
        );

        persist_desktop_config(&config_path, &config).expect("config should persist");
        let reloaded =
            load_or_initialize_desktop_config(&config_path).expect("config should reload");

        assert_eq!(reloaded.groups, config.groups);
        assert_eq!(reloaded.default_group_id, config.default_group_id);
        assert_eq!(reloaded.last_port, config.last_port);
        assert_eq!(reloaded.device_id, config.device_id);
    }

    #[test]
    fn desktop_config_scopes_group_state_per_user() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config_path = temp_directory.path().join("desktop-config.json");
        let anonymous_config = test_config_with_group(
            "http://localhost:3001".to_string(),
            "user-1".to_string(),
            Some(7788),
            "zg-local-user-a",
            vec!["ai-option-a".to_string()],
            "device-1",
            false,
        );
        persist_desktop_config(&config_path, &anonymous_config).expect("config should persist");

        let mut user_a_config = load_desktop_config_for_user_with_fallback(
            &config_path,
            Some("user-a"),
            Some(anonymous_config.user_config()),
        )
        .expect("user A config should load");
        user_a_config.groups[0].name = "A Team".to_string();
        persist_desktop_config(&config_path, &user_a_config).expect("user A config should persist");

        let user_b_config = load_desktop_config_for_user(&config_path, Some("user-b"))
            .expect("user B config should load");
        assert_eq!(user_b_config.current_user_id.as_deref(), Some("user-b"));
        assert_eq!(user_b_config.groups.len(), 1);
        assert_eq!(user_b_config.groups[0].name, DEFAULT_GROUP_NAME);
        assert_ne!(user_b_config.groups[0].local_key, "zg-local-user-a");
        assert!(user_b_config.groups[0].selected_ai_option_ids.is_empty());

        let reloaded_user_a = load_desktop_config_for_user(&config_path, Some("user-a"))
            .expect("user A config should reload");
        assert_eq!(reloaded_user_a.current_user_id.as_deref(), Some("user-a"));
        assert_eq!(reloaded_user_a.groups[0].name, "A Team");
        assert_eq!(reloaded_user_a.groups[0].local_key, "zg-local-user-a");
        assert_eq!(
            reloaded_user_a.groups[0].selected_ai_option_ids,
            vec!["ai-option-a".to_string()]
        );
    }

    #[test]
    fn new_user_does_not_reuse_anonymous_default_key_after_previous_user_logs_out() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config_path = temp_directory.path().join("desktop-config.json");
        let anonymous_config = test_config_with_group(
            "http://localhost:3001".to_string(),
            "user-1".to_string(),
            Some(7788),
            "zg-local-shared-default",
            vec!["ai-option-a".to_string()],
            "device-1",
            false,
        );
        persist_desktop_config(&config_path, &anonymous_config).expect("config should persist");

        let user_a_config = load_desktop_config_for_user_with_fallback(
            &config_path,
            Some("user-a"),
            Some(anonymous_config.user_config()),
        )
        .expect("user A config should load");
        assert_eq!(user_a_config.groups[0].local_key, "zg-local-shared-default");

        let logged_out_config = load_desktop_config_for_user(&config_path, None)
            .expect("logged out config should load");
        assert_ne!(
            logged_out_config.groups[0].local_key,
            "zg-local-shared-default"
        );

        let user_b_config = load_desktop_config_for_user_with_fallback(
            &config_path,
            Some("user-b"),
            Some(logged_out_config.user_config()),
        )
        .expect("user B config should load");
        assert_ne!(user_b_config.groups[0].local_key, "zg-local-shared-default");
        assert_ne!(
            user_b_config.groups[0].local_key,
            user_a_config.groups[0].local_key
        );
    }

    #[test]
    fn load_or_initialize_desktop_config_migrates_legacy_single_group_config() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config_path = temp_directory.path().join("desktop-config.json");
        let legacy_json = json!({
          "remoteApiBaseUrl": "http://localhost:3001",
          "devUserId": "user-1",
          "localKey": "zg-local-legacy",
          "lastPort": 7788,
          "selectedAiOptionIds": ["ai-option-openai-mock"],
          "deviceId": "device-1",
          "privacyProtectionEnabled": false
        });
        fs::write(
            &config_path,
            serde_json::to_string_pretty(&legacy_json).unwrap(),
        )
        .expect("legacy config should write");

        let migrated =
            load_or_initialize_desktop_config(&config_path).expect("legacy config should migrate");

        assert_eq!(migrated.groups.len(), 1);
        let group = &migrated.groups[0];
        assert_eq!(group.name, DEFAULT_GROUP_NAME);
        assert_eq!(group.local_key, "zg-local-legacy");
        assert_eq!(
            group.selected_ai_option_ids,
            vec!["ai-option-openai-mock".to_string()]
        );
        assert_eq!(migrated.default_group_id, group.id);
        assert_eq!(migrated.last_port, Some(7788));
        assert_eq!(migrated.device_id, "device-1");

        let reloaded =
            load_or_initialize_desktop_config(&config_path).expect("migrated config should reload");
        assert_eq!(reloaded.groups, migrated.groups);
        assert_eq!(reloaded.default_group_id, migrated.default_group_id);
    }

    #[test]
    fn save_and_load_auth_session_round_trips_encrypted() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let session_path = temp_directory.path().join("auth-session.bin");
        let key_path = temp_directory.path().join("auth-key.bin");
        let session = AuthSession {
            access_token: "access-token-value".to_string(),
            refresh_token: "refresh-token-value".to_string(),
            email: Some("user@example.com".to_string()),
            user_id: Some("user-1".to_string()),
            expires_at: Some(1_700_000_000),
        };

        save_auth_session(&session_path, &key_path, &session).expect("session should save");
        let raw = fs::read_to_string(&session_path).expect("session file should be readable");
        assert!(!raw.contains("access-token-value"));
        assert!(!raw.contains("user@example.com"));

        let reloaded = load_auth_session(&session_path, &key_path)
            .expect("session should load")
            .expect("session should exist");

        assert_eq!(reloaded.access_token, session.access_token);
        assert_eq!(reloaded.refresh_token, session.refresh_token);
        assert_eq!(reloaded.email, session.email);
        assert_eq!(reloaded.expires_at, session.expires_at);
    }

    #[test]
    fn load_auth_session_returns_none_when_missing() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let session_path = temp_directory.path().join("auth-session.bin");
        let key_path = temp_directory.path().join("auth-key.bin");

        let result =
            load_auth_session(&session_path, &key_path).expect("missing session should not error");
        assert!(result.is_none());
    }

    #[test]
    fn clear_auth_session_removes_file() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let session_path = temp_directory.path().join("auth-session.bin");
        let key_path = temp_directory.path().join("auth-key.bin");
        let session = AuthSession {
            access_token: "access-token-value".to_string(),
            refresh_token: "refresh-token-value".to_string(),
            email: None,
            user_id: None,
            expires_at: None,
        };

        save_auth_session(&session_path, &key_path, &session).expect("session should save");
        assert!(session_path.exists());

        clear_auth_session(&session_path).expect("session should clear");
        assert!(!session_path.exists());

        let result =
            load_auth_session(&session_path, &key_path).expect("cleared session should not error");
        assert!(result.is_none());
    }

    fn build_test_shared_state(
        temp_directory: &TempDir,
        config: DesktopConfig,
        auth_session: Option<AuthSession>,
    ) -> DesktopSharedState {
        DesktopSharedState {
            client: Client::builder().build().expect("client should build"),
            config_path: Arc::new(temp_directory.path().join("desktop-config.json")),
            ai_option_catalog_cache_path: Arc::new(
                temp_directory.path().join("ai-options-catalog.cache"),
            ),
            auth_session_path: Arc::new(temp_directory.path().join("auth-session.bin")),
            auth_key_path: Arc::new(temp_directory.path().join("auth-key.bin")),
            privacy_keywords: Arc::new(Vec::new()),
            inner: Arc::new(Mutex::new(DesktopRuntimeState {
                config,
                proxy_status: LocalProxyStatusSnapshot {
                    running: false,
                    port: None,
                    address: build_local_address(7788),
                    last_request_status: "Local proxy is idle.".to_string(),
                    last_error_message: None,
                },
                shutdown_tx: None,
                auth_session,
                unavailable_ai_option_notices: Vec::new(),
            })),
            active_request_count: Arc::new(AtomicU32::new(0)),
        }
    }

    #[tokio::test]
    async fn ai_option_catalog_cache_round_trips_encrypted_and_compressed() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config = test_config_with_group(
            "http://localhost:3001".to_string(),
            "user-1".to_string(),
            None,
            "zg-local-test",
            Vec::new(),
            "device-1",
            false,
        );
        let state = build_test_shared_state(&temp_directory, config, None);
        let cache = AiOptionCatalogCache {
            version: AI_OPTION_CATALOG_CACHE_VERSION,
            fetched_at: 1_800_000_000,
            ai_options: vec![test_selectable_ai_option("ai-option-secret", true)],
        };

        write_ai_option_catalog_cache(&state, &cache)
            .await
            .expect("cache should save");
        let raw = fs::read_to_string(state.ai_option_catalog_cache_path.as_path())
            .expect("cache should read");
        assert!(!raw.contains("ai-option-secret"));

        let reloaded = read_ai_option_catalog_cache(&state)
            .await
            .expect("cache should load")
            .expect("cache should exist");
        assert_eq!(reloaded.fetched_at, cache.fetched_at);
        assert_eq!(reloaded.ai_options[0].ai_option_id, "ai-option-secret");
    }

    #[tokio::test]
    async fn reconcile_group_ai_option_selections_removes_unavailable_options_and_records_notice() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config = test_config_with_group(
            "http://localhost:3001".to_string(),
            "user-1".to_string(),
            None,
            "zg-local-test",
            vec![
                "ai-option-kept".to_string(),
                "ai-option-removed".to_string(),
            ],
            "device-1",
            false,
        );
        let state = build_test_shared_state(&temp_directory, config.clone(), None);
        persist_desktop_config(state.config_path.as_path(), &config)
            .expect("config should persist");
        let old_cache = AiOptionCatalogCache {
            version: AI_OPTION_CATALOG_CACHE_VERSION,
            fetched_at: 1_800_000_000,
            ai_options: vec![
                test_selectable_ai_option("ai-option-kept", true),
                test_selectable_ai_option("ai-option-removed", false),
            ],
        };
        let new_cache = AiOptionCatalogCache {
            version: AI_OPTION_CATALOG_CACHE_VERSION,
            fetched_at: 1_800_000_100,
            ai_options: vec![test_selectable_ai_option("ai-option-kept", true)],
        };

        reconcile_group_ai_option_selections_with_catalog(&state, Some(&old_cache), &new_cache)
            .await
            .expect("selection should reconcile");

        let reloaded = load_or_initialize_desktop_config(state.config_path.as_path())
            .expect("config should reload");
        assert_eq!(
            reloaded.groups[0].selected_ai_option_ids,
            vec!["ai-option-kept".to_string()]
        );
        let notices = {
            let runtime = state.inner.lock().await;
            runtime.unavailable_ai_option_notices.clone()
        };
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].group_name, DEFAULT_GROUP_NAME);
        assert_eq!(
            notices[0].ai_option_names,
            vec!["ai-option-removed".to_string()]
        );
    }

    #[tokio::test]
    async fn reconcile_group_ai_option_selections_accumulates_pending_notices_without_duplicates() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config = test_config_with_group(
            "http://localhost:3001".to_string(),
            "user-1".to_string(),
            None,
            "zg-local-test",
            vec![
                "ai-option-removed-before".to_string(),
                "ai-option-removed-now".to_string(),
                "ai-option-kept".to_string(),
            ],
            "device-1",
            false,
        );
        let state = build_test_shared_state(&temp_directory, config.clone(), None);
        persist_desktop_config(state.config_path.as_path(), &config)
            .expect("config should persist");
        {
            let mut runtime = state.inner.lock().await;
            runtime
                .unavailable_ai_option_notices
                .push(UnavailableAiOptionNotice {
                    group_name: DEFAULT_GROUP_NAME.to_string(),
                    ai_option_names: vec!["ai-option-removed-before".to_string()],
                });
        }

        let old_cache = AiOptionCatalogCache {
            version: AI_OPTION_CATALOG_CACHE_VERSION,
            fetched_at: 1_800_000_000,
            ai_options: vec![
                test_selectable_ai_option("ai-option-removed-before", true),
                test_selectable_ai_option("ai-option-removed-now", true),
                test_selectable_ai_option("ai-option-kept", true),
            ],
        };
        let new_cache = AiOptionCatalogCache {
            version: AI_OPTION_CATALOG_CACHE_VERSION,
            fetched_at: 1_800_000_100,
            ai_options: vec![test_selectable_ai_option("ai-option-kept", true)],
        };

        reconcile_group_ai_option_selections_with_catalog(&state, Some(&old_cache), &new_cache)
            .await
            .expect("selection should reconcile");

        let notices = {
            let runtime = state.inner.lock().await;
            runtime.unavailable_ai_option_notices.clone()
        };
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].group_name, DEFAULT_GROUP_NAME);
        assert_eq!(
            notices[0].ai_option_names,
            vec![
                "ai-option-removed-before".to_string(),
                "ai-option-removed-now".to_string()
            ]
        );
    }

    #[test]
    fn validate_ai_option_selection_skips_catalog_check_when_cache_is_missing() {
        let result = validate_ai_option_selection_against_catalog(
            &["ai-option-from-existing-config".to_string()],
            None,
        );

        assert!(result.is_ok());
    }

    #[test]
    fn validate_ai_option_selection_rejects_unknown_ids_when_cache_exists() {
        let cache = AiOptionCatalogCache {
            version: AI_OPTION_CATALOG_CACHE_VERSION,
            fetched_at: 1_800_000_000,
            ai_options: vec![test_selectable_ai_option("ai-option-known", true)],
        };
        let error = validate_ai_option_selection_against_catalog(
            &[
                "ai-option-known".to_string(),
                "ai-option-unknown".to_string(),
            ],
            Some(&cache),
        )
        .expect_err("unknown id should be rejected when cache exists");

        assert!(error.contains("ai-option-unknown"));
    }

    #[tokio::test]
    async fn apply_user_auth_header_prefers_bearer_token_over_dev_user_id() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config = test_config_with_group(
            "http://localhost:3001".to_string(),
            "user-1".to_string(),
            None,
            "zg-local-test",
            Vec::new(),
            "device-1",
            false,
        );
        let state = build_test_shared_state(
            &temp_directory,
            config.clone(),
            Some(AuthSession {
                access_token: "supabase-access-token".to_string(),
                refresh_token: "supabase-refresh-token".to_string(),
                email: Some("user@example.com".to_string()),
                user_id: Some("user-1".to_string()),
                expires_at: None,
            }),
        );

        let request = state.client.get("http://127.0.0.1:9/v1/ai-options");
        let request = apply_user_auth_header(request, &state, &config).await;
        let built = request.build().expect("request should build");

        let authorization = built
            .headers()
            .get(AUTHORIZATION)
            .expect("authorization header should be set")
            .to_str()
            .expect("authorization header should be valid utf-8");
        assert_eq!(authorization, "Bearer supabase-access-token");
        assert!(built.headers().get("x-zebragate-user-id").is_none());
    }

    #[tokio::test]
    async fn apply_user_auth_header_falls_back_to_dev_user_id_when_logged_out() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config = test_config_with_group(
            "http://localhost:3001".to_string(),
            "user-1".to_string(),
            None,
            "zg-local-test",
            Vec::new(),
            "device-1",
            false,
        );
        let state = build_test_shared_state(&temp_directory, config.clone(), None);

        let request = state.client.get("http://127.0.0.1:9/v1/ai-options");
        let request = apply_user_auth_header(request, &state, &config).await;
        let built = request.build().expect("request should build");

        let user_id_header = built
            .headers()
            .get("x-zebragate-user-id")
            .expect("dev user id header should be set")
            .to_str()
            .expect("header should be valid utf-8");
        assert_eq!(user_id_header, "user-1");
        assert!(built.headers().get(AUTHORIZATION).is_none());
    }

    #[tokio::test]
    async fn apply_user_auth_header_refreshes_expired_access_token() {
        let temp_directory = tempdir().expect("tempdir should be created");

        let refresh_app = Router::new().route(
            "/v1/auth/refresh",
            post(|Json(payload): Json<JsonValue>| async move {
                assert_eq!(payload["refreshToken"], json!("supabase-refresh-token"));
                Json(json!({
                  "accessToken": "refreshed-access-token",
                  "refreshToken": "refreshed-refresh-token",
                  "expiresAt": current_unix_timestamp() + 3600,
                  "email": "user@example.com",
                  "userId": "user-1",
                }))
            }),
        );
        let listener = TcpListener::bind((LOCAL_PROXY_HOST, 0))
            .await
            .expect("refresh listener should bind");
        let base_url = format!(
            "http://{}",
            listener.local_addr().expect("refresh addr should resolve")
        );
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        tokio::spawn(async move {
            let _ = axum::serve(listener, refresh_app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });

        let config = test_config_with_group(
            base_url,
            "user-1".to_string(),
            None,
            "zg-local-test",
            Vec::new(),
            "device-1",
            false,
        );
        let state = build_test_shared_state(
            &temp_directory,
            config.clone(),
            Some(AuthSession {
                access_token: "expired-access-token".to_string(),
                refresh_token: "supabase-refresh-token".to_string(),
                email: Some("user@example.com".to_string()),
                user_id: Some("user-1".to_string()),
                expires_at: Some(current_unix_timestamp() - 10),
            }),
        );

        let request = state.client.get("http://127.0.0.1:9/v1/ai-options");
        let request = apply_user_auth_header(request, &state, &config).await;
        let built = request.build().expect("request should build");

        let authorization = built
            .headers()
            .get(AUTHORIZATION)
            .expect("authorization header should be set")
            .to_str()
            .expect("authorization header should be valid utf-8");
        assert_eq!(authorization, "Bearer refreshed-access-token");

        let runtime = state.inner.lock().await;
        let session = runtime
            .auth_session
            .as_ref()
            .expect("auth session should remain set");
        assert_eq!(session.access_token, "refreshed-access-token");
        assert_eq!(session.refresh_token, "refreshed-refresh-token");
        drop(runtime);

        let persisted = load_auth_session(
            state.auth_session_path.as_path(),
            state.auth_key_path.as_path(),
        )
        .expect("session should load")
        .expect("session should exist");
        assert_eq!(persisted.access_token, "refreshed-access-token");

        let _ = shutdown_tx.send(());
    }

    #[tokio::test]
    async fn auth_callback_handler_persists_session_and_updates_runtime_state() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let remote = spawn_mock_remote_server(MockRemoteBehavior::JsonSuccess).await;
        let config_path = temp_directory.path().join("desktop-config.json");
        let config = test_config_with_group(
            remote.base_url.clone(),
            "user-1".to_string(),
            None,
            "zg-local-test",
            Vec::new(),
            "device-1",
            false,
        );
        persist_desktop_config(&config_path, &config).expect("config should persist");

        let state = DesktopSharedState {
            client: Client::builder().build().expect("client should build"),
            config_path: Arc::new(config_path),
            ai_option_catalog_cache_path: Arc::new(
                temp_directory.path().join("ai-options-catalog.cache"),
            ),
            auth_session_path: Arc::new(temp_directory.path().join("auth-session.bin")),
            auth_key_path: Arc::new(temp_directory.path().join("auth-key.bin")),
            privacy_keywords: Arc::new(Vec::new()),
            inner: Arc::new(Mutex::new(DesktopRuntimeState {
                config,
                proxy_status: LocalProxyStatusSnapshot {
                    running: false,
                    port: None,
                    address: build_local_address(7788),
                    last_request_status: "Local proxy is idle.".to_string(),
                    last_error_message: None,
                },
                shutdown_tx: None,
                auth_session: None,
                unavailable_ai_option_notices: Vec::new(),
            })),
            active_request_count: Arc::new(AtomicU32::new(0)),
        };

        let payload = AuthCallbackPayload {
            access_token: "supabase-access-token".to_string(),
            refresh_token: "supabase-refresh-token".to_string(),
            email: Some("user@example.com".to_string()),
            user_id: "user-1".to_string(),
            expires_at: Some(1_700_000_000),
        };

        let response = auth_callback_handler(State(state.clone()), Json(payload)).await;
        assert_eq!(response.status(), StatusCode::OK);

        let runtime = state.inner.lock().await;
        let session = runtime
            .auth_session
            .as_ref()
            .expect("auth session should be set");
        assert_eq!(session.access_token, "refreshed-access-token");
        assert_eq!(session.email, Some("user@example.com".to_string()));

        let reloaded = load_auth_session(
            state.auth_session_path.as_path(),
            state.auth_key_path.as_path(),
        )
        .expect("session should load")
        .expect("session should exist");
        assert_eq!(reloaded.access_token, "refreshed-access-token");

        let _ = remote
            .shutdown_tx
            .expect("mock remote should expose shutdown")
            .send(());
    }

    #[tokio::test]
    async fn find_available_listener_falls_back_when_default_port_is_busy() {
        let busy_listener = std::net::TcpListener::bind((LOCAL_PROXY_HOST, 7788))
            .expect("default local proxy port should bind for test");
        let (listener, port) = bind_local_proxy_listener(LocalPortBindingStrategy::FallbackRange {
            start_port: 7788,
            max_attempts: 3,
        })
        .await
        .expect("a fallback port should be found");

        assert_eq!(port, 7789);
        drop(listener);
        drop(busy_listener);
    }

    #[tokio::test]
    async fn bind_local_proxy_listener_uses_saved_port_when_available() {
        let reserved = std::net::TcpListener::bind((LOCAL_PROXY_HOST, 0))
            .expect("ephemeral port should bind for discovery");
        let port = reserved
            .local_addr()
            .expect("ephemeral port should resolve")
            .port();
        drop(reserved);

        let (listener, bound_port) =
            bind_local_proxy_listener(LocalPortBindingStrategy::Exact(port))
                .await
                .expect("saved port should bind when available");

        assert_eq!(bound_port, port);
        drop(listener);
    }

    #[tokio::test]
    async fn bind_local_proxy_listener_rejects_busy_saved_port_without_fallback() {
        let busy_listener = std::net::TcpListener::bind((LOCAL_PROXY_HOST, 0))
            .expect("saved port should bind for test");
        let port = busy_listener
            .local_addr()
            .expect("busy port should resolve")
            .port();

        let error = bind_local_proxy_listener(LocalPortBindingStrategy::Exact(port))
            .await
            .expect_err("busy saved port should fail without fallback");

        assert!(error.contains(&format!("Saved local proxy port {} is unavailable", port)));
        drop(busy_listener);
    }

    #[tokio::test]
    async fn local_chat_completions_handler_rejects_when_no_ai_option_is_selected() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config_path = temp_directory.path().join("desktop-config.json");
        let config = test_config_with_group(
            "http://127.0.0.1:9".to_string(),
            "user-1".to_string(),
            Some(7788),
            "zg-local-test",
            Vec::new(),
            "device-1",
            false,
        );
        persist_desktop_config(&config_path, &config).expect("config should persist");

        let state = DesktopSharedState {
            client: Client::builder().build().expect("client should build"),
            config_path: Arc::new(config_path),
            ai_option_catalog_cache_path: Arc::new(
                temp_directory.path().join("ai-options-catalog.cache"),
            ),
            auth_session_path: Arc::new(temp_directory.path().join("auth-session.bin")),
            auth_key_path: Arc::new(temp_directory.path().join("auth-key.bin")),
            privacy_keywords: Arc::new(vec!["private key".to_string()]),
            inner: Arc::new(Mutex::new(DesktopRuntimeState {
                config,
                proxy_status: LocalProxyStatusSnapshot {
                    running: true,
                    port: Some(7788),
                    address: build_local_address(7788),
                    last_request_status: "Local proxy started.".to_string(),
                    last_error_message: None,
                },
                shutdown_tx: None,
                auth_session: Some(AuthSession {
                    access_token: "access-token".to_string(),
                    refresh_token: "refresh-token".to_string(),
                    email: Some("user@example.com".to_string()),
                    user_id: Some("user-1".to_string()),
                    expires_at: None,
                }),
                unavailable_ai_option_notices: Vec::new(),
            })),
            active_request_count: Arc::new(AtomicU32::new(0)),
        };
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            "Bearer zg-local-test"
                .parse()
                .expect("authorization header should parse"),
        );

        let response = local_chat_completions_handler(
            State(state.clone()),
            headers,
            Bytes::from_static(
                br#"{"model":"zebragate_model","messages":[{"role":"user","content":"hello"}]}"#,
            ),
        )
        .await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should be readable");
        let payload: OpenAiErrorEnvelope =
            serde_json::from_slice(&body).expect("response body should be valid json");
        assert_eq!(payload.error.code, "NO_AI_OPTION_SELECTED");
        assert_eq!(payload.error.message, NO_AI_OPTION_SELECTED_USER_MESSAGE);

        let runtime = state.inner.lock().await;
        assert_eq!(
            runtime.proxy_status.last_request_status,
            "No AI option selected."
        );
        assert!(runtime
            .proxy_status
            .last_error_message
            .as_deref()
            .unwrap_or_default()
            .contains("No AI option is selected"));
    }

    #[tokio::test]
    async fn local_chat_completions_handler_rejects_when_user_is_not_logged_in() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config_path = temp_directory.path().join("desktop-config.json");
        let config = test_config_with_group(
            "http://127.0.0.1:9".to_string(),
            String::new(),
            Some(7788),
            "zg-local-test",
            vec!["ai-option-openai-mock".to_string()],
            "device-1",
            false,
        );
        persist_desktop_config(&config_path, &config).expect("config should persist");

        let state = DesktopSharedState {
            client: Client::builder().build().expect("client should build"),
            config_path: Arc::new(config_path),
            ai_option_catalog_cache_path: Arc::new(
                temp_directory.path().join("ai-options-catalog.cache"),
            ),
            auth_session_path: Arc::new(temp_directory.path().join("auth-session.bin")),
            auth_key_path: Arc::new(temp_directory.path().join("auth-key.bin")),
            privacy_keywords: Arc::new(vec!["private key".to_string()]),
            inner: Arc::new(Mutex::new(DesktopRuntimeState {
                config,
                proxy_status: LocalProxyStatusSnapshot {
                    running: true,
                    port: Some(7788),
                    address: build_local_address(7788),
                    last_request_status: "Local proxy started.".to_string(),
                    last_error_message: None,
                },
                shutdown_tx: None,
                auth_session: None,
                unavailable_ai_option_notices: Vec::new(),
            })),
            active_request_count: Arc::new(AtomicU32::new(0)),
        };
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            "Bearer zg-local-test"
                .parse()
                .expect("authorization header should parse"),
        );

        let response = local_chat_completions_handler(
            State(state.clone()),
            headers,
            Bytes::from_static(
                br#"{"model":"zebragate_model","messages":[{"role":"user","content":"hello"}]}"#,
            ),
        )
        .await;

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should be readable");
        let payload: OpenAiErrorEnvelope =
            serde_json::from_slice(&body).expect("response body should be valid json");
        assert_eq!(payload.error.code, "NOT_LOGGED_IN");
        assert_eq!(payload.error.message, NOT_LOGGED_IN_USER_MESSAGE);

        let runtime = state.inner.lock().await;
        assert_eq!(
            runtime.proxy_status.last_request_status,
            "User is not signed in."
        );
        assert!(runtime
            .proxy_status
            .last_error_message
            .as_deref()
            .unwrap_or_default()
            .contains("not signed in"));
    }

    #[tokio::test]
    async fn local_proxy_routes_are_reachable_after_server_start() {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config_path = temp_directory.path().join("desktop-config.json");
        let config = test_config_with_group(
            "http://127.0.0.1:9".to_string(),
            "user-1".to_string(),
            Some(7788),
            "zg-local-test",
            vec!["ai-option-openai-mock".to_string()],
            "device-1",
            false,
        );
        persist_desktop_config(&config_path, &config).expect("config should persist");

        let shared_state = DesktopSharedState {
            client: Client::builder().build().expect("client should build"),
            config_path: Arc::new(config_path),
            ai_option_catalog_cache_path: Arc::new(
                temp_directory.path().join("ai-options-catalog.cache"),
            ),
            auth_session_path: Arc::new(temp_directory.path().join("auth-session.bin")),
            auth_key_path: Arc::new(temp_directory.path().join("auth-key.bin")),
            privacy_keywords: Arc::new(vec!["private key".to_string()]),
            inner: Arc::new(Mutex::new(DesktopRuntimeState {
                config,
                proxy_status: LocalProxyStatusSnapshot {
                    running: false,
                    port: None,
                    address: build_local_address(7788),
                    last_request_status: "Local proxy is idle.".to_string(),
                    last_error_message: None,
                },
                shutdown_tx: None,
                auth_session: None,
                unavailable_ai_option_notices: Vec::new(),
            })),
            active_request_count: Arc::new(AtomicU32::new(0)),
        };

        let app = build_local_proxy_router(
            shared_state.inner.clone(),
            shared_state.client.clone(),
            shared_state.config_path.clone(),
            shared_state.ai_option_catalog_cache_path.clone(),
            shared_state.auth_session_path.clone(),
            shared_state.auth_key_path.clone(),
            shared_state.privacy_keywords.clone(),
            shared_state.active_request_count.clone(),
        );
        let listener = TcpListener::bind((LOCAL_PROXY_HOST, 0))
            .await
            .expect("test listener should bind");
        let address = listener.local_addr().expect("local addr should resolve");
        let base_url = format!("http://{}", address);
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });

        verify_local_proxy_health(&shared_state.client, &base_url)
            .await
            .expect("health check should pass");

        let root_response = shared_state
            .client
            .get(format!("{base_url}/"))
            .send()
            .await
            .expect("root request should connect");
        assert_eq!(root_response.status(), ReqwestStatusCode::NOT_FOUND);

        let v1_response = shared_state
            .client
            .get(format!("{base_url}/v1"))
            .send()
            .await
            .expect("/v1 request should connect");
        assert_eq!(v1_response.status(), ReqwestStatusCode::NOT_FOUND);

        let _ = shutdown_tx.send(());
        verify_local_proxy_stopped(&shared_state.client, &base_url)
            .await
            .expect("proxy should stop after shutdown");
    }

    #[tokio::test]
    async fn local_proxy_forwards_json_requests_with_ai_option_ids_and_headers() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::JsonSuccess).await;
        let local = spawn_local_proxy_server(
            remote.base_url.clone(),
            vec!["ai-option-openai-mock".to_string()],
            vec!["private key".to_string()],
            false,
        )
        .await;

        let response = local
            .client
            .post(format!("{}/v1/chat/completions", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {}", local.local_key),
            )
            .json(&json!({
              "model": "zebragate_model",
              "messages": [{ "role": "user", "content": "hello" }],
              "stream": false,
              "ai_option_ids": ["client-ai-option-should-be-overridden"]
            }))
            .send()
            .await
            .expect("local proxy request should succeed");

        assert_eq!(response.status(), ReqwestStatusCode::OK);
        let payload = response
            .json::<JsonValue>()
            .await
            .expect("json payload should decode");
        assert_eq!(payload["id"], json!("chatcmpl-mock"));

        let requests = remote.requests.lock().await;
        let completion_request = requests
            .iter()
            .find(|request| request.path == "/v1/openai/chat/completions")
            .expect("remote completion request should be recorded");
        assert_eq!(completion_request.body["model"], json!("zebragate_model"));
        assert_eq!(
            completion_request.body["ai_option_ids"],
            json!(["ai-option-openai-mock"])
        );
        assert_eq!(completion_request.body["stream"], json!(false));
        assert_eq!(
            completion_request.body["messages"][0]["content"],
            json!("hello")
        );
        assert_eq!(
            get_recorded_header(completion_request, AUTHORIZATION.as_str()),
            Some("Bearer access-token")
        );
        assert_eq!(
            get_recorded_header(completion_request, "x-zebragate-user-id"),
            None
        );
        assert_eq!(
            get_recorded_header(completion_request, "x-device-id"),
            Some("device-1")
        );
        assert_eq!(
            get_recorded_header(completion_request, "x-zebragate-local-proxy"),
            Some("true")
        );
        assert!(get_recorded_header(completion_request, TRACE_ID_HEADER).is_some());

        let trace_requests = requests
            .iter()
            .filter(|request| request.path == "/v1/openai/trace-events")
            .collect::<Vec<_>>();
        assert!(trace_requests.len() >= 2);
        assert!(trace_requests
            .iter()
            .any(|request| request.body["stage"] == json!("desktop_inbound")));
        assert!(trace_requests
            .iter()
            .any(|request| request.body["stage"] == json!("desktop_to_server")));

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_forwards_sse_streams() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::StreamSuccess).await;
        let local = spawn_local_proxy_server(
            remote.base_url.clone(),
            vec!["ai-option-openai-mock".to_string()],
            vec!["private key".to_string()],
            false,
        )
        .await;

        let response = local
            .client
            .post(format!("{}/v1/chat/completions", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {}", local.local_key),
            )
            .json(&json!({
              "model": "zebragate_model",
              "messages": [{ "role": "user", "content": "stream me" }],
              "stream": true
            }))
            .send()
            .await
            .expect("stream request should succeed");

        assert_eq!(response.status(), ReqwestStatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("text/event-stream")
        );
        let body = response.text().await.expect("stream body should read");
        assert!(body.contains("data:"));
        assert!(body.contains("[DONE]"));

        let finished_trace_request =
            wait_for_trace_event(&remote, "desktop_to_client", "finished").await;
        let summary = &finished_trace_request.body["payloadJson"]["streamSummary"];
        assert_eq!(summary["chunkCount"], json!(2));
        assert_eq!(summary["completed"], json!(true));

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_does_not_block_sensitive_keywords_when_privacy_protection_is_disabled() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::JsonSuccess).await;
        let local = spawn_local_proxy_server(
            remote.base_url.clone(),
            vec!["ai-option-openai-mock".to_string()],
            vec![
                "private key".to_string(),
                "seed phrase".to_string(),
                "api key".to_string(),
            ],
            false,
        )
        .await;

        let response = local
      .client
      .post(format!("{}/v1/chat/completions", local.base_url))
      .header(AUTHORIZATION.as_str(), format!("Bearer {}", local.local_key))
      .json(&json!({
        "model": "zebragate_model",
        "messages": [{ "role": "user", "content": "my private key and api key should not be blocked in the current MVP" }],
        "stream": false
      }))
      .send()
      .await
      .expect("privacy-disabled request should succeed");

        assert_eq!(response.status(), ReqwestStatusCode::OK);
        let payload = response
            .json::<JsonValue>()
            .await
            .expect("json payload should decode");
        assert_eq!(payload["id"], json!("chatcmpl-mock"));

        let requests = remote.requests.lock().await;
        assert!(requests
            .iter()
            .any(|request| request.path == "/v1/openai/chat/completions"));

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_blocks_privacy_hits_without_calling_remote_when_enabled() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::JsonSuccess).await;
        let local = spawn_local_proxy_server(
            remote.base_url.clone(),
            vec!["ai-option-openai-mock".to_string()],
            vec!["private key".to_string()],
            true,
        )
        .await;

        let response = local
            .client
            .post(format!("{}/v1/chat/completions", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {}", local.local_key),
            )
            .json(&json!({
              "model": "zebragate_model",
              "messages": [{ "role": "user", "content": "my private key is abc" }],
              "stream": false
            }))
            .send()
            .await
            .expect("privacy request should return a response");

        assert_eq!(response.status(), ReqwestStatusCode::FORBIDDEN);
        let payload = response
            .json::<OpenAiErrorEnvelope>()
            .await
            .expect("privacy error payload should decode");
        assert_eq!(payload.error.code, "PRIVACY_BLOCKED");
        assert_eq!(
      payload.error.message,
      "ZebraGate blocked this request because it may contain sensitive information. Please remove sensitive content and try again."
    );
        assert!(!payload.error.message.contains("Matched keywords"));
        assert_no_sensitive_keywords(&payload.error.message);
        let requests = remote.requests.lock().await;
        assert!(requests
            .iter()
            .all(|request| request.path != "/v1/openai/chat/completions"));

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_does_not_call_remote_when_no_ai_option_is_selected() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::JsonSuccess).await;
        let local = spawn_local_proxy_server(
            remote.base_url.clone(),
            Vec::new(),
            vec!["private key".to_string()],
            false,
        )
        .await;

        let response = local
            .client
            .post(format!("{}/v1/chat/completions", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {}", local.local_key),
            )
            .json(&json!({
              "model": "zebragate_model",
              "messages": [{ "role": "user", "content": "hello" }],
              "stream": false
            }))
            .send()
            .await
            .expect("no ai option request should return a response");

        assert_eq!(response.status(), ReqwestStatusCode::BAD_REQUEST);
        let requests = remote.requests.lock().await;
        assert!(requests
            .iter()
            .all(|request| request.path != "/v1/openai/chat/completions"));

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_records_group_last_used_time_when_key_matches() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::JsonSuccess).await;
        let local = spawn_local_proxy_server(
            remote.base_url.clone(),
            vec!["ai-option-openai-mock".to_string()],
            Vec::new(),
            false,
        )
        .await;
        let config_path = local
            .config_path
            .as_ref()
            .expect("local proxy test server should expose config path")
            .clone();
        let before_request = current_unix_timestamp();

        let response = local
            .client
            .get(format!("{}/v1/models", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {}", local.local_key),
            )
            .send()
            .await
            .expect("models request should return a response");
        let after_request = current_unix_timestamp();

        assert_eq!(response.status(), ReqwestStatusCode::OK);
        let reloaded =
            load_desktop_config_for_user(&config_path, None).expect("config should reload");
        let last_used_at = reloaded.groups[0]
            .last_used_at
            .expect("matched group should record last used time");
        assert!(last_used_at >= before_request);
        assert!(last_used_at <= after_request);

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_routes_ai_option_ids_per_group_local_key() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::JsonSuccess).await;
        let local = spawn_local_proxy_server_with_extra_groups(
            remote.base_url.clone(),
            vec!["ai-option-openai-mock".to_string()],
            Vec::new(),
            false,
            vec![(
                "zg-local-second-group",
                vec!["ai-option-claude-mock".to_string()],
            )],
        )
        .await;

        let default_group_response = local
            .client
            .post(format!("{}/v1/chat/completions", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {}", local.local_key),
            )
            .json(&json!({
              "model": "zebragate_model",
              "messages": [{ "role": "user", "content": "hello from default group" }],
              "stream": false
            }))
            .send()
            .await
            .expect("default group request should return a response");
        assert_eq!(default_group_response.status(), ReqwestStatusCode::OK);

        let second_group_local_key = local.extra_group_local_keys[0].clone();
        let second_group_response = local
            .client
            .post(format!("{}/v1/chat/completions", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {second_group_local_key}"),
            )
            .json(&json!({
              "model": "zebragate_model",
              "messages": [{ "role": "user", "content": "hello from second group" }],
              "stream": false
            }))
            .send()
            .await
            .expect("second group request should return a response");
        assert_eq!(second_group_response.status(), ReqwestStatusCode::OK);

        let requests = remote.requests.lock().await;
        let completion_requests = requests
            .iter()
            .filter(|request| request.path == "/v1/openai/chat/completions")
            .collect::<Vec<_>>();
        assert_eq!(completion_requests.len(), 2);

        let default_group_request = completion_requests
            .iter()
            .find(|request| {
                request.body["messages"][0]["content"] == json!("hello from default group")
            })
            .expect("default group completion request should be recorded");
        assert_eq!(
            default_group_request.body["ai_option_ids"],
            json!(["ai-option-openai-mock"])
        );

        let second_group_request = completion_requests
            .iter()
            .find(|request| {
                request.body["messages"][0]["content"] == json!("hello from second group")
            })
            .expect("second group completion request should be recorded");
        assert_eq!(
            second_group_request.body["ai_option_ids"],
            json!(["ai-option-claude-mock"])
        );

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_rejects_unselected_group_without_affecting_other_groups() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::JsonSuccess).await;
        let local = spawn_local_proxy_server_with_extra_groups(
            remote.base_url.clone(),
            vec!["ai-option-openai-mock".to_string()],
            Vec::new(),
            false,
            vec![("zg-local-empty-group", Vec::new())],
        )
        .await;

        let empty_group_local_key = local.extra_group_local_keys[0].clone();
        let empty_group_response = local
            .client
            .post(format!("{}/v1/chat/completions", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {empty_group_local_key}"),
            )
            .json(&json!({
              "model": "zebragate_model",
              "messages": [{ "role": "user", "content": "hello" }],
              "stream": false
            }))
            .send()
            .await
            .expect("empty group request should return a response");
        assert_eq!(
            empty_group_response.status(),
            ReqwestStatusCode::BAD_REQUEST
        );

        let default_group_response = local
            .client
            .post(format!("{}/v1/chat/completions", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {}", local.local_key),
            )
            .json(&json!({
              "model": "zebragate_model",
              "messages": [{ "role": "user", "content": "hello" }],
              "stream": false
            }))
            .send()
            .await
            .expect("default group request should return a response");
        assert_eq!(default_group_response.status(), ReqwestStatusCode::OK);

        let requests = remote.requests.lock().await;
        let completion_requests = requests
            .iter()
            .filter(|request| request.path == "/v1/openai/chat/completions")
            .collect::<Vec<_>>();
        assert_eq!(completion_requests.len(), 1);
        assert_eq!(
            completion_requests[0].body["ai_option_ids"],
            json!(["ai-option-openai-mock"])
        );

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_returns_clear_bad_gateway_when_remote_is_unreachable() {
        let local = spawn_local_proxy_server(
            "http://127.0.0.1:9".to_string(),
            vec!["ai-option-openai-mock".to_string()],
            vec!["private key".to_string()],
            false,
        )
        .await;

        let response = local
            .client
            .post(format!("{}/v1/chat/completions", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {}", local.local_key),
            )
            .json(&json!({
              "model": "zebragate_model",
              "messages": [{ "role": "user", "content": "hello" }],
              "stream": false
            }))
            .send()
            .await
            .expect("unreachable remote request should return a response");

        assert_eq!(response.status(), ReqwestStatusCode::BAD_GATEWAY);
        let payload = response
            .json::<OpenAiErrorEnvelope>()
            .await
            .expect("error payload should decode");
        assert_eq!(payload.error.code, "BAD_GATEWAY");
        assert_eq!(payload.error.message, BAD_GATEWAY_USER_MESSAGE);
        assert!(!payload.error.message.contains("http://localhost"));
        assert!(!payload.error.message.contains("error sending request"));

        shutdown_test_server(local.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_does_not_reblock_safe_privacy_error_text_in_user_message() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::JsonSuccess).await;
        let local = spawn_local_proxy_server(
            remote.base_url.clone(),
            vec!["ai-option-openai-mock".to_string()],
            vec!["private key".to_string(), "seed phrase".to_string()],
            false,
        )
        .await;

        let response = local
      .client
      .post(format!("{}/v1/chat/completions", local.base_url))
      .header(AUTHORIZATION.as_str(), format!("Bearer {}", local.local_key))
      .json(&json!({
        "model": "zebragate_model",
        "messages": [{ "role": "user", "content": "ZebraGate blocked this request because it may contain sensitive information. Please remove sensitive content and try again." }],
        "stream": false
      }))
      .send()
      .await
      .expect("safe privacy text request should succeed");

        assert_eq!(response.status(), ReqwestStatusCode::OK);
        let requests = remote.requests.lock().await;
        assert!(requests
            .iter()
            .any(|request| request.path == "/v1/openai/chat/completions"));

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_ignores_assistant_role_error_text_during_privacy_scan() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::JsonSuccess).await;
        let local = spawn_local_proxy_server(
            remote.base_url.clone(),
            vec!["ai-option-openai-mock".to_string()],
            vec!["private key".to_string(), "seed phrase".to_string()],
            false,
        )
        .await;

        let response = local
      .client
      .post(format!("{}/v1/chat/completions", local.base_url))
      .header(AUTHORIZATION.as_str(), format!("Bearer {}", local.local_key))
      .json(&json!({
        "model": "zebragate_model",
        "messages": [
          { "role": "assistant", "content": "Request blocked by local privacy protection. Matched keywords: private key, seed phrase." },
          { "role": "user", "content": "please continue" }
        ],
        "stream": false
      }))
      .send()
      .await
      .expect("assistant error text request should succeed");

        assert_eq!(response.status(), ReqwestStatusCode::OK);
        let requests = remote.requests.lock().await;
        assert!(requests
            .iter()
            .any(|request| request.path == "/v1/openai/chat/completions"));

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    #[tokio::test]
    async fn local_proxy_passthroughs_remote_business_errors() {
        let remote = spawn_mock_remote_server(MockRemoteBehavior::Error {
            status: StatusCode::PAYMENT_REQUIRED,
            code: "INSUFFICIENT_CREDITS",
            message: "Not enough credits.",
        })
        .await;
        let local = spawn_local_proxy_server(
            remote.base_url.clone(),
            vec!["ai-option-openai-mock".to_string()],
            vec!["private key".to_string()],
            false,
        )
        .await;

        let response = local
            .client
            .post(format!("{}/v1/chat/completions", local.base_url))
            .header(
                AUTHORIZATION.as_str(),
                format!("Bearer {}", local.local_key),
            )
            .json(&json!({
              "model": "zebragate_model",
              "messages": [{ "role": "user", "content": "hello" }],
              "stream": false
            }))
            .send()
            .await
            .expect("remote error request should return a response");

        assert_eq!(response.status(), ReqwestStatusCode::PAYMENT_REQUIRED);
        let payload = response
            .json::<OpenAiErrorEnvelope>()
            .await
            .expect("error payload should decode");
        assert_eq!(payload.error.code, "INSUFFICIENT_CREDITS");
        assert_eq!(payload.error.message, "Not enough credits.");

        shutdown_test_server(local.shutdown_tx).await;
        shutdown_test_server(remote.shutdown_tx).await;
    }

    struct SpawnedTestServer {
        base_url: String,
        client: Client,
        local_key: String,
        config_path: Option<PathBuf>,
        extra_group_local_keys: Vec<String>,
        requests: Arc<TokioMutex<Vec<MockRemoteRequestRecord>>>,
        shutdown_tx: Option<oneshot::Sender<()>>,
        _temp_directory: Option<TempDir>,
    }

    async fn spawn_local_proxy_server(
        remote_api_base_url: String,
        selected_ai_option_ids: Vec<String>,
        privacy_keywords: Vec<String>,
        privacy_protection_enabled: bool,
    ) -> SpawnedTestServer {
        spawn_local_proxy_server_with_extra_groups(
            remote_api_base_url,
            selected_ai_option_ids,
            privacy_keywords,
            privacy_protection_enabled,
            Vec::new(),
        )
        .await
    }

    async fn spawn_local_proxy_server_with_extra_groups(
        remote_api_base_url: String,
        selected_ai_option_ids: Vec<String>,
        privacy_keywords: Vec<String>,
        privacy_protection_enabled: bool,
        extra_groups: Vec<(&str, Vec<String>)>,
    ) -> SpawnedTestServer {
        let temp_directory = tempdir().expect("tempdir should be created");
        let config_path = temp_directory.path().join("desktop-config.json");
        let mut config = test_config_with_group(
            remote_api_base_url,
            "user-1".to_string(),
            None,
            "zg-local-test",
            selected_ai_option_ids,
            "device-1",
            privacy_protection_enabled,
        );
        let extra_group_local_keys = extra_groups
            .iter()
            .map(|(local_key, _)| local_key.to_string())
            .collect::<Vec<_>>();
        for (local_key, group_selected_ai_option_ids) in extra_groups {
            config.groups.push(DesktopGroup {
                id: Uuid::new_v4().to_string(),
                name: local_key.to_string(),
                local_key: local_key.to_string(),
                last_used_at: None,
                selected_ai_option_ids: group_selected_ai_option_ids,
            });
        }
        persist_desktop_config(&config_path, &config).expect("config should persist");
        let readable_config_path = config_path.clone();

        let shared_state = DesktopSharedState {
            client: Client::builder().build().expect("client should build"),
            config_path: Arc::new(config_path),
            ai_option_catalog_cache_path: Arc::new(
                temp_directory.path().join("ai-options-catalog.cache"),
            ),
            auth_session_path: Arc::new(temp_directory.path().join("auth-session.bin")),
            auth_key_path: Arc::new(temp_directory.path().join("auth-key.bin")),
            privacy_keywords: Arc::new(privacy_keywords),
            inner: Arc::new(Mutex::new(DesktopRuntimeState {
                config,
                proxy_status: LocalProxyStatusSnapshot {
                    running: true,
                    port: None,
                    address: build_local_address(7788),
                    last_request_status: "Local proxy started.".to_string(),
                    last_error_message: None,
                },
                shutdown_tx: None,
                auth_session: Some(AuthSession {
                    access_token: "access-token".to_string(),
                    refresh_token: "refresh-token".to_string(),
                    email: Some("user@example.com".to_string()),
                    user_id: Some("user-1".to_string()),
                    expires_at: None,
                }),
                unavailable_ai_option_notices: Vec::new(),
            })),
            active_request_count: Arc::new(AtomicU32::new(0)),
        };

        let app = build_local_proxy_router(
            shared_state.inner.clone(),
            shared_state.client.clone(),
            shared_state.config_path.clone(),
            shared_state.ai_option_catalog_cache_path.clone(),
            shared_state.auth_session_path.clone(),
            shared_state.auth_key_path.clone(),
            shared_state.privacy_keywords.clone(),
            shared_state.active_request_count.clone(),
        );
        let listener = TcpListener::bind((LOCAL_PROXY_HOST, 0))
            .await
            .expect("local listener should bind");
        let base_url = format!(
            "http://{}",
            listener.local_addr().expect("local addr should resolve")
        );
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });

        verify_local_proxy_health(&shared_state.client, &base_url)
            .await
            .expect("local proxy health should pass");

        SpawnedTestServer {
            base_url,
            client: Client::builder().build().expect("client should build"),
            local_key: "zg-local-test".to_string(),
            config_path: Some(readable_config_path),
            extra_group_local_keys,
            requests: Arc::new(TokioMutex::new(Vec::new())),
            shutdown_tx: Some(shutdown_tx),
            _temp_directory: Some(temp_directory),
        }
    }

    async fn spawn_mock_remote_server(behavior: MockRemoteBehavior) -> SpawnedTestServer {
        let requests = Arc::new(TokioMutex::new(Vec::new()));
        let app_state = MockRemoteState {
            behavior,
            requests: requests.clone(),
        };

        let app = Router::new()
            .route("/v1/ai-options", get(mock_remote_ai_options_handler))
            .route("/v1/auth/refresh", post(mock_remote_auth_refresh_handler))
            .route(
                "/v1/openai/chat/completions",
                any(mock_remote_chat_completions_handler),
            )
            .route(
                "/v1/openai/trace-events",
                any(mock_remote_trace_events_handler),
            )
            .layer(axum::middleware::from_fn_with_state(
                app_state.clone(),
                mock_remote_capture_middleware,
            ))
            .with_state(app_state);

        let listener = TcpListener::bind((LOCAL_PROXY_HOST, 0))
            .await
            .expect("remote listener should bind");
        let base_url = format!(
            "http://{}",
            listener.local_addr().expect("remote addr should resolve")
        );
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = shutdown_rx.await;
                })
                .await;
        });

        SpawnedTestServer {
            base_url,
            client: Client::builder().build().expect("client should build"),
            local_key: String::new(),
            config_path: None,
            extra_group_local_keys: Vec::new(),
            requests,
            shutdown_tx: Some(shutdown_tx),
            _temp_directory: None,
        }
    }

    async fn mock_remote_capture_middleware(
        State(state): State<MockRemoteState>,
        request: Request,
        next: Next,
    ) -> AxumResponse {
        let headers = request
            .headers()
            .iter()
            .map(|(key, value)| {
                (
                    key.as_str().to_string(),
                    value.to_str().unwrap_or_default().to_string(),
                )
            })
            .collect::<Vec<_>>();
        let path = request.uri().path().to_string();
        let method = request.method().clone();

        if method != axum::http::Method::GET {
            let body = request
                .extensions()
                .get::<JsonValue>()
                .cloned()
                .unwrap_or_else(|| json!({}));
            state.requests.lock().await.push(MockRemoteRequestRecord {
                path,
                headers,
                body,
            });
        } else {
            state.requests.lock().await.push(MockRemoteRequestRecord {
                path,
                headers,
                body: json!({}),
            });
        }

        next.run(request).await
    }

    async fn mock_remote_ai_options_handler() -> impl IntoResponse {
        Json(AiOptionCatalogResponse {
            ai_options: vec![
                SelectableAiOption {
                    ai_option_id: "ai-option-openai-mock".to_string(),
                    provider_label: "OpenAI Mock".to_string(),
                    model_label: "zebragate_model".to_string(),
                    public_name: "OpenAI Mock".to_string(),
                    display_config_summary: "Mock AI option".to_string(),
                    display_badges: Vec::new(),
                    credit_multiplier: 1.0,
                    is_recommended: true,
                    status: ProviderStatus::Healthy,
                    disable_reason: None,
                    sort_order: 0,
                },
                SelectableAiOption {
                    ai_option_id: "ai-option-claude-mock".to_string(),
                    provider_label: "Claude Mock".to_string(),
                    model_label: "zebragate_model".to_string(),
                    public_name: "Claude Mock".to_string(),
                    display_config_summary: "Mock AI option".to_string(),
                    display_badges: Vec::new(),
                    credit_multiplier: 1.0,
                    is_recommended: true,
                    status: ProviderStatus::Healthy,
                    disable_reason: None,
                    sort_order: 1,
                },
            ],
        })
    }

    async fn mock_remote_auth_refresh_handler(Json(payload): Json<JsonValue>) -> impl IntoResponse {
        assert_eq!(payload["refreshToken"], json!("supabase-refresh-token"));
        Json(json!({
          "accessToken": "refreshed-access-token",
          "refreshToken": "refreshed-refresh-token",
          "expiresAt": current_unix_timestamp() + 3600,
          "email": "user@example.com",
          "userId": "user-1",
        }))
    }

    async fn mock_remote_chat_completions_handler(
        State(state): State<MockRemoteState>,
        headers: HeaderMap,
        body: Json<JsonValue>,
    ) -> Response<Body> {
        {
            let mut requests = state.requests.lock().await;
            if let Some(last_request) = requests.last_mut() {
                last_request.body = body.0.clone();
                if !last_request
                    .headers
                    .iter()
                    .any(|(key, _)| key == CONTENT_TYPE.as_str())
                {
                    last_request.headers.push((
                        CONTENT_TYPE.as_str().to_string(),
                        headers
                            .get(CONTENT_TYPE)
                            .and_then(|value| value.to_str().ok())
                            .unwrap_or_default()
                            .to_string(),
                    ));
                }
            }
        }

        match &state.behavior {
            MockRemoteBehavior::JsonSuccess => json_response(
                StatusCode::OK,
                &json!({
                  "id": "chatcmpl-mock",
                  "object": "chat.completion",
                  "choices": [{
                    "index": 0,
                    "message": { "role": "assistant", "content": "hello from mock remote" },
                    "finish_reason": "stop"
                  }]
                }),
            ),
            MockRemoteBehavior::StreamSuccess => Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, HeaderValue::from_static("text/event-stream"))
                .body(Body::from(
                    "data: {\"id\":\"chatcmpl-stream\"}\n\ndata: [DONE]\n\n",
                ))
                .expect("stream response should build"),
            MockRemoteBehavior::Error {
                status,
                code,
                message,
            } => openai_error_response(*status, message, code),
        }
    }

    async fn mock_remote_trace_events_handler(
        State(state): State<MockRemoteState>,
        headers: HeaderMap,
        body: Json<JsonValue>,
    ) -> Response<Body> {
        {
            let mut requests = state.requests.lock().await;
            if let Some(last_request) = requests.last_mut() {
                last_request.body = body.0.clone();
                if !last_request
                    .headers
                    .iter()
                    .any(|(key, _)| key == CONTENT_TYPE.as_str())
                {
                    last_request.headers.push((
                        CONTENT_TYPE.as_str().to_string(),
                        headers
                            .get(CONTENT_TYPE)
                            .and_then(|value| value.to_str().ok())
                            .unwrap_or_default()
                            .to_string(),
                    ));
                }
            }
        }

        json_response(StatusCode::OK, &json!({ "recorded": true }))
    }

    async fn shutdown_test_server(shutdown_tx: Option<oneshot::Sender<()>>) {
        if let Some(sender) = shutdown_tx {
            let _ = sender.send(());
        }
    }

    /// Polls the mock remote server's recorded `/v1/openai/trace-events` requests until one
    /// matching the given stage and status appears, since `GuardedStream` records the
    /// `desktop_to_client (finished)` event from a spawned task after the response body
    /// has been fully streamed back to the test client.
    async fn wait_for_trace_event(
        remote: &SpawnedTestServer,
        stage: &str,
        status: &str,
    ) -> MockRemoteRequestRecord {
        for _ in 0..40 {
            {
                let requests = remote.requests.lock().await;
                if let Some(found) = requests.iter().find(|request| {
                    request.path == "/v1/openai/trace-events"
                        && request.body["stage"] == json!(stage)
                        && request.body["status"] == json!(status)
                }) {
                    return found.clone();
                }
            }
            sleep(Duration::from_millis(50)).await;
        }

        panic!("Timed out waiting for trace event stage={stage} status={status}");
    }

    fn get_recorded_header<'a>(
        request: &'a MockRemoteRequestRecord,
        header_name: &str,
    ) -> Option<&'a str> {
        request
            .headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(header_name))
            .map(|(_, value)| value.as_str())
    }

    fn assert_no_sensitive_keywords(text: &str) {
        let normalized_text = text.to_lowercase();
        for keyword in [
            "private key",
            "seed phrase",
            "mnemonic",
            "api key",
            "secret key",
            "access token",
            "bearer token",
            "助记词",
            "私钥",
            "密码",
            "身份证",
            "银行卡",
        ] {
            assert!(
                !normalized_text.contains(&keyword.to_lowercase()),
                "response text should not contain sensitive keyword: {keyword}"
            );
        }
    }
}
