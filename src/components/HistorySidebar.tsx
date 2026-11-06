import { useMemo, useState } from "react";
import type { HistoryEntry } from "../types";
import { cx, methodColor, statusColor, timeAgo } from "../lib/utils";
import { hostOf, pathOf } from "../lib/http";
import { IconClose, IconSearch, IconTrash } from "./Icons";

interface HistorySidebarProps {
  items: HistoryEntry[];
  activeId: string | null;
  onSelect: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onResetCookies: () => void;
}

export function HistorySidebar(props: HistorySidebarProps) {
  const { items, activeId, onSelect, onDelete, onClear, onResetCookies } = props;
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => `${it.method} ${it.url}`.toLowerCase().includes(q));
  }, [items, query]);

  return (
    <aside className="flex w-[268px] shrink-0 flex-col border-r border-ink-600 bg-ink-800">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="font-mono text-[11px] tracking-[0.18em] text-fg-mute">历史记录</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-fg-mute">{items.length}</span>
          <button
            type="button"
            title="清空历史记录"
            onClick={onClear}
            className="text-fg-mute hover:text-accent-red"
            disabled={items.length === 0}
          >
            <IconTrash width={13} height={13} />
          </button>
        </div>
      </div>

      <div className="px-2 pb-2">
        <div className="flex items-center gap-2 rounded-sm border border-ink-400 bg-ink-700 px-2">
          <IconSearch width={13} height={13} className="shrink-0 text-fg-mute" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="过滤 URL / 方法"
            spellCheck={false}
            className="h-7 w-full bg-transparent font-mono text-[11.5px] text-fg placeholder:text-fg-mute"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center font-mono text-[11px] leading-relaxed text-fg-mute">
            还没有记录
            <br />
            发一个包试试
          </p>
        ) : (
          filtered.map((entry) => {
            const active = entry.id === activeId;
            return (
              <div
                key={entry.id}
                onClick={() => onSelect(entry)}
                className={cx(
                  "group relative cursor-pointer border-l-2 px-3 py-2 transition-colors",
                  active
                    ? "border-l-accent-green bg-ink-700"
                    : "border-l-transparent hover:border-l-ink-500 hover:bg-ink-700/60"
                )}
                title={entry.url}
              >
                <div className="flex items-center gap-2">
                  <span className={cx("w-[42px] shrink-0 font-mono text-[10px] font-semibold", methodColor(entry.method))}>
                    {entry.method.slice(0, 5)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg">{pathOf(entry.url)}</span>
                  <span className={cx("shrink-0 font-mono text-[10px]", statusColor(entry.status))}>{entry.status ?? "-"}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between pl-[50px]">
                  <span className="min-w-0 truncate font-mono text-[10px] text-fg-mute">{hostOf(entry.url)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-fg-mute">{timeAgo(entry.ts)}</span>
                </div>

                <button
                  type="button"
                  title="删除这条"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(entry.id);
                  }}
                  className="absolute right-1 top-1 hidden text-fg-mute hover:text-accent-red group-hover:block"
                >
                  <IconClose width={11} height={11} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-ink-600 p-2">
        <button
          type="button"
          onClick={onResetCookies}
          className="w-full rounded-sm border border-ink-400 py-1.5 font-mono text-[11px] text-fg-dim hover:border-ink-500 hover:bg-ink-700 hover:text-fg"
        >
          清除 Cookie Jar
        </button>
      </div>
    </aside>
  );
}
