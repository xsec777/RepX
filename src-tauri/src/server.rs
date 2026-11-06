//! RepX 双通道服务端：
//! 1. 本地轻量 REST API (127.0.0.1:18080)
//! 2. 原生 MCP stdio JSON-RPC 2.0 Server (供 AI Agent 即插即用)

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::{Path as AxPath, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use reqwest::redirect::Policy;
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tower_http::cors::CorsLayer;

use crate::db::HistoryFilter;
use crate::state::AppState;

const SAFE_TRUNCATE_LEN: usize = 2000;

#[derive(Debug, Deserialize)]
pub struct SendPacketReq {
    pub raw_http: String,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSendResponse {
    pub id: i64,
    pub status: u16,
    pub status_text: String,
    pub duration_ms: u64,
    pub length: usize,
    pub headers: Vec<(String, String)>,
    pub body_preview: String,
    pub is_truncated: bool,
    pub note: String,
}

// 解析 Burp 原始 HTTP 报文字符串
pub fn parse_raw_http(raw: &str) -> Result<(String, String, String, String, Vec<(String, String)>, Option<Vec<u8>>), String> {
    let normalized = raw.replace("\r\n", "\n");
    let (head, body_str) = match normalized.find("\n\n") {
        Some(idx) => (&normalized[..idx], &normalized[idx + 2..]),
        None => (normalized.as_str(), ""),
    };

    let mut lines = head.lines();
    let first_line = lines.next().ok_or("报文为空")?.trim();
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.is_empty() {
        return Err("首行无效".to_string());
    }

    let method = parts[0].to_uppercase();
    let target = if parts.len() > 1 { parts[1] } else { "/" };

    let mut headers = Vec::new();
    let mut host_header: Option<String> = None;

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim().to_string();
            let val = v.trim().to_string();
            if key.eq_ignore_ascii_case("host") {
                host_header = Some(val.clone());
            }
            headers.push((key, val));
        }
    }

    // 拼出完整 URL (边界健壮性优化：兼顾路径、查询参和端口协议推导)
    let (url, host, path) = if target.starts_with("http://") || target.starts_with("https://") {
        let u = target.to_string();
        let stripped = u.trim_start_matches("http://").trim_start_matches("https://");
        let h = stripped.split(|c| c == '/' || c == '?' || c == '#').next().unwrap_or("").to_string();
        let p = match stripped.find(|c| c == '/' || c == '?' || c == '#') {
            Some(idx) => stripped[idx..].to_string(),
            None => "/".to_string(),
        };
        (u, h, p)
    } else {
        let h = host_header.clone().unwrap_or_else(|| "127.0.0.1".to_string());
        // 端口协议判定：显式带非443端口(如 :80, :8080)用 http，无端口或 443/8443 默认用 https
        let scheme = if h.ends_with(":443") || h.ends_with(":8443") || !h.contains(':') {
            "https"
        } else {
            "http"
        };
        let p = if target.starts_with('/') { target.to_string() } else { format!("/{target}") };
        let u = format!("{scheme}://{h}{p}");
        (u, h, p)
    };

    let body_bytes = if !body_str.is_empty() {
        Some(body_str.as_bytes().to_vec())
    } else {
        None
    };

    Ok((method, url, host, path, headers, body_bytes))
}

