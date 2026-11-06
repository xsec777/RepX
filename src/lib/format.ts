// 响应体美化：JSON / XML / HTML / 表单，其余原样

export interface FormattedBody {
  text: string;
  // Monaco 语言 id
  language: string;
  // 是否真的做了格式化（false 时 Pretty 和 Raw 内容一致）
  formatted: boolean;
}

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

// 内部内容不能被按标签拆行的元素，原样保留
const PRESERVE_TAGS = new Set(["pre", "textarea", "script", "style"]);

export function detectLanguage(contentType: string, body: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("html")) return "html";
  if (ct.includes("xml")) return "xml";
  if (ct.includes("javascript") || ct.includes("ecmascript")) return "javascript";
  if (ct.includes("css")) return "css";

  const head = body.trimStart().slice(0, 200);
  if (/^[{[]/.test(head)) return "json";
  if (/^<\?xml/i.test(head)) return "xml";
  if (/^<!doctype\s+html/i.test(head) || /^<html[\s>]/i.test(head)) return "html";
  if (/^<[a-z!]/i.test(head)) return "xml";
  return "plaintext";
}

// JSON 宽容解析：顺手兼容后面多一个分号、或者 JSONP 包一层的情况
function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim().replace(/;$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    // 继续往下试
  }
  const jsonp = /^[\w$.]+\s*\(([\s\S]*)\)\s*;?$/.exec(trimmed);
  if (jsonp) {
    try {
      return JSON.parse(jsonp[1]);
    } catch {
      return null;
    }
  }
  return null;
}

// 标签缩进格式化，够用就行，不追求完美 HTML 规范
export function formatMarkup(source: string): string {
  const text = source.trim();
  if (!text) return "";

  const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/?\s*[A-Za-z][^>]*>/g;
  const out: string[] = [];
  let depth = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;

  const indent = (level: number) => "  ".repeat(Math.min(level, 16));
  const pushText = (chunk: string): void => {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    for (const line of trimmed.split(/\n/)) {
      const l = line.trim();
      if (l) out.push(indent(depth) + l);
    }
  };

  while ((match = tagRe.exec(text)) !== null) {
    pushText(text.slice(cursor, match.index));
    const tag = match[0];
    cursor = match.index + tag.length;

    const nameMatch = /^<\/?\s*([A-Za-z0-9:_-]+)/.exec(tag);
    const name = (nameMatch?.[1] ?? "").toLowerCase();

    // 注释 / CDATA / DOCTYPE / 处理指令：整块原样输出
    if (!nameMatch) {
      out.push(indent(depth) + tag);
      continue;
    }

    if (tag.startsWith("</")) {
      depth = Math.max(0, depth - 1);
      out.push(indent(depth) + tag);
      continue;
    }

    const selfClosing = /\/>\s*$/.test(tag) || VOID_TAGS.has(name);

    // script/style/pre 里的内容可能带 < 号，直接定位闭合标签整段保留
    if (!selfClosing && PRESERVE_TAGS.has(name)) {
      const lower = text.toLowerCase();
      const closeIdx = lower.indexOf(`</${name}`, cursor);
      if (closeIdx !== -1) {
        const closeEnd = text.indexOf(">", closeIdx);
        const inner = text.slice(cursor, closeIdx).trimEnd();
        out.push(indent(depth) + tag);
        if (inner.trim()) out.push(indent(depth + 1) + inner.trim());
        if (closeEnd !== -1) {
          out.push(indent(depth) + text.slice(closeIdx, closeEnd + 1));
          cursor = closeEnd + 1;
        } else {
          cursor = closeIdx;
        }
        tagRe.lastIndex = cursor;
        continue;
      }
    }

    // <a>短文本</a> 合并成一行，不然格式化的结果比原文还长
    if (!selfClosing) {
      const inlineRe = new RegExp(`^([^<>]{1,80})<\\/${name}\\s*>`);
      const inline = inlineRe.exec(text.slice(cursor));
      if (inline) {
        out.push(indent(depth) + tag + inline[1] + `</${name}>`);
        cursor += inline[0].length;
        tagRe.lastIndex = cursor;
        continue;
      }
    }

    out.push(indent(depth) + tag);
    if (!selfClosing) depth += 1;
  }

  pushText(text.slice(cursor));
  return out.join("\n");
}

// application/x-www-form-urlencoded 一个参数一行，肉眼对参数方便
function formatUrlEncoded(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed || !/^[^\s=&]+=[^\s&]*(&[^\s=&]+=[^\s&]*)*$/.test(trimmed)) return null;
  if (!trimmed.includes("&")) return null;
  return trimmed
    .split("&")
    .map((pair) => pair.replace(/\+/g, " "))
    .join("\n");
}

export function prettyBody(body: string, contentType: string): FormattedBody {
  const language = detectLanguage(contentType, body);
  if (!body.trim()) {
    return { text: body, language, formatted: false };
  }

  if (language === "json") {
    const parsed = tryParseJson(body);
    if (parsed !== null) {
      return { text: JSON.stringify(parsed, null, 2), language, formatted: true };
    }
  }

  if (language === "html" || language === "xml") {
    const formatted = formatMarkup(body);
    if (formatted && formatted !== body.trim()) {
      return { text: formatted, language, formatted: true };
    }
  }

  if (contentType.toLowerCase().includes("x-www-form-urlencoded")) {
    const formatted = formatUrlEncoded(body);
    if (formatted) return { text: formatted, language: "plaintext", formatted: true };
  }

  return { text: body, language, formatted: false };
}
