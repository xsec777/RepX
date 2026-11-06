import { useState } from "react";
import type { TabItem } from "../types";
import { IconClose, IconPlus } from "./Icons";
import { cx } from "../lib/utils";

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onAddTab: () => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, newTitle: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  onRenameTab,
}: TabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const startRename = (tab: TabItem) => {
    setEditingId(tab.id);
    setEditTitle(tab.title);
  };

  const commitRename = (id: string) => {
    if (editTitle.trim()) {
      onRenameTab(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-ink-600 bg-ink-800/80 px-2 overflow-x-auto select-none">
      <div className="flex items-center gap-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isEditing = editingId === tab.id;

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={() => startRename(tab)}
              className={cx(
                "group relative flex h-7 max-w-[180px] items-center gap-1.5 rounded-t border-t-2 px-2.5 font-mono text-xs cursor-pointer transition",
                isActive
                  ? "border-accent bg-ink-900 text-fg-main font-medium shadow"
                  : "border-transparent bg-ink-800 text-fg-mute hover:bg-ink-700/60 hover:text-fg-dim"
              )}
            >
              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => commitRename(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(tab.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-20 bg-ink-950 px-1 font-mono text-xs text-fg-main outline-none"
                />
              ) : (
                <span className="truncate" title={tab.title}>
                  {tab.title}
                </span>
              )}

              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className="rounded p-0.5 text-fg-mute opacity-0 group-hover:opacity-100 hover:bg-ink-700 hover:text-fg-main"
                  title="关闭标签页 (Ctrl+W)"
                >
                  <IconClose className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        <button
          onClick={onAddTab}
          className="flex h-7 w-7 items-center justify-center rounded text-fg-mute hover:bg-ink-700 hover:text-fg-main transition"
          title="新建标签页 (Ctrl+T)"
        >
          <IconPlus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
