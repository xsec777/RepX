// 零碎工具函数：格式化、时间、复制文本、className 合并
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

// 状态码配色，只区分"通/跳/客户端错/服务端错"四档
export function statusColor(status: number | null): string {
  if (status === null) return "text-fg-mute";
  if (status >= 200 && status < 300) return "text-accent-greenSoft";
  if (status >= 300 && status < 400) return "text-accent-orangeSoft";
  if (status >= 400 && status < 500) return "text-accent-orange";
  return "text-accent-red";
}

export function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-accent-greenSoft";
    case "POST":
      return "text-accent-orangeSoft";
    case "PUT":
    case "PATCH":
      return "text-accent-blue";
    case "DELETE":
      return "text-accent-red";
    default:
      return "text-fg-dim";
  }
}

// 复制纯文本，标准 API 不行就用 Tauri 插件
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    await writeText(text);
  }
}
