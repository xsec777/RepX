// 编辑器字体选项，默认黑体，中文报文字形不会糊
export interface FontChoice {
  label: string;
  value: string;
}

export const FONT_CHOICES: FontChoice[] = [
  { label: "黑体 SimHei（默认）", value: "'SimHei', 'Microsoft YaHei', 'Heiti SC', sans-serif" },
  { label: "微软雅黑 Microsoft YaHei", value: "'Microsoft YaHei', 'PingFang SC', sans-serif" },
  { label: "Consolas（等宽）", value: "Consolas, 'Courier New', monospace" },
  { label: "Fira Code（等宽）", value: "'Fira Code', 'JetBrains Mono', Consolas, monospace" },
  { label: "JetBrains Mono（等宽）", value: "'JetBrains Mono', Consolas, monospace" },
  { label: "Cascadia Mono（等宽）", value: "'Cascadia Mono', Consolas, monospace" },
];

// 老版本落盘的字体串，读到就换成新的默认值，免得用户看不到"黑体"这个默认
export const LEGACY_FONT_FAMILY = "'Fira Code', 'JetBrains Mono', Consolas, Menlo, monospace";

export const DEFAULT_FONT_FAMILY = FONT_CHOICES[0].value;

export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 20;

// 字号兜底：超出 10~20 或者 NaN 一律回到 13
export function clampFontSize(size: unknown): number {
  const value = typeof size === "number" && Number.isFinite(size) ? Math.round(size) : 13;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, value));
}