// 统一执行发包并全量持久化入库
pub async fn execute_raw_packet(
    state: &AppState,
    raw_http: &str,
    timeout_ms: Option<u64>,
) -> Result<AiSendResponse, String> {
    let (method_str, url, host, path, headers, body_bytes) = parse_raw_http(raw_http)?;
    let jar = state.jar()?;
    let timeout = timeout_ms.unwrap_or(30_000).clamp(1_000, 300_000);

    let client = Client::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .cookie_provider(jar)
        .timeout(Duration::from_millis(timeout))
        .connect_timeout(Duration::from_secs(15))
        .pool_max_idle_per_host(0)
        .redirect(Policy::none())
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {e}"))?;

    let method = Method::from_bytes(method_str.as_bytes()).map_err(|_| "非法请求方法")?;
    let mut header_map = HeaderMap::new();

    for (k, v) in &headers {
        let lower = k.to_ascii_lowercase();
        if matches!(lower.as_str(), "content-length" | "transfer-encoding" | "connection") {
            continue;
        }
        if let (Ok(hk), Ok(hv)) = (HeaderName::from_bytes(k.as_bytes()), HeaderValue::from_bytes(v.trim().as_bytes())) {
            header_map.append(hk, hv);
        }
    }

    let mut req_builder = client.request(method, &url).headers(header_map);
    if let Some(bytes) = body_bytes {
        req_builder = req_builder.body(bytes);
    }

    let started = Instant::now();
    let resp = req_builder.send().await.map_err(|e| format!("发包失败: {e}"))?;

    let status = resp.status().as_u16();
    let status_text = resp.status().canonical_reason().unwrap_or("").to_string();
    let duration_ms = started.elapsed().as_millis() as u64;

    let mut resp_headers = Vec::new();
    for (name, val) in resp.headers().iter() {
        resp_headers.push((name.as_str().to_string(), String::from_utf8_lossy(val.as_bytes()).to_string()));
    }

    let mime_type = resp
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| format!("接收响应体失败: {e}"))?;
    let total_len = bytes.len();
    let body_text = String::from_utf8_lossy(&bytes).to_string();

    let is_truncated = body_text.len() > SAFE_TRUNCATE_LEN;
    let body_preview = if is_truncated {
        format!(
            "{}\n\n... [截断: 显示前 2000 / {} 字节，完整数据已全量落库]",
            &body_text[..SAFE_TRUNCATE_LEN],
            total_len
        )
    } else {
        body_text.clone()
    };

    // 写入当前活跃项目数据库
    let headers_json = serde_json::to_string(&resp_headers).unwrap_or_else(|_| "[]".to_string());
    let db = state.active_db();
    let history_id = db.insert_history(
        &method_str,
        &url,
        &host,
        &path,
        Some(status),
        &status_text,
        duration_ms,
        total_len,
        &mime_type,
        raw_http,
        &headers_json,
        &body_text,
        false,
    )?;

    // 广播事件通知桌面端 UI 刷新
    state.emit_history_updated(history_id);

    Ok(AiSendResponse {
        id: history_id,
        status,
        status_text,
        duration_ms,
        length: total_len,
        headers: resp_headers,
        body_preview,
        is_truncated,
        note: format!("已成功存入当前项目 (ID: #{history_id})"),
    })
}

// --------------------------- 本地 REST API 路由 ---------------------------

pub fn create_rest_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/packet/send", post(rest_send_packet))
        .route("/api/history", get(rest_get_history))
        .route("/api/packet/:id", get(rest_get_packet))
        .route("/api/packet/:id/body", get(rest_get_packet_body))
        .route("/api/project/status", get(rest_project_status))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn rest_send_packet(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SendPacketReq>,
) -> Result<Json<AiSendResponse>, (StatusCode, String)> {
    match execute_raw_packet(&state, &payload.raw_http, payload.timeout_ms).await {
        Ok(res) => Ok(Json(res)),
        Err(e) => Err((StatusCode::BAD_REQUEST, e)),
    }
}

