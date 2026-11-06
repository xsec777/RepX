// Rust 侧命令的封装：HTTP 发包、SQLite 项目持久化与历史查询
import { invoke } from "@tauri-apps/api/core";
import type {
  HistoryDetail,
  HistoryRowSummary,
  HttpResponseData,
  ProjectInfo,
  SendRequestInput,
  TabItem,
} from "../types";

export interface HistoryFilterQuery {
  limit?: number;
  offset?: number;
  host?: string;
  status?: number;
  pathKeyword?: string;
  search?: string;
}

// 发送 HTTP 请求并自动全量落库项目 SQLite
export function sendHttpRequest(
  input: SendRequestInput,
  rawRequestText?: string
): Promise<HttpResponseData> {
  return invoke<HttpResponseData>("send_http_request", {
    input,
    rawRequestText: rawRequestText || null,
  });
}

// 获取当前活动项目元信息
export function getCurrentProject(): Promise<ProjectInfo> {
  return invoke<ProjectInfo>("get_current_project");
}

// 打开已有磁盘项目 (.repx / .db)
export function openDiskProject(path: string, name?: string): Promise<ProjectInfo> {
  return invoke<ProjectInfo>("open_disk_project", { path, name: name || null });
}

// 新建磁盘项目
export function newDiskProject(path: string, name: string): Promise<ProjectInfo> {
  return invoke<ProjectInfo>("new_disk_project", { path, name });
}

// 打开临时项目
export function openTempProject(): Promise<ProjectInfo> {
  return invoke<ProjectInfo>("open_temp_project");
}

// 加载工作台所有 Tabs
export function loadProjectTabs(): Promise<TabItem[]> {
  return invoke<TabItem[]>("load_project_tabs");
}

// 批量保存工作台 Tabs
export function saveProjectTabs(tabs: TabItem[]): Promise<void> {
  return invoke<void>("save_project_tabs", { tabs });
}

// 查询历史流量列表（供 Burp 风格大表格使用）
export function queryProjectHistory(
  filter: HistoryFilterQuery
): Promise<HistoryRowSummary[]> {
  return invoke<HistoryRowSummary[]>("query_project_history", { filter });
}

// 调阅单条历史包完整详情
export function getHistoryPacket(id: number): Promise<HistoryDetail | null> {
  return invoke<HistoryDetail | null>("get_history_packet", { id });
}

// 清空 Cookie Jar
export function resetCookies(): Promise<void> {
  return invoke<void>("reset_cookies");
}

// 把 base64 写成本地文件
export function saveBinaryFile(path: string, base64: string): Promise<void> {
  return invoke<void>("save_binary_file", { path, base64 });
}

// 打开资源管理器并选中刚保存的文件
export function revealInExplorer(path: string): Promise<void> {
  return invoke<void>("reveal_in_explorer", { path });
}

export interface AppMeta {
  version: string;
  os: string;
  restUrl: string;
}

export function appMeta(): Promise<AppMeta> {
  return invoke<AppMeta>("app_meta");
}
