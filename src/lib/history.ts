// 历史记录与设置的本地持久化，全部走 localStorage，不落磁盘文件
import type { AppSettings, HistoryEntry } from "../types";
import { DEFAULT_FONT_FAMILY, LEGACY_FONT_FAMILY, clampFontSize } from "./fonts";

const HISTORY_KEY = "fp.history.v1";
const SETTINGS_KEY = "fp.settings.v1";
// 改名之前用的旧键，第一次启动时搬过来，别让用户的历史记录凭空消失
const LEGACY_HISTORY_KEY = "lite.history.v1";
const LEGACY_SETTINGS_KEY = "lite.settings.v1";

// 新键没东西就去老键里捞一次，捞到就顺手写到新键上
function readWithFallback(key: string, legacyKey: string): string | null {
  const fresh = localStorage.getItem(key);
  if (fresh) return fresh;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy) {
    try {
      localStorage.setItem(key, legacy);
    } catch {
      // 写不进去也无所谓，这次先用着
    }
  }
  return legacy;
}
// 单条请求原文最长存 128KB，再长就截断，别把 localStorage 塞满
const MAX_REQUEST_TEXT = 128 * 1024;

export const DEFAULT_SETTINGS: AppSettings = {
  proxy: "",
  timeoutMs: 30000,
  followRedirects: false,
  maxHistory: 80,
  fontSize: 13,
  fontFamily: DEFAULT_FONT_FAMILY,
  defaultScheme: "https",
  haeEnabled: true,
  theme: "dark",
};

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = readWithFallback(HISTORY_KEY, LEGACY_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry);
  } catch {
    return [];
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.ts === "number" &&
    typeof v.method === "string" &&
    typeof v.url === "string" &&
    typeof v.requestText === "string"
  );
}

export function saveHistory(entries: HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // 配额满了就把最旧的一半丢掉再试一次
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, Math.max(10, entries.length >> 1))));
    } catch {
      // 放弃，历史记录丢就丢了，不影响发包
    }
  }
}

export function makeHistoryEntry(input: {
  method: string;
  url: string;
  status: number | null;
  durationMs: number | null;
  requestText: string;
}): HistoryEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    method: input.method,
    url: input.url,
    status: input.status,
    durationMs: input.durationMs,
    requestText: input.requestText.slice(0, MAX_REQUEST_TEXT),
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = readWithFallback(SETTINGS_KEY, LEGACY_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    // 老版本存的是 Fira Code，统一迁到新的黑体默认
    if (merged.fontFamily === LEGACY_FONT_FAMILY) merged.fontFamily = DEFAULT_SETTINGS.fontFamily;
    merged.fontSize = clampFontSize(merged.fontSize);
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 忽略
  }
}
