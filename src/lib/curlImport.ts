// cURL 导入：把一段 curl 命令拆成 方法 / URL / 头 / Body
import type { HeaderPair } from "../types";

export interface CurlParseResult {
  method: string;
  url: string;
  headers: HeaderPair[];
  body: string | null;
}

// 认参数时用的：哪些开关后面一定跟着一个值
const VALUE_FLAGS = new Set([
  "-X",
  "--request",
  "-H",
  "--header",
  "-d",
  "--data",
  "--data-raw",
  "--data-binary",
  "--data-ascii",
  "--data-urlencode",
  "-b",
  "--cookie",
  "-A",
  "--user-agent",
  "-e",
  "--referer",
  "-u",
  "--user",
  "--url",
  "-F",
  "--form",
  "--json",
  "-o",
  "--output",
  "-m",
  "--max-time",
  "--connect-timeout",
  "-x",
  "--proxy",
  "--retry",
  "--cacert",
  "--cert",
  "--key",
  "-T",
  "--upload-file",
]);

// 一段 curl 可能被复制成多行（\ 或 ^ 续行），还可能带着 $ 提示符
function normalize(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\\\n/g, " ")
    .replace(/\^\n/g, " ")
    .replace(/^\s*[$#>]\s+/gm, "")
    .trim();
}

// 按 shell 规则切词：单引号里啥都不转义，双引号里认 \" \\ \$ 和续行
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  let has = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\") {
        const next = input[i + 1];
        if (next === '"' || next === "\\" || next === "$" || next === "`") {
          cur += next;
          i += 1;
        } else if (next === "\n") {
          i += 1;
        } else {
          cur += ch;
        }
        continue;
      }
      if (ch === '"') quote = null;
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (has) {
        tokens.push(cur);
        cur = "";
        has = false;
      }
      continue;
    }
    if (ch === "\\" && input[i + 1] === "\n") {
      i += 1;
      continue;
    }
    if (ch === "\\" && input[i + 1]) {
      cur += input[i + 1];
      i += 1;
      has = true;
      continue;
    }
    cur += ch;
    has = true;
  }
  if (has) tokens.push(cur);
  return tokens;
}

function parseHeaderLine(raw: string): HeaderPair | null {
  const idx = raw.indexOf(":");
  if (idx <= 0) return null;
  const name = raw.slice(0, idx).trim();
  const value = raw.slice(idx + 1).trim();
  if (!name) return null;
  return [name, value];
}

function base64OfUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

// 拼 multipart body：只处理普通的 -F 'k=v'，文件字段原样留个名字
function buildMultipart(fields: string[]): { body: string; contentType: string } | null {
  if (fields.length === 0) return null;
  const boundary = `----RepXBoundary${Math.random().toString(16).slice(2, 10)}`;
  const parts: string[] = [];
  for (const field of fields) {
    const eq = field.indexOf("=");
    if (eq <= 0) continue;
    const name = field.slice(0, eq);
    const value = field.slice(eq + 1);
    if (value.startsWith("@")) {
      const file = value.slice(1).split(";")[0];
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${file.split(/[\\/]/).pop() ?? "file"}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      );
    } else {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    }
  }
  parts.push(`--${boundary}--\r\n`);
  return { body: parts.join(""), contentType: `multipart/form-data; boundary=${boundary}` };
}

