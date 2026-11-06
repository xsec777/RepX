// 原始 HTTP 报文与结构化对象互转，编辑器里就是一份可改的原文
import type { HeaderPair, HttpResponseData, ParsedHttpRequest, Scheme } from "../types";

// 模板就按 Burp 的写法：请求行只写路径，主机放 Host 头，发出去之前才拼完整 URL
export const DEFAULT_REQUEST_TEXT = [
  "GET / HTTP/1.1",
  "Host: example.com",
  "User-Agent: RepX/1.0",
  "Accept: */*",
  "Accept-Encoding: gzip, deflate",
  "",
  "",
].join("\n");

// 首行：METHOD URL[ HTTP/x.y]
const REQUEST_LINE_RE = /^([A-Za-z]+)\s+(\S+?)(?:\s+(HTTP\/[\d.]+))?\s*$/;

// 用第一个空行切头和体，body 内部的空行不会被误伤
function splitHeadBody(raw: string): { head: string; body: string } {
  const text = raw.replace(/\r\n/g, "\n");
  const idx = text.indexOf("\n\n");
  if (idx === -1) return { head: text, body: "" };
  return { head: text.slice(0, idx), body: text.slice(idx + 2) };
}

export function parseRequestText(raw: string): ParsedHttpRequest {
  const { head, body } = splitHeadBody(raw);
  const lines = head.split("\n");

  let method = "GET";
  let url = "";
  let httpVersion = "HTTP/1.1";

  if (lines.length > 0) {
    const m = REQUEST_LINE_RE.exec(lines[0].trim());
    if (m) {
      method = m[1].toUpperCase();
      url = m[2];
      httpVersion = m[3] ?? "HTTP/1.1";
    } else if (lines[0].trim()) {
      // 第一行不合法就当成裸 URL 处理，别直接报错，方便粘贴
      url = lines[0].trim();
    }
  }

  const headers: HeaderPair[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    // 折行（obsolete line folding）接到上一个头后面
    if (/^[ \t]/.test(line) && headers.length > 0) {
      headers[headers.length - 1][1] += " " + line.trim();
      continue;
    }
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const name = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (name) headers.push([name, value]);
  }

  return { method, url, httpVersion, headers, body };
}

// 只改首行的方法，其余原样保留（包括缩进和空行）
export function setRequestMethod(raw: string, method: string): string {
  const text = raw.replace(/\r\n/g, "\n");
  const nl = text.indexOf("\n");
  const first = nl === -1 ? text : text.slice(0, nl);
  const rest = nl === -1 ? "" : text.slice(nl);
  const m = REQUEST_LINE_RE.exec(first.trim());
  const url = m ? m[2] : first.replace(/^[A-Za-z]+\s+/, "").trim();
  return `${method.toUpperCase()} ${url} HTTP/1.1${rest}`;
}

// 这些方法默认带体，切过来时自动补一个 Content-Type，省得每次手敲
const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// 补的默认值跟浏览器表单一致，改起来最省事
export const DEFAULT_CONTENT_TYPE = "application/x-www-form-urlencoded";

// 切换请求方法时补齐默认头： 从 GET 改成 POST/PUT/PATCH 且没有
export function ensureMethodDefaults(raw: string, method: string): string {
  const upper = method.toUpperCase();
  const text = raw.replace(/\r\n/g, "\n");
  const { head, body } = splitHeadBody(text);
  const lines = head.split("\n");

  if (!BODY_METHODS.has(upper)) return text;
  if (lines.slice(1).some((line) => /^content-type\s*:/i.test(line))) return text;

  lines.push(`Content-Type: ${DEFAULT_CONTENT_TYPE}`);
  return `${lines.join("\n")}\n\n${body}`;
}

// 结构化响应还原成一整份响应报文，Raw 视图和 HaE 都基于它
export function buildResponseText(res: HttpResponseData): string {
  const statusLine = `${res.httpVersion} ${res.status} ${res.statusText}`.trim();
  const lines = [statusLine];
  for (const [name, value] of res.headers) lines.push(`${name}: ${value}`);
  return `${lines.join("\n")}\n\n${res.bodyText}`;
}

