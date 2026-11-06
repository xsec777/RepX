// 选中内容转换（对标 Burp 右键 Convert selection）

// URL 编码：只动特殊字符，字母数字和 -._~ 原样留着
export function urlEncodeChars(text: string): string {
  let out = "";
  for (const ch of text) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
      continue;
    }
    out += percentEncode(ch);
  }
  return out;
}

// 全量 URL 编码：等价 encodeURIComponent，字母数字之外基本都转
export function urlEncodeAll(text: string): string {
  return encodeURIComponent(text);
}

// 一个字符按 UTF-8 逐字节转成 %XX（大写）
function percentEncode(ch: string): string {
  const bytes = new TextEncoder().encode(ch);
  let out = "";
  for (const byte of bytes) out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  return out;
}

// URL 解码：先按标准解，遇到坏百分号就退回宽松模式（坏的 %XX 原样留下，不整段报废）
export function urlDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text.replace(/%[0-9a-fA-F]{2}/g, (seq) => {
      const code = Number.parseInt(seq.slice(1), 16);
      try {
        return decodeURIComponent(seq);
      } catch {
        return String.fromCharCode(code);
      }
    });
  }
}

// URL 解码 + 把 + 当成空格（表单参数里常见）
export function urlDecodePlus(text: string): string {
  return urlDecode(text.replace(/\+/g, " "));
}

// Base64 编码（UTF-8 安全，中文不乱码）
export function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Base64 解码（自动容忍换行和 URL 安全字符 -_）
export function base64Decode(text: string): string {
  const cleaned = text.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = cleaned + "=".repeat((4 - (cleaned.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// HTML 实体编码：& < > " ' 和非 ASCII 全转成实体
export function htmlEncode(text: string): string {
  return text.replace(/[&<>"']|[^\x00-\x7F]/gu, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default: {
        const code = ch.codePointAt(0) ?? 0;
        return `&#x${code.toString(16).toUpperCase()};`;
      }
    }
  });
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  colon: ":",
  sol: "/",
  equals: "=",
  quest: "?",
  percnt: "%",
};

// HTML 实体解码：具名 + 十进制 + 十六进制
export function htmlDecode(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

// Hex 编码：按 UTF-8 字节转成连续小写 hex
export function hexEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

// Hex 解码：忽略空格和 0x 前缀，奇数长度直接报错
export function hexDecode(text: string): string {
  const cleaned = text.replace(/0x/gi, "").replace(/[\s:,-]/g, "");
  if (cleaned.length % 2 !== 0) throw new Error("hex 长度是奇数，解不出来");
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) throw new Error("含有非 hex 字符");
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

// Unicode 转义：非 ASCII 写成 \uXXXX，含代理对
export function unicodeEncode(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    out += code > 0x7e || code < 0x20 ? `\\u${code.toString(16).padStart(4, "0")}` : text[i];
  }
  return out;
}

// \uXXXX / \xXX 还原
export function unicodeDecode(text: string): string {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

export interface ConvertAction {
  id: string;
  label: string;
  // 只做编码或者只做解码，右键菜单里分两组更顺手
  run: (text: string) => string;
}

// 右键菜单里的转换项，顺序就是菜单顺序（照着 Burp 的分类排）
export const CONVERT_ACTIONS: ConvertAction[] = [
  { id: "url-encode", label: "URL 编码（仅特殊字符）", run: urlEncodeChars },
  { id: "url-encode-all", label: "URL 编码（整段）", run: urlEncodeAll },
  { id: "url-decode", label: "URL 解码", run: urlDecode },
  { id: "url-decode-plus", label: "URL 解码（+ 当空格）", run: urlDecodePlus },
  { id: "base64-encode", label: "Base64 编码", run: base64Encode },
  { id: "base64-decode", label: "Base64 解码", run: base64Decode },
  { id: "html-encode", label: "HTML 实体编码", run: htmlEncode },
  { id: "html-decode", label: "HTML 实体解码", run: htmlDecode },
  { id: "hex-encode", label: "Hex 编码", run: hexEncode },
  { id: "hex-decode", label: "Hex 解码", run: hexDecode },
  { id: "unicode-encode", label: "Unicode 转义", run: unicodeEncode },
  { id: "unicode-decode", label: "Unicode 还原", run: unicodeDecode },
  { id: "upper", label: "转大写", run: (t) => t.toUpperCase() },
  { id: "lower", label: "转小写", run: (t) => t.toLowerCase() },
];