// 把一个 URL 拆成 Burp 里的「请求行 + Host」
function splitUrl(url: string): { path: string; host: string } {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`;
  try {
    const parsed = new URL(withScheme);
    return { path: `${parsed.pathname || "/"}${parsed.search}`, host: parsed.host };
  } catch {
    const match = /^(?:https?:\/\/)?([^/?#]+)(.*)$/i.exec(url);
    return { path: match?.[2] || "/", host: match?.[1] ?? url };
  }
}

// 主解析器：覆盖 curl 导出的常规写法
export function parseCurlCommand(input: string): CurlParseResult {
  const text = normalize(input);
  if (!/^\s*curl\b/i.test(text) && !/^\s*\$?\s*curl\b/i.test(text)) {
    if (!/curl\s/i.test(text)) throw new Error("这不像一条 curl 命令");
  }

  const tokens = tokenize(text);
  const start = tokens.findIndex((t) => /^curl$/i.test(t) || /[/\\]curl(\.exe)?$/i.test(t));
  const args = start >= 0 ? tokens.slice(start + 1) : tokens;

  let method = "";
  let url = "";
  let body: string | null = null;
  const dataParts: string[] = [];
  const formFields: string[] = [];
  const headers: HeaderPair[] = [];
  let cookie = "";
  let asJson = false;
  let useGet = false;

  const addHeader = (name: string, value: string) => {
    const lower = name.toLowerCase();
    const exist = headers.findIndex(([n]) => n.toLowerCase() === lower);
    if (exist >= 0) headers[exist] = [headers[exist][0], value];
    else headers.push([name, value]);
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    const next = (): string => {
      i += 1;
      return args[i] ?? "";
    };

    if (!arg.startsWith("-")) {
      if (!url) url = arg;
      continue;
    }

    // X POST / --request=POST 两种写法都认
    const eq = arg.indexOf("=");
    const flag = eq > 0 && arg.startsWith("--") ? arg.slice(0, eq) : arg;
    const inline = eq > 0 && arg.startsWith("--") ? arg.slice(eq + 1) : null;
    const value = (): string => inline ?? next();

    switch (flag) {
      case "-X":
      case "--request":
        method = value().toUpperCase();
        break;
      case "-H":
      case "--header": {
        const parsed = parseHeaderLine(value());
        if (parsed) addHeader(parsed[0], parsed[1]);
        break;
      }
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
      case "--data-ascii":
        dataParts.push(value());
        break;
      case "--data-urlencode": {
        const raw = value();
        const idx = raw.indexOf("=");
        dataParts.push(idx > 0 ? `${raw.slice(0, idx)}=${encodeURIComponent(raw.slice(idx + 1))}` : encodeURIComponent(raw));
        break;
      }
      case "--json":
        asJson = true;
        dataParts.push(value());
        break;
      case "-F":
      case "--form":
        formFields.push(value());
        break;
      case "-b":
      case "--cookie":
        cookie = cookie ? `${cookie}; ${value()}` : value();
        break;
      case "-A":
      case "--user-agent":
        addHeader("User-Agent", value());
        break;
      case "-e":
      case "--referer":
        addHeader("Referer", value());
        break;
      case "-u":
      case "--user": {
        const raw = value();
        addHeader("Authorization", `Basic ${base64OfUtf8(raw)}`);
        break;
      }
      case "--url":
        url = value();
        break;
      case "-G":
      case "--get":
        useGet = true;
        break;
      case "-I":
      case "--head":
        method = "HEAD";
        break;
      case "--compressed":
        addHeader("Accept-Encoding", "gzip, deflate, br");
        break;
      default:
        // 认识的带参开关就吞掉它的值，其余（-k -L -s -v --insecure …）直接忽略
        if (!inline && VALUE_FLAGS.has(flag)) i += 1;
        break;
    }
  }

  if (!url) throw new Error("没找到 URL，命令里得有 https://… 或 --url");

  if (formFields.length > 0) {
    const multipart = buildMultipart(formFields);
    if (multipart) {
      body = multipart.body;
      addHeader("Content-Type", multipart.contentType);
    }
  } else if (dataParts.length > 0) {
    body = dataParts.join("&");
    if (asJson && !headers.some(([n]) => n.toLowerCase() === "content-type")) {
      addHeader("Content-Type", "application/json");
    }
  }

  if (cookie) addHeader("Cookie", cookie);

  if (useGet && body) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}${body}`;
    body = null;
  }

  if (!method) {
    method = body !== null ? "POST" : "GET";
  }

  if (body !== null && !headers.some(([n]) => n.toLowerCase() === "content-type")) {
    addHeader("Content-Type", "application/x-www-form-urlencoded");
  }

  return { method, url, headers, body };
}

// 解析结果 → Burp 风格原文报文（请求行写路径，主机走 Host 头）
export function curlToRequestText(input: string): string {
  const parsed = parseCurlCommand(input);
  return requestTextOf(parsed);
}

export function requestTextOf(parsed: CurlParseResult): string {
  const { path, host } = splitUrl(parsed.url);
  const lines: string[] = [`${parsed.method} ${path} HTTP/1.1`, `Host: ${host}`];
  for (const [name, value] of parsed.headers) {
    if (name.toLowerCase() === "host" || name.toLowerCase() === "content-length") continue;
    lines.push(`${name}: ${value}`);
  }
  const head = lines.join("\n");
  return parsed.body === null ? `${head}\n\n` : `${head}\n\n${parsed.body}`;
}

// 给界面用的入口 说明：本来想用 curlconverter 兜底
export async function importCurl(input: string): Promise<{ text: string; parser: "repx" }> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("先粘一条 curl 命令进来");
  return { text: curlToRequestText(trimmed), parser: "repx" };
}