// 只改首行的 URL
export function setRequestUrl(raw: string, url: string): string {
  const text = raw.replace(/\r\n/g, "\n");
  const nl = text.indexOf("\n");
  const first = nl === -1 ? text : text.slice(0, nl);
  const rest = nl === -1 ? "" : text.slice(nl);
  const m = REQUEST_LINE_RE.exec(first.trim());
  const method = m ? m[1].toUpperCase() : "GET";
  const version = m?.[3] ?? "HTTP/1.1";
  return `${method} ${url} ${version}${rest}`;
}

// 从请求头里取某个值（大小写不敏感）
export function headerValue(headers: HeaderPair[], name: string): string {
  const target = name.toLowerCase();
  const hit = headers.find(([k]) => k.toLowerCase() === target);
  return hit ? hit[1] : "";
}

// Host 头里带端口时按端口猜协议：80 → http，443 → https，其余听设置的
function schemeOfHost(host: string, fallback: Scheme): Scheme {
  const trimmed = host.trim();
  const lastColon = trimmed.lastIndexOf(":");
  const lastBracket = trimmed.lastIndexOf("]");
  if (lastColon <= lastBracket) return fallback; // 没有端口，或是 [::1] 这种
  const port = trimmed.slice(lastColon + 1);
  if (port === "80") return "http";
  if (port === "443") return "https";
  return fallback;
}

// 请求行只写路径（Burp 里复制出来的包都是这样）+ Host 头 → 绝对 URL
export function toAbsoluteUrl(url: string, headers: HeaderPair[], defaultScheme: Scheme = "https"): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  const host = headerValue(headers, "Host").trim();
  if (!host) return url;
  const scheme = schemeOfHost(host, defaultScheme);
  return `${scheme}://${host}${url.startsWith("/") ? url : `/${url}`}`;
}

// 把绝对 URL 拆成 协议 / 主机 / 路径
export function splitAbsoluteUrl(url: string): { scheme: Scheme; host: string; path: string } | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)(.*)$/i.exec(url.trim());
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  if (scheme !== "http" && scheme !== "https") return null;
  const host = m[2];
  if (!host) return null;
  let path = m[3] || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  return { scheme, host, path };
}

// 地址栏里直接贴 host/path（没写协议）也能认：example.com:8080/api
export function looksLikeBareHost(url: string): boolean {
  const text = url.trim();
  if (!text || text.startsWith("/") || text.includes("://")) return false;
  return /^[A-Za-z0-9._-]+(\.[A-Za-z0-9._-]+)+(?::\d+)?(?:[/?#].*)?$/.test(text);
}

// 插入或改写 Host 头（地址栏改动时同步用，保证报文和地址栏说的是同一个主机）
export function upsertHostHeader(raw: string, host: string): string {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (lines.length === 0 || !host) return raw;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) break; // 空行 = 头结束
    const sep = lines[i].indexOf(":");
    if (sep === -1) continue;
    if (lines[i].slice(0, sep).trim().toLowerCase() === "host") {
      lines[i] = `Host: ${host}`;
      return lines.join("\n");
    }
  }
  lines.splice(1, 0, `Host: ${host}`);
  return lines.join("\n");
}

// 从 URL 里取 host，用于界面展示
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^[a-z]+:\/\//i, "").split("/")[0] || url;
  }
}

// 只取 path
export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

// 响应头数组 → 可读文本
export function headersToText(headers: HeaderPair[], statusLine?: string): string {
  const lines: string[] = [];
  if (statusLine) lines.push(statusLine);
  for (const [name, value] of headers) lines.push(`${name}: ${value}`);
  return lines.join("\n");
}

// 由结构化请求生成 curl，方便贴到报告里复现
export function toCurl(req: ParsedHttpRequest): string {
  const parts = [`curl -i -k -X ${req.method} '${req.url}'`];
  for (const [name, value] of req.headers) {
    parts.push(`  -H '${name}: ${value.replace(/'/g, "'\\''")}'`);
  }
  if (req.body.trim()) {
    parts.push(`  --data-raw '${req.body.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(" \\\n");
}
