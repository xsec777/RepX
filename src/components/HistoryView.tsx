import { useEffect, useMemo, useState } from "react";
import type { HistoryDetail, HistoryRowSummary, Theme } from "../types";
import { getHistoryPacket, queryProjectHistory } from "../lib/api";
import { cx, formatBytes, methodColor, statusColor } from "../lib/utils";
import { CodeEditor } from "./CodeEditor";
import { IconSearch } from "./Icons";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

interface HistoryViewProps {
  theme: Theme;
  fontSize: number;
  fontFamily: string;
  onSendToRepeater: (requestText: string, title?: string) => void;
  onNotify?: (msg: string) => void;
}

export function HistoryView({
  theme,
  fontSize,
  fontFamily,
  onSendToRepeater,
  onNotify,
}: HistoryViewProps) {
  const [items, setItems] = useState<HistoryRowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 过滤器
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadHistory = async () => {
    setLoading(true);
    try {
      const rows = await queryProjectHistory({ limit: 500 });
      setItems(rows);
      if (rows.length > 0 && selectedId === null) {
        setSelectedId(rows[rows.length - 1].id);
      }
    } catch (e) {
      console.error("加载历史失败:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // 监听选中的包变化，加载详情
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    getHistoryPacket(selectedId)
      .then((res) => {
        setDetail(res);
      })
      .catch((e) => {
        console.error("获取报文详情失败:", e);
      })
      .finally(() => {
        setDetailLoading(false);
      });
  }, [selectedId]);

  // 过滤后的列表
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      // 状态码过滤
      if (statusFilter === "2xx" && (it.status === null || it.status < 200 || it.status >= 300))
        return false;
      if (statusFilter === "3xx" && (it.status === null || it.status < 300 || it.status >= 400))
        return false;
      if (statusFilter === "4xx" && (it.status === null || it.status < 400 || it.status >= 500))
        return false;
      if (statusFilter === "5xx" && (it.status === null || it.status < 500)) return false;

      // 文本搜索
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const target = `${it.method} ${it.host} ${it.path} ${it.url} ${it.mimeType}`.toLowerCase();
        if (!target.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter]);

  // 全局快捷键 Ctrl+R 发送到工作台
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R")) {
        if (detail) {
          e.preventDefault();
          onSendToRepeater(detail.requestRaw, `${detail.method} ${detail.path}`);
          onNotify?.(`已将 #${detail.id} 发送到工作台`);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detail, onSendToRepeater, onNotify]);

  const handleCopyRequest = () => {
    if (detail) {
      writeText(detail.requestRaw);
      onNotify?.("原始请求已复制到剪贴板");
    }
  };

  const handleSendCurrent = () => {
    if (detail) {
      onSendToRepeater(detail.requestRaw, `${detail.method} ${detail.path}`);
      onNotify?.(`已将 #${detail.id} 发送到工作台`);
    }
  };

  // 格式化组装 Response 文本 (加入大报文安全渲染保护)
  const responseRawText = useMemo(() => {
    if (!detail) return "";
    let head = `HTTP/1.1 ${detail.status || 0} ${detail.statusText}\n`;
    for (const [k, v] of detail.responseHeaders) {
      head += `${k}: ${v}\n`;
    }
    head += "\n";

    // 超过 500KB 进行编辑器安全截断渲染，防止 Monaco 在巨型网页下挂起
    if (detail.responseBodyText.length > 500_000) {
      return (
        head +
        detail.responseBodyText.slice(0, 500_000) +
        `\n\n... [界面预览保护: 仅显示前 500KB / 完整大小: ${formatBytes(detail.responseSize)}]`
      );
    }
    return head + detail.responseBodyText;
  }, [detail]);

  return (
    <div className="flex h-full w-full flex-col bg-ink-900 text-fg-main">
      {/* 顶部过滤控制条 */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-ink-600 bg-ink-800 px-3">
        <div className="flex items-center gap-3">
          {/* 搜索框 */}
          <div className="flex items-center gap-1.5 rounded border border-ink-500 bg-ink-900 px-2.5 py-1 text-xs">
            <IconSearch className="h-3.5 w-3.5 text-fg-mute" />
            <input
              type="text"
              placeholder="过滤 Host / 路径 / MIME..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 bg-transparent font-mono text-xs text-fg-main outline-none placeholder:text-fg-mute"
            />
          </div>

          {/* 状态码快速过滤 */}
          <div className="flex items-center rounded border border-ink-600 bg-ink-900/60 p-0.5 font-mono text-[11px]">
            {["all", "2xx", "3xx", "4xx", "5xx"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cx(
                  "rounded px-2 py-0.5 transition",
                  statusFilter === s
                    ? "bg-accent text-ink-950 font-semibold"
                    : "text-fg-mute hover:text-fg-main"
                )}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={loadHistory}
            disabled={loading}
            className="rounded border border-ink-500 bg-ink-700 px-2.5 py-1 font-mono text-xs text-fg-main hover:bg-ink-600 disabled:opacity-50"
          >
            {loading ? "刷新中..." : "刷新列表"}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-fg-mute">
            显示 {filteredItems.length} / {items.length} 个请求
          </span>
          {detail && (
            <button
              onClick={handleSendCurrent}
              className="flex items-center gap-1 rounded bg-accent/90 px-2.5 py-1 font-mono text-xs font-semibold text-ink-950 transition hover:bg-accent"
            >
              <span>发送到 Repeater</span>
              <kbd className="rounded bg-black/20 px-1 text-[10px]">Ctrl+R</kbd>
            </button>
          )}
        </div>
      </div>

      {/* 主体分为上下两段：上部流量表格，下部报文联动预览 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 上部：流量表格 */}
        <div className="h-[46%] shrink-0 overflow-y-auto border-b border-ink-600 bg-ink-900 select-none">
          <table className="w-full border-collapse font-mono text-xs">
            <thead className="sticky top-0 z-10 border-b border-ink-600 bg-ink-800 text-left text-[11px] text-fg-mute">
              <tr>
                <th className="w-14 px-3 py-1.5">#</th>
                <th className="w-24 px-2 py-1.5">时间</th>
                <th className="w-18 px-2 py-1.5">Method</th>
                <th className="w-48 px-2 py-1.5">Host</th>
                <th className="px-2 py-1.5">Path</th>
                <th className="w-16 px-2 py-1.5 text-center">Status</th>
                <th className="w-20 px-2 py-1.5 text-right">Length</th>
                <th className="w-20 px-2 py-1.5 text-right">Time</th>
                <th className="w-28 px-3 py-1.5">MIME</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700/40">
              {filteredItems.map((it) => {
                const isSelected = selectedId === it.id;
                return (
                  <tr
                    key={it.id}
                    onClick={() => setSelectedId(it.id)}
                    onDoubleClick={handleSendCurrent}
                    className={cx(
                      "cursor-pointer transition",
                      isSelected
                        ? "bg-accent/15 text-fg-main font-medium"
                        : "hover:bg-ink-800/60 text-fg-dim"
                    )}
                  >
                    <td className="px-3 py-1 text-fg-mute">{it.id}</td>
                    <td className="px-2 py-1 text-fg-mute">{it.timeStr}</td>
                    <td className={cx("px-2 py-1 font-semibold", methodColor(it.method))}>
                      {it.method}
                    </td>
                    <td className="max-w-[180px] truncate px-2 py-1 text-fg-main" title={it.host}>
                      {it.host}
                    </td>
                    <td className="max-w-[320px] truncate px-2 py-1 text-fg-dim" title={it.path}>
                      {it.path}
                    </td>
                    <td className={cx("px-2 py-1 text-center font-bold", statusColor(it.status))}>
                      {it.status ?? "-"}
                    </td>
                    <td className="px-2 py-1 text-right text-fg-mute">
                      {formatBytes(it.responseSize)}
                    </td>
                    <td className="px-2 py-1 text-right text-fg-mute">{it.durationMs}ms</td>
                    <td className="max-w-[110px] truncate px-3 py-1 text-fg-mute" title={it.mimeType}>
                      {it.mimeType || "-"}
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center font-mono text-xs text-fg-mute">
                    {loading ? "正在加载流量历史..." : "暂无流量记录（AI 或人工发包后将自动记录于此）"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 下部：Request 与 Response 左右双栏对比预览 */}
        <div className="flex flex-1 overflow-hidden bg-ink-950">
          {detail ? (
            <div className="grid h-full w-full grid-cols-2 divide-x divide-ink-600">
              {/* 请求面板 */}
              <div className="flex h-full flex-col overflow-hidden">
                <div className="flex h-8 shrink-0 items-center justify-between border-b border-ink-600 bg-ink-800 px-3">
                  <span className="font-mono text-[11px] font-medium tracking-wider text-fg-mute">
                    REQUEST 原文 (ID: #{detail.id})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyRequest}
                      className="rounded px-2 py-0.5 font-mono text-[11px] text-fg-mute hover:bg-ink-700 hover:text-fg-main"
                    >
                      复制请求
                    </button>
                    <button
                      onClick={handleSendCurrent}
                      className="rounded bg-accent/20 px-2 py-0.5 font-mono text-[11px] text-accent hover:bg-accent/30"
                    >
                      发送到工作台
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CodeEditor
                    value={detail.requestRaw}
                    language="http"
                    readOnly={true}
                    fontSize={fontSize}
                    fontFamily={fontFamily}
                    theme={theme}
                  />
                </div>
              </div>

              {/* 响应面板 */}
              <div className="flex h-full flex-col overflow-hidden">
                <div className="flex h-8 shrink-0 items-center justify-between border-b border-ink-600 bg-ink-800 px-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-medium tracking-wider text-fg-mute">
                      RESPONSE 原文
                    </span>
                    <span
                      className={cx("font-mono text-[11px] font-bold", statusColor(detail.status))}
                    >
                      {detail.status} {detail.statusText}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-fg-mute">
                    {formatBytes(detail.responseSize)} · {detail.durationMs}ms
                  </span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <CodeEditor
                    value={responseRawText}
                    language="http"
                    readOnly={true}
                    fontSize={fontSize}
                    fontFamily={fontFamily}
                    theme={theme}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center font-mono text-xs text-fg-mute">
              {detailLoading ? "正在载入报文详情..." : "在上方表格中点选任意数据包查看请求与响应原文"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
