// 全局类型：前后端契约，改字段先改这里

// 请求头/响应头统一用二元组，保证顺序和重复键（Set-Cookie 会重复出现）不丢
export type HeaderPair = [string, string];

// 发给 Rust 后端的请求体
export interface SendRequestInput {
  method: string;
  url: string;
  headers: HeaderPair[];
  body: string | null;
  bodyBase64: string | null;
  proxy: string | null;
  timeoutMs: number | null;
  followRedirects: boolean;
  httpVersion: "auto" | "http1" | "http2" | null;
}

// Rust 后端返回的响应
export interface HttpResponseData {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: HeaderPair[];
  bodyText: string;
  bodyBase64: string;
  size: number;
  durationMs: number;
  finalUrl: string;
  isBinary: boolean;
  contentType: string;
  receivedAt: number;
  redirectLocation: string | null;
  warnings: string[];
  historyId?: number;
}

// 项目元信息
export interface ProjectInfo {
  name: string;
  path: string | null;
  isTemp: boolean;
  createdAt: number;
  packetCount: number;
}

// 历史表格行摘要（对标 Burp HTTP History）
export interface HistoryRowSummary {
  id: number;
  timestamp: number;
  timeStr: string;
  method: string;
  host: string;
  path: string;
  url: string;
  status: number | null;
  statusText: string;
  durationMs: number;
  responseSize: number;
  mimeType: string;
}

// 历史流量完整详情
export interface HistoryDetail {
  id: number;
  timestamp: number;
  method: string;
  url: string;
  host: string;
  path: string;
  status: number | null;
  statusText: string;
  durationMs: number;
  responseSize: number;
  mimeType: string;
  requestRaw: string;
  responseHeaders: HeaderPair[];
  responseBodyText: string;
  isBinary: boolean;
}

// 工作台标签页数据结构
export interface TabItem {
  id: string;
  title: string;
  requestText: string;
  responseData: string | null; // JSON 字符串 (HttpResponseData)
  position: number;
  updatedAt: number;
}

// 兼容单页历史记录条目
export interface HistoryEntry {
  id: string;
  ts: number;
  method: string;
  url: string;
  status: number | null;
  durationMs: number | null;
  requestText: string;
}

// 主视图：工作台 (Repeater) / 历史流量 (History)
export type ActiveView = "repeater" | "history";

// 本地设置 请求行只写路径时，用哪个协议去拼完整 URL
export type Scheme = "https" | "http";

// 主题：暗色（VS Code 灰） / 亮色（参考图那套 IntelliJ 白）
export type Theme = "dark" | "light";

export interface AppSettings {
  proxy: string;
  timeoutMs: number;
  followRedirects: boolean;
  maxHistory: number;
  fontSize: number;
  fontFamily: string;
  defaultScheme: Scheme;
  haeEnabled: boolean;
  theme: Theme;
}

// 解析后的请求结构
export interface ParsedHttpRequest {
  method: string;
  url: string;
  httpVersion: string;
  headers: HeaderPair[];
  body: string;
}

// HaE 命中颜色：和 index.css 里的 .hae-<color> 一一对应
export type HaeColor = "red" | "orange" | "yellow" | "green" | "cyan" | "magenta" | "pink" | "gray";

// 一条 HaE 规则（字段与 Burp HaE 的 Rules.yml 对齐）
export interface HaeRule {
  group: string;
  name: string;
  regex: string;
  sRegex: string;
  format: string;
  color: HaeColor;
  scope: string;
  sensitive: boolean;
}

// 一次命中：start/end 是相对所在报文（请求或响应）全文的字符偏移
export interface HaeHit {
  rule: string;
  group: string;
  color: HaeColor;
  scope: string;
  side: "request" | "response";
  start: number;
  end: number;
  line: number;
  value: string;
  sensitive: boolean;
}