async fn rest_get_history(
    State(state): State<Arc<AppState>>,
    Query(filter): Query<HistoryFilter>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state.active_db();
    match db.query_history(&filter) {
        Ok(rows) => Ok(Json(json!({ "total": rows.len(), "items": rows }))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

async fn rest_get_packet(
    State(state): State<Arc<AppState>>,
    AxPath(id): AxPath<i64>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state.active_db();
    match db.get_packet(id) {
        Ok(Some(item)) => Ok(Json(json!(item))),
        Ok(None) => Err((StatusCode::NOT_FOUND, format!("未找到 ID 为 #{id} 的报文"))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

#[derive(Debug, Deserialize)]
pub struct BodySliceQuery {
    pub offset: Option<usize>,
    pub limit: Option<usize>,
    pub search: Option<String>,
}

async fn rest_get_packet_body(
    State(state): State<Arc<AppState>>,
    AxPath(id): AxPath<i64>,
    Query(q): Query<BodySliceQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let db = state.active_db();
    let offset = q.offset.unwrap_or(0);
    let limit = q.limit.unwrap_or(2000).min(50000);
    match db.get_packet_body_slice(id, offset, limit, q.search.as_deref()) {
        Ok(Some(res)) => Ok(Json(json!(res))),
        Ok(None) => Err((StatusCode::NOT_FOUND, format!("未找到 ID 为 #{id} 的报文"))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e)),
    }
}

async fn rest_project_status(State(state): State<Arc<AppState>>) -> Json<Value> {
    let db = state.active_db();
    Json(json!({
        "project": db.info,
    }))
}

// --------------------------- 原生 MCP stdio 协议处理 ---------------------------

pub async fn run_mcp_stdio_loop(state: Arc<AppState>) {
    let stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();
    let reader = BufReader::new(stdin);
    let mut lines = reader.lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parsed: Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let id = parsed.get("id").cloned();
        let method = parsed.get("method").and_then(|m| m.as_str()).unwrap_or("");

        let response = match method {
            "initialize" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {}
                    },
                    "serverInfo": {
                        "name": "repx-mcp",
                        "version": "1.0.0"
                    }
                }
            }),
            "notifications/initialized" => continue,
            "ping" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {}
            }),
            "tools/list" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "tools": [
                        {
                            "name": "repx_send_packet",
                            "description": "通过 RepX 发送原始 HTTP 报文，自动全量存入当前活跃项目并返回安全截断摘要",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "raw_http": {
                                        "type": "string",
                                        "description": "标准的 Burp 原始 HTTP 报文字符串 (例: POST /api/user HTTP/1.1\\nHost: xxx\\n...)"
                                    },
                                    "timeout_ms": {
                                        "type": "number",
                                        "description": "超时毫秒数 (默认 30000)"
                                    }
                                },
                                "required": ["raw_http"]
                            }
                        },
                        {
                            "name": "repx_get_history",
                            "description": "调阅当前项目的 HTTP 流量历史列表 (精简元数据，极低 Token 消耗)",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "limit": { "type": "number", "description": "返回条数限制 (默认 20)" },
                                    "offset": { "type": "number", "description": "偏移起始位置" },
                                    "host": { "type": "string", "description": "按 Host 主机过滤" },
                                    "status": { "type": "number", "description": "按状态码过滤" },
                                    "search": { "type": "string", "description": "搜索关键字" }
                                }
                            }
                        },
                        {
                            "name": "repx_get_packet",
                            "description": "获取指定流量包的完整原始请求报文与响应元数据",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "id": { "type": "number", "description": "流量包序号 ID" }
                                },
                                "required": ["id"]
                            }
                        },
                        {
                            "name": "repx_get_packet_body",
                            "description": "按需切片调阅大响应体或搜索超长回显中的特定关键字",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "id": { "type": "number", "description": "流量包序号 ID" },
                                    "offset": { "type": "number", "description": "字符偏移量 (默认 0)" },
                                    "limit": { "type": "number", "description": "切片长度 (默认 2000)" },
                                    "search": { "type": "string", "description": "搜索关键词" }
                                },
                                "required": ["id"]
                            }
                        }
                    ]
                }
            }),
            "tools/call" => {
                let params = parsed.get("params");
                let tool_name = params.and_then(|p| p.get("name")).and_then(|n| n.as_str()).unwrap_or("");
                let args = params.and_then(|p| p.get("arguments")).cloned().unwrap_or(json!({}));

                let tool_result = handle_mcp_tool_call(&state, tool_name, &args).await;
                match tool_result {
                    Ok(val) => json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": serde_json::to_string_pretty(&val).unwrap_or_default()
                                }
                            ]
                        }
                    }),
                    Err(err) => json!({
                        "jsonrpc": "2.0",
                        "id": id,
                        "result": {
                            "isError": true,
                            "content": [
                                {
                                    "type": "text",
                                    "text": format!("执行失败: {err}")
                                }
                            ]
                        }
                    }),
                }
            },
            _ => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": {
                    "code": -32601,
                    "message": "Method not found"
                }
            }),
        };

        let mut out_str = serde_json::to_string(&response).unwrap_or_default();
        out_str.push('\n');
        let _ = stdout.write_all(out_str.as_bytes()).await;
        let _ = stdout.flush().await;
    }
}

async fn handle_mcp_tool_call(state: &AppState, name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "repx_send_packet" => {
            let raw_http = args.get("raw_http").and_then(|v| v.as_str()).ok_or("缺少 raw_http 参数")?;
            let timeout_ms = args.get("timeout_ms").and_then(|v| v.as_u64());
            let res = execute_raw_packet(state, raw_http, timeout_ms).await?;
            Ok(json!(res))
        }
        "repx_get_history" => {
            let filter = HistoryFilter {
                limit: args.get("limit").and_then(|v| v.as_u64()).map(|n| n as u32),
                offset: args.get("offset").and_then(|v| v.as_u64()).map(|n| n as u32),
                host: args.get("host").and_then(|v| v.as_str()).map(|s| s.to_string()),
                status: args.get("status").and_then(|v| v.as_u64()).map(|n| n as u16),
                path_keyword: None,
                search: args.get("search").and_then(|v| v.as_str()).map(|s| s.to_string()),
            };
            let rows = state.active_db().query_history(&filter)?;
            Ok(json!({
                "total": rows.len(),
                "history": rows
            }))
        }
        "repx_get_packet" => {
            let id = args.get("id").and_then(|v| v.as_i64()).ok_or("缺少 id 参数")?;
            let packet = state.active_db().get_packet(id)?.ok_or_else(|| format!("未找到 ID 为 #{id} 的报文"))?;
            Ok(json!(packet))
        }
        "repx_get_packet_body" => {
            let id = args.get("id").and_then(|v| v.as_i64()).ok_or("缺少 id 参数")?;
            let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
            let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(2000) as usize;
            let search = args.get("search").and_then(|v| v.as_str());
            let slice = state.active_db().get_packet_body_slice(id, offset, limit, search)?.ok_or_else(|| format!("未找到 ID 为 #{id} 的报文"))?;
            Ok(json!(slice))
        }
        _ => Err(format!("未知工具: {name}")),
    }
}
