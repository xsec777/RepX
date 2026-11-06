//! RepX 核心后端：HTTP 收发、SQLite 项目存储、本地 REST API 与 MCP 服务

pub mod db;
pub mod server;
pub mod state;

use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, LOCATION};
use reqwest::redirect::Policy;
use reqwest::{Client, Method, Version};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

use crate::db::{HistoryDetail, HistoryFilter, HistoryRowSummary, ProjectDb, ProjectInfo, TabItem};
use crate::state::AppState;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequestInput {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub body_base64: Option<String>,
    #[serde(default)]
    pub proxy: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub follow_redirects: bool,
    #[serde(default)]
    pub http_version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponseData {
    pub status: u16,
    pub status_text: String,
    pub http_version: String,
    pub headers: Vec<(String, String)>,
    pub body_text: String,
    pub body_base64: String,
    pub size: usize,
    pub duration_ms: u64,
    pub final_url: String,
    pub is_binary: bool,
    pub content_type: String,
    pub received_at: u64,
    pub redirect_location: Option<String>,
    pub warnings: Vec<String>,
    pub history_id: Option<i64>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn version_str(version: Version) -> &'static str {
    match version {
        Version::HTTP_09 => "HTTP/0.9",
        Version::HTTP_10 => "HTTP/1.0",
        Version::HTTP_11 => "HTTP/1.1",
        Version::HTTP_2 => "HTTP/2",
        Version::HTTP_3 => "HTTP/3",
        _ => "HTTP/?",
    }
}

fn build_client(
    input: &SendRequestInput,
    jar: Arc<reqwest::cookie::Jar>,
) -> Result<Client, String> {
    let timeout = input.timeout_ms.unwrap_or(30_000).clamp(1_000, 600_000);

    let mut builder = Client::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .cookie_provider(jar)
        .timeout(Duration::from_millis(timeout))
        .connect_timeout(Duration::from_secs(20))
        .pool_max_idle_per_host(0)
        .redirect(if input.follow_redirects {
            Policy::limited(10)
        } else {
            Policy::none()
        });

    match input.http_version.as_deref() {
        Some("http1") => builder = builder.http1_only(),
        Some("http2") => builder = builder.http2_prior_knowledge(),
        _ => {}
    }

    match input.proxy.as_deref().map(str::trim).filter(|p| !p.is_empty()) {
        Some(proxy) => {
            let proxy = reqwest::Proxy::all(proxy).map_err(|e| format!("代理地址无效: {e}"))?;
            builder = builder.proxy(proxy);
        }
        None => builder = builder.no_proxy(),
    }

    builder.build().map_err(|e| format!("HTTP 客户端创建失败: {e}"))
}

fn build_headers(input: &SendRequestInput, warnings: &mut Vec<String>) -> HeaderMap {
    let mut map = HeaderMap::new();

    for (raw_name, raw_value) in &input.headers {
        let name = raw_name.trim();
        if name.is_empty() {
            continue;
        }
        let lower = name.to_ascii_lowercase();
        if matches!(lower.as_str(), "content-length" | "transfer-encoding" | "connection") {
            warnings.push(format!("已忽略 {name}：由连接层自动计算"));
            continue;
        }

        let header_name = match HeaderName::from_bytes(name.as_bytes()) {
            Ok(v) => v,
            Err(_) => {
                warnings.push(format!("请求头名不合法，已跳过: {name}"));
                continue;
            }
        };
        let header_value = match HeaderValue::from_bytes(raw_value.trim().as_bytes()) {
            Ok(v) => v,
            Err(_) => {
                warnings.push(format!("请求头 {name} 的值不合法，已跳过"));
                continue;
            }
        };
        map.append(header_name, header_value);
    }

    map
}

fn decode_body(input: &SendRequestInput) -> Result<Option<Vec<u8>>, String> {
    if let Some(b64) = input.body_base64.as_deref().filter(|s| !s.trim().is_empty()) {
        return B64
            .decode(b64)
            .map(Some)
            .map_err(|e| format!("body_base64 解码失败: {e}"));
    }
    Ok(input
        .body
        .as_ref()
        .filter(|b| !b.is_empty())
        .map(|b| b.as_bytes().to_vec()))
}

fn looks_binary(bytes: &[u8], content_type: &str) -> bool {
    let ct = content_type.to_ascii_lowercase();
    if ct.starts_with("text/")
        || ct.contains("json")
        || ct.contains("xml")
        || ct.contains("html")
        || ct.contains("javascript")
        || ct.contains("ecmascript")
        || ct.contains("x-www-form-urlencoded")
    {
        return false;
    }
    if ct.starts_with("image/")
        || ct.starts_with("audio/")
        || ct.starts_with("video/")
        || ct.contains("octet-stream")
        || ct.contains("pdf")
        || ct.contains("zip")
        || ct.contains("font")
        || ct.contains("protobuf")
    {
        return true;
    }

    let sample = &bytes[..bytes.len().min(1024)];
    if sample.contains(&0) {
        return true;
    }
    String::from_utf8_lossy(sample).chars().filter(|c| *c == '\u{FFFD}').count() > 2
}

fn describe_error(err: &reqwest::Error, url: &str) -> String {
    let mut head = String::from("请求失败：");
    if err.is_timeout() {
        head.push_str("超时（连接或读取超过设定时间）");
    } else if err.is_connect() {
        head.push_str("连不上目标（DNS 解析失败 / 端口不通 / 被拒绝 / 代理不可用）");
    } else if err.is_body() || err.is_decode() {
        head.push_str("响应体读取异常（压缩格式或分块传输有问题）");
    } else {
        head.push_str(&err.to_string());
    }
    format!("{head}\n目标：{url}")
}

// --------------------------- Tauri IPC 命令集合 ---------------------------

/// 人工在工作台点击发包：执行请求并自动记入当前项目 SQLite 历史
#[tauri::command]
async fn send_http_request(
    state: State<'_, Arc<AppState>>,
    input: SendRequestInput,
    raw_request_text: Option<String>,
) -> Result<HttpResponseData, String> {
    let jar = state.jar()?;
    let url = input.url.trim().to_string();
    if url.is_empty() {
        return Err("URL 为空".to_string());
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(format!("只支持 http/https，收到：{url}"));
    }

    let method = Method::from_bytes(input.method.trim().to_uppercase().as_bytes())
        .map_err(|_| format!("非法请求方法：{}", input.method))?;

    let client = build_client(&input, jar)?;
    let mut warnings: Vec<String> = Vec::new();
    let headers = build_headers(&input, &mut warnings);
    let body = decode_body(&input)?;

    let mut request = client.request(method, &url);
    if !headers.is_empty() {
        request = request.headers(headers);
    }
    if let Some(bytes) = body {
        request = request.body(bytes);
    }

    let started = Instant::now();
    let response = request.send().await.map_err(|e| describe_error(&e, &url))?;

    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let http_version = version_str(response.version()).to_string();
    let final_url = response.url().to_string();

    let mut response_headers: Vec<(String, String)> = Vec::with_capacity(response.headers().len());
    for (name, value) in response.headers().iter() {
        response_headers.push((
            name.as_str().to_string(),
            String::from_utf8_lossy(value.as_bytes()).to_string(),
        ));
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let redirect_location = response
        .headers()
        .get(LOCATION)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应体失败：{e}"))?;
    let duration_ms = started.elapsed().as_millis() as u64;
    let size = bytes.len();
    let is_binary = looks_binary(&bytes, &content_type);
    let body_text = String::from_utf8_lossy(&bytes).to_string();

    // 自动落库到当前项目 SQLite
    let raw_req = raw_request_text.unwrap_or_else(|| {
        format!("{} {} HTTP/1.1\n\n", input.method, url)
    });
    let headers_json = serde_json::to_string(&response_headers).unwrap_or_else(|_| "[]".to_string());
    
    let stripped = url.trim_start_matches("http://").trim_start_matches("https://");
    let host = stripped.split('/').next().unwrap_or("").to_string();
    let path = match stripped.find('/') {
        Some(idx) => stripped[idx..].to_string(),
        None => "/".to_string(),
    };

    let history_id = match state.active_db().insert_history(
        &input.method,
        &url,
        &host,
        &path,
        Some(status.as_u16()),
        &status_text,
        duration_ms,
        size,
        &content_type,
        &raw_req,
        &headers_json,
        &body_text,
        is_binary,
    ) {
        Ok(id) => {
            state.emit_history_updated(id);
            Some(id)
        }
        Err(e) => {
            warnings.push(format!("历史落库警告: {e}"));
            None
        }
    };

    Ok(HttpResponseData {
        status: status.as_u16(),
        status_text,
        http_version,
        headers: response_headers,
        body_text,
        body_base64: B64.encode(&bytes),
        size,
        duration_ms,
        final_url,
        is_binary,
        content_type,
        received_at: now_ms(),
        redirect_location,
        warnings,
        history_id,
    })
}

// --------------------------- 项目管理命令 ---------------------------

#[tauri::command]
fn get_current_project(state: State<'_, Arc<AppState>>) -> Result<ProjectInfo, String> {
    Ok(state.active_db().info.clone())
}

#[tauri::command]
fn open_disk_project(
    state: State<'_, Arc<AppState>>,
    path: String,
    name: Option<String>,
) -> Result<ProjectInfo, String> {
    let db = ProjectDb::open_disk(&path, name)?;
    state.switch_project(db)
}

#[tauri::command]
fn new_disk_project(
    state: State<'_, Arc<AppState>>,
    path: String,
    name: String,
) -> Result<ProjectInfo, String> {
    let db = ProjectDb::open_disk(&path, Some(name))?;
    state.switch_project(db)
}

#[tauri::command]
fn open_temp_project(state: State<'_, Arc<AppState>>) -> Result<ProjectInfo, String> {
    let db = ProjectDb::open_temp()?;
    state.switch_project(db)
}

#[tauri::command]
fn load_project_tabs(state: State<'_, Arc<AppState>>) -> Result<Vec<TabItem>, String> {
    state.active_db().load_tabs()
}

#[tauri::command]
fn save_project_tabs(
    state: State<'_, Arc<AppState>>,
    tabs: Vec<TabItem>,
) -> Result<(), String> {
    state.active_db().save_tabs(&tabs)
}

#[tauri::command]
fn query_project_history(
    state: State<'_, Arc<AppState>>,
    filter: HistoryFilter,
) -> Result<Vec<HistoryRowSummary>, String> {
    state.active_db().query_history(&filter)
}

#[tauri::command]
fn get_history_packet(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<Option<HistoryDetail>, String> {
    state.active_db().get_packet(id)
}

#[tauri::command]
fn reset_cookies(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.reset_cookies()
}

#[tauri::command]
fn save_binary_file(path: String, base64: String) -> Result<(), String> {
    let bytes = B64
        .decode(base64.as_bytes())
        .map_err(|e| format!("base64 解码失败：{e}"))?;

    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
        }
    }

    std::fs::write(&path, bytes).map_err(|e| format!("写入 {path} 失败：{e}"))
}

#[tauri::command]
fn set_window_theme(window: tauri::Window, theme: String) -> Result<(), String> {
    let dark = theme != "light";
    let _ = window.set_theme(Some(if dark {
        tauri::Theme::Dark
    } else {
        tauri::Theme::Light
    }));

    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
            DWMWA_USE_IMMERSIVE_DARK_MODE,
        };

        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let (caption, text): (u32, u32) = if dark {
            (0x001E_1E1E, 0x00D4_D4D4)
        } else {
            (0x00FB_FBFB, 0x0020_2020)
        };
        let immersive: i32 = if dark { 1 } else { 0 };
        unsafe {
            let h = hwnd.0 as isize as *mut core::ffi::c_void;
            DwmSetWindowAttribute(
                h,
                DWMWA_USE_IMMERSIVE_DARK_MODE as u32,
                &immersive as *const _ as *const _,
                std::mem::size_of::<i32>() as u32,
            );
            DwmSetWindowAttribute(
                h,
                DWMWA_CAPTION_COLOR as u32,
                &caption as *const _ as *const _,
                std::mem::size_of::<u32>() as u32,
            );
            DwmSetWindowAttribute(
                h,
                DWMWA_TEXT_COLOR as u32,
                &text as *const _ as *const _,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }

    Ok(())
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    if !target.exists() {
        return Err(format!("文件不存在：{path}"));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{path}"))
            .spawn()
            .map_err(|e| format!("调起资源管理器失败：{e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("调起 Finder 失败：{e}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    {
        let dir = target.parent().unwrap_or(target);
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("打开目录失败：{e}"))?;
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMeta {
    version: String,
    os: String,
    rest_url: String,
}

#[tauri::command]
fn app_meta(state: State<'_, Arc<AppState>>) -> AppMeta {
    let port = state.get_active_port();
    AppMeta {
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        rest_url: format!("http://127.0.0.1:{port}"),
    }
}

// --------------------------- 应用程序入口 ---------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();

    // 如果携带了 --mcp 标志，则以纯终端 stdio MCP Server 模式运行（供 Agent 挂载）
    if args.iter().any(|a| a == "--mcp") {
        let rt = tokio::runtime::Runtime::new().expect("创建 Tokio 运行时失败");
        rt.block_on(async {
            let state = Arc::new(AppState::new_with_temp().expect("初始化临时数据库失败"));
            server::run_mcp_stdio_loop(state).await;
        });
        return;
    }

    let app_state = Arc::new(AppState::new_with_temp().expect("初始化应用状态失败"));

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state.clone())
        .setup(move |app| {
            app_state.set_app_handle(app.handle().clone());

            // 启动本地后台 REST API 服务 (自适应监听 18080..=18099 防端口冲突)
            let server_state = app_state.clone();
            tauri::async_runtime::spawn(async move {
                let router = server::create_rest_router(server_state.clone());
                let mut bound = None;
                for port in 18080..=18099 {
                    if let Ok(listener) = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}")).await {
                        bound = Some((port, listener));
                        break;
                    }
                }
                if let Some((port, listener)) = bound {
                    server_state.set_active_port(port);
                    let _ = axum::serve(listener, router).await;
                }
            });

            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(600));
                    let monitor = win
                        .current_monitor()
                        .ok()
                        .flatten()
                        .or_else(|| win.primary_monitor().ok().flatten());
                    if let Some(monitor) = monitor {
                        let scale = monitor.scale_factor();
                        let size = monitor.size();
                        let avail_w = (size.width as f64 / scale) - 40.0;
                        let avail_h = (size.height as f64 / scale) - 80.0;
                        // 以 tauri.conf.json 的 1180x740 为上限：屏幕够大就用这个紧凑尺寸，
                        // 屏幕偏小才等比收缩，绝不再把窗口撑满全屏
                        let width = 1180.0_f64.min(avail_w).max(900.0);
                        let height = 740.0_f64.min(avail_h).max(560.0);
                        let _ = win.set_size(tauri::LogicalSize::new(width, height));
                        let _ = win.center();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_http_request,
            get_current_project,
            open_disk_project,
            new_disk_project,
            open_temp_project,
            load_project_tabs,
            save_project_tabs,
            query_project_history,
            get_history_packet,
            reset_cookies,
            save_binary_file,
            reveal_in_explorer,
            set_window_theme,
            app_meta
        ])
        .run(tauri::generate_context!())
        .expect("RepX 启动失败");
}
