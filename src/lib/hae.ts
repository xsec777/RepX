import rawRules from "./haeRules.json";
import type { HaeColor, HaeHit, HaeRule } from "../types";

// HaE 规则引擎（对齐 Burp HaE 3.x 的 Rules.yml）

interface RawHaeRule {
  group: string;
  name: string;
  regex: string;
  sRegex: string;
  format: string;
  color: string;
  scope: string;
  sensitive: boolean;
  loaded: boolean;
}

const COLOR_SET: HaeColor[] = ["red", "orange", "yellow", "green", "cyan", "magenta", "pink", "gray"];

function toColor(value: string): HaeColor {
  const v = (value || "").toLowerCase() as HaeColor;
  return COLOR_SET.includes(v) ? v : "yellow";
}

// 打包进来的规则表（已按 loaded 过滤）
export const HAE_RULES: HaeRule[] = (rawRules as RawHaeRule[])
  .filter((r) => r.loaded && r.regex)
  .map((r) => ({
    group: r.group || "HaE",
    name: r.name,
    regex: r.regex,
    sRegex: r.sRegex || "",
    format: r.format || "{0}",
    color: toColor(r.color),
    scope: (r.scope || "any").toLowerCase(),
    sensitive: Boolean(r.sensitive),
  }));

// 规则分组概览，设置页里用来数数

type Part = "full" | "header" | "body" | "line";

interface Target {
  text: string;
  // 在整段报文中的起始偏移，命中位置最后要加回来
  offset: number;
}

// 一条规则作用在哪一段：请求/响应 × 全文/头/体/请求行
function resolveScope(scope: string): { request: boolean; response: boolean; part: Part } {
  const side = scope.startsWith("any") ? "any" : scope.startsWith("request") ? "request" : scope.startsWith("response") ? "response" : "any";
  const part: Part = scope.includes("header") ? "header" : scope.includes("body") ? "body" : scope.includes("line") ? "line" : "full";
  return {
    request: side === "any" || side === "request",
    response: side === "any" || side === "response",
    part,
  };
}

// 报文拆成 头 / 体 两段（请求行算在头里），返回各段偏移
function sliceMessage(text: string, part: Part): Target | null {
  if (!text) return null;
  const headerEnd = text.indexOf("\n\n");
  const headEnd = headerEnd >= 0 ? headerEnd : text.length;

  if (part === "full") return { text, offset: 0 };
  if (part === "header") return headEnd > 0 ? { text: text.slice(0, headEnd), offset: 0 } : null;
  if (part === "body") {
    if (headerEnd < 0) return null;
    const offset = headerEnd + 2;
    return offset <= text.length ? { text: text.slice(offset), offset } : null;
  }
  // line：请求行 / 状态行
  const lineEnd = text.indexOf("\n");
  const end = lineEnd >= 0 ? lineEnd : text.length;
  return end > 0 ? { text: text.slice(0, end), offset: 0 } : null;
}

// 单条规则最多记这么多命中，防止一个 .* 把整页填满
const MAX_HITS_PER_RULE = 40;
// 单次分析的总命中上限
const MAX_HITS_TOTAL = 400;

// 行首偏移表，算行号用二分，避免每条命中都从头数换行
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// 统一补行号：MarkInfo 里显示“哪一行”靠它
function withLines(hits: HaeHit[], text: string): HaeHit[] {
  const starts = lineStarts(text);
  for (const hit of hits) hit.line = lineAt(starts, hit.start);
  return hits;
}

function collect(rule: HaeRule, target: Target, side: "request" | "response", out: HaeHit[]): void {
  let re: RegExp;
  try {
    re = new RegExp(rule.regex, "gi");
  } catch {
    return; // 正则语法不兼容（Java 方言）就直接跳过，不影响别的规则
  }

  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(target.text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1; // 零宽命中：手动推进，避免死循环
      continue;
    }

    // 很多规则把边界字符（空格、引号）也圈进来了，高亮时把它们剥掉
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const tail = raw.length - raw.trimEnd().length;
    const value = raw.trim();
    if (!value) continue;

    const start = target.offset + m.index + lead;
    const end = target.offset + m.index + raw.length - tail;
    out.push({
      rule: rule.name,
      group: rule.group,
      color: rule.color,
      scope: rule.scope,
      side,
      start,
      end: Math.min(end, target.offset + target.text.length),
      line: 0, // 先占位，跑完统一按全报文补行号
      value: value.length > 160 ? `${value.slice(0, 160)}…` : value,
      sensitive: rule.sensitive,
    });

    if (++count >= MAX_HITS_PER_RULE || out.length >= MAX_HITS_TOTAL) return;
  }
}

// 整条请求 + 整条响应一起跑规则
// 只跑一侧：给“屏幕上正在显示的这段文本”算命中 好处是格式化/美化之后偏移永远是对的
export function runHaeSide(text: string, side: "request" | "response"): HaeHit[] {
  if (!text) return [];
  const hits: HaeHit[] = [];

  for (const rule of HAE_RULES) {
    const scope = resolveScope(rule.scope);
    if (side === "request" ? !scope.request : !scope.response) continue;
    const target = sliceMessage(text, scope.part);
    if (target) collect(rule, target, side, hits);
    if (hits.length >= MAX_HITS_TOTAL) break;
  }

  return withLines(hits.sort((a, b) => a.start - b.start), text);
}

// 按规则名汇总，给 HaE 面板和截图卡片用
