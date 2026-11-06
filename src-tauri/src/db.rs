//! RepX SQLite 数据库引擎：管理单项目物理隔离文件 (.repx / .db)
//! 包含 history (全量 HTTP 流量池) 与 tabs (Repeater 工作台标签页)

use std::path::Path;
use std::sync::{Arc, Mutex};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub name: String,
    pub path: Option<String>,
    pub is_temp: bool,
    pub created_at: u64,
    pub packet_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryRowSummary {
    pub id: i64,
    pub timestamp: u64,
    pub time_str: String,
    pub method: String,
    pub host: String,
    pub path: String,
    pub url: String,
    pub status: Option<u16>,
    pub status_text: String,
    pub duration_ms: u64,
    pub response_size: usize,
    pub mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryDetail {
    pub id: i64,
    pub timestamp: u64,
    pub method: String,
    pub url: String,
    pub host: String,
    pub path: String,
    pub status: Option<u16>,
    pub status_text: String,
    pub duration_ms: u64,
    pub response_size: usize,
    pub mime_type: String,
    pub request_raw: String,
    pub response_headers: Vec<(String, String)>,
    pub response_body_text: String,
    pub is_binary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BodySliceResult {
    pub id: i64,
    pub total_size: usize,
    pub offset: usize,
    pub length: usize,
    pub content: String,
    pub is_truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabItem {
    pub id: String,
    pub title: String,
    pub request_text: String,
    pub response_data: Option<String>, // JSON 格式的 HttpResponseData
    pub position: i32,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryFilter {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub host: Option<String>,
    pub status: Option<u16>,
    pub path_keyword: Option<String>,
    pub search: Option<String>,
}

pub struct ProjectDb {
    conn: Arc<Mutex<Connection>>,
    pub info: ProjectInfo,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn format_time(ts_ms: u64) -> String {
    let secs = (ts_ms / 1000) as i64;
    let naive = chrono_naive_time(secs);
    naive
}

// 极简时间格式化（HH:MM:SS）
fn chrono_naive_time(epoch_secs: i64) -> String {
    let day_secs = (epoch_secs % 86400 + 86400) % 86400;
    // 简易东八区 UTC+8 计算
    let local_secs = (day_secs + 8 * 3600) % 86400;
    let h = local_secs / 3600;
    let m = (local_secs % 3600) / 60;
    let s = local_secs % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

impl ProjectDb {
    /// 新建或打开磁盘项目文件
    pub fn open_disk<P: AsRef<Path>>(path: P, name: Option<String>) -> Result<Self, String> {
        let p = path.as_ref();
        if let Some(parent) = p.parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
            }
        }

        let conn = Connection::open(p).map_err(|e| format!("打开项目数据库失败: {e}"))?;
        let db = Self::init_schema(conn, Some(p.to_string_lossy().to_string()), name, false)?;
        Ok(db)
    }

    /// 新建临时内存项目
    pub fn open_temp() -> Result<Self, String> {
        let temp_dir = std::env::temp_dir();
        let temp_file = temp_dir.join(format!("repx_temp_{}.repx", now_ms()));
        let conn = Connection::open(&temp_file).map_err(|e| format!("创建临时数据库失败: {e}"))?;
        let db = Self::init_schema(
            conn,
            Some(temp_file.to_string_lossy().to_string()),
            Some("临时项目".to_string()),
            true,
        )?;
        Ok(db)
    }

    fn init_schema(
        conn: Connection,
        path: Option<String>,
        name_override: Option<String>,
        is_temp: bool,
    ) -> Result<Self, String> {
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA temp_store = MEMORY;

            CREATE TABLE IF NOT EXISTS project_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                method TEXT NOT NULL,
                url TEXT NOT NULL,
                host TEXT NOT NULL,
                path TEXT NOT NULL,
                status INTEGER,
                status_text TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                response_size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                request_raw TEXT NOT NULL,
                response_headers TEXT NOT NULL,
                response_body_text TEXT NOT NULL,
                is_binary INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_history_host ON history(host);
            CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);

            CREATE TABLE IF NOT EXISTS tabs (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                request_text TEXT NOT NULL,
                response_data TEXT,
                position INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );
            "#,
        )
        .map_err(|e| format!("初始化表结构失败: {e}"))?;

        // 读或写项目元信息
        let name: String = if let Some(n) = name_override {
            let _ = conn.execute(
                "INSERT INTO project_meta(key, value) VALUES('name', ?1) ON CONFLICT(key) DO UPDATE SET value=?1",
                params![&n],
            );
            n
        } else {
            conn.query_row(
                "SELECT value FROM project_meta WHERE key='name'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "默认项目".to_string())
        };

        let created_at: u64 = conn
            .query_row(
                "SELECT value FROM project_meta WHERE key='created_at'",
                [],
                |row| {
                    let s: String = row.get(0)?;
                    Ok(s.parse::<u64>().unwrap_or_else(|_| now_ms()))
                },
            )
            .unwrap_or_else(|_| {
                let now = now_ms();
                let _ = conn.execute(
                    "INSERT INTO project_meta(key, value) VALUES('created_at', ?1)",
                    params![now.to_string()],
                );
                now
            });

        let packet_count: u64 = conn
            .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
            .unwrap_or(0);

        let info = ProjectInfo {
            name,
            path,
            is_temp,
            created_at,
            packet_count,
        };

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            info,
        })
    }

    /// 插入一条完整的网络流量记录
    pub fn insert_history(
        &self,
        method: &str,
        url: &str,
        host: &str,
        path: &str,
        status: Option<u16>,
        status_text: &str,
        duration_ms: u64,
        response_size: usize,
        mime_type: &str,
        request_raw: &str,
        response_headers_json: &str,
        response_body_text: &str,
        is_binary: bool,
    ) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let ts = now_ms();

        conn.execute(
            r#"
            INSERT INTO history (
                timestamp, method, url, host, path, status, status_text,
                duration_ms, response_size, mime_type, request_raw,
                response_headers, response_body_text, is_binary
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            "#,
            params![
                ts,
                method,
                url,
                host,
                path,
                status.map(|s| s as i64),
                status_text,
                duration_ms as i64,
                response_size as i64,
                mime_type,
                request_raw,
                response_headers_json,
                response_body_text,
                if is_binary { 1 } else { 0 },
            ],
        )
        .map_err(|e| format!("插入流量历史失败: {e}"))?;

        let id = conn.last_insert_rowid();
        Ok(id)
    }

    /// 查询历史流量列表（用于前端表格与 AI 检索）
    pub fn query_history(&self, filter: &HistoryFilter) -> Result<Vec<HistoryRowSummary>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut sql = String::from(
            "SELECT id, timestamp, method, host, path, url, status, status_text, duration_ms, response_size, mime_type FROM history WHERE 1=1"
        );
        let mut conditions = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(h) = &filter.host {
            if !h.trim().is_empty() {
                conditions.push("host LIKE ?");
                param_values.push(Box::new(format!("%{}%", h.trim())));
            }
        }
        if let Some(s) = filter.status {
            conditions.push("status = ?");
            param_values.push(Box::new(s as i64));
        }
        if let Some(p) = &filter.path_keyword {
            if !p.trim().is_empty() {
                conditions.push("path LIKE ?");
                param_values.push(Box::new(format!("%{}%", p.trim())));
            }
        }
        if let Some(kw) = &filter.search {
            if !kw.trim().is_empty() {
                conditions.push("(url LIKE ? OR method LIKE ? OR mime_type LIKE ?)");
                let pattern = format!("%{}%", kw.trim());
                param_values.push(Box::new(pattern.clone()));
                param_values.push(Box::new(pattern.clone()));
                param_values.push(Box::new(pattern));
            }
        }

        for cond in conditions {
            sql.push_str(" AND ");
            sql.push_str(cond);
        }

        sql.push_str(" ORDER BY id ASC");

        let limit = filter.limit.unwrap_or(200).min(1000);
        sql.push_str(&format!(" LIMIT {}", limit));

        if let Some(offset) = filter.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let params_slice: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|b| &**b).collect();

        let rows = stmt
            .query_map(&params_slice[..], |row| {
                let id: i64 = row.get(0)?;
                let ts: u64 = row.get(1)?;
                let method: String = row.get(2)?;
                let host: String = row.get(3)?;
                let path: String = row.get(4)?;
                let url: String = row.get(5)?;
                let status_raw: Option<i64> = row.get(6)?;
                let status_text: String = row.get(7)?;
                let duration_ms: i64 = row.get(8)?;
                let response_size: i64 = row.get(9)?;
                let mime_type: String = row.get(10)?;

                Ok(HistoryRowSummary {
                    id,
                    timestamp: ts,
                    time_str: format_time(ts),
                    method,
                    host,
                    path,
                    url,
                    status: status_raw.map(|s| s as u16),
                    status_text,
                    duration_ms: duration_ms as u64,
                    response_size: response_size as usize,
                    mime_type,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut results = Vec::new();
        for r in rows {
            if let Ok(item) = r {
                results.push(item);
            }
        }

        Ok(results)
    }

    /// 获取单条流量详情
    pub fn get_packet(&self, id: i64) -> Result<Option<HistoryDetail>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, timestamp, method, url, host, path, status, status_text,
                       duration_ms, response_size, mime_type, request_raw,
                       response_headers, response_body_text, is_binary
                FROM history WHERE id = ?1
                "#,
            )
            .map_err(|e| e.to_string())?;

        let res = stmt
            .query_row(params![id], |row| {
                let id: i64 = row.get(0)?;
                let timestamp: u64 = row.get(1)?;
                let method: String = row.get(2)?;
                let url: String = row.get(3)?;
                let host: String = row.get(4)?;
                let path: String = row.get(5)?;
                let status_raw: Option<i64> = row.get(6)?;
                let status_text: String = row.get(7)?;
                let duration_ms: i64 = row.get(8)?;
                let response_size: i64 = row.get(9)?;
                let mime_type: String = row.get(10)?;
                let request_raw: String = row.get(11)?;
                let response_headers_json: String = row.get(12)?;
                let response_body_text: String = row.get(13)?;
                let is_binary: i64 = row.get(14)?;

                let headers: Vec<(String, String)> =
                    serde_json::from_str(&response_headers_json).unwrap_or_default();

                Ok(HistoryDetail {
                    id,
                    timestamp,
                    method,
                    url,
                    host,
                    path,
                    status: status_raw.map(|s| s as u16),
                    status_text,
                    duration_ms: duration_ms as u64,
                    response_size: response_size as usize,
                    mime_type,
                    request_raw,
                    response_headers: headers,
                    response_body_text,
                    is_binary: is_binary != 0,
                })
            })
            .optional()
            .map_err(|e| e.to_string())?;

        Ok(res)
    }

    /// 获取响应体切片（用于 AI 深度调阅大报文）
    pub fn get_packet_body_slice(
        &self,
        id: i64,
        offset: usize,
        limit: usize,
        search_kw: Option<&str>,
    ) -> Result<Option<BodySliceResult>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let res: Option<(String, usize)> = conn
            .query_row(
                "SELECT response_body_text, response_size FROM history WHERE id = ?1",
                params![id],
                |row| {
                    let text: String = row.get(0)?;
                    let size: i64 = row.get(1)?;
                    Ok((text, size as usize))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let (body, total_size) = match res {
            Some(pair) => pair,
            None => return Ok(None),
        };

        let (final_offset, slice_len, content, is_truncated) = if let Some(kw) = search_kw {
            if let Some(pos) = body.to_lowercase().find(&kw.to_lowercase()) {
                let start = pos.saturating_sub(200);
                let end = (start + limit).min(body.len());
                let slice = &body[start..end];
                (start, slice.len(), slice.to_string(), end < body.len())
            } else {
                (0, 0, format!("未在响应体中找到关键词: {kw}"), false)
            }
        } else {
            let start = offset.min(body.len());
            let end = (start + limit).min(body.len());
            let slice = &body[start..end];
            (start, slice.len(), slice.to_string(), end < body.len())
        };

        Ok(Some(BodySliceResult {
            id,
            total_size,
            offset: final_offset,
            length: slice_len,
            content,
            is_truncated,
        }))
    }

    /// 加载工作台所有 Tab
    pub fn load_tabs(&self) -> Result<Vec<TabItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, title, request_text, response_data, position, updated_at FROM tabs ORDER BY position ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(TabItem {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    request_text: row.get(2)?,
                    response_data: row.get(3)?,
                    position: row.get(4)?,
                    updated_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut tabs = Vec::new();
        for r in rows {
            if let Ok(t) = r {
                tabs.push(t);
            }
        }
        Ok(tabs)
    }

    /// 批量保存工作台 Tabs（全量同步）
    pub fn save_tabs(&self, tabs: &[TabItem]) -> Result<(), String> {
        if tabs.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        tx.execute("DELETE FROM tabs", []).map_err(|e| e.to_string())?;

        {
            let mut stmt = tx
                .prepare(
                    r#"
                    INSERT INTO tabs (id, title, request_text, response_data, position, updated_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                    "#,
                )
                .map_err(|e| e.to_string())?;

            for (idx, tab) in tabs.iter().enumerate() {
                stmt.execute(params![
                    &tab.id,
                    &tab.title,
                    &tab.request_text,
                    &tab.response_data,
                    idx as i32,
                    now_ms(),
                ])
                .map_err(|e| e.to_string())?;
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }
}
