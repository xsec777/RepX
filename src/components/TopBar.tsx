import { useState } from "react";
import type { ReactNode } from "react";
import {
  IconCamera,
  IconDownload,
  IconFolder,
  IconImport,
  IconMoon,
  IconSettings,
  IconSun,
} from "./Icons";
import type { ActiveView, ProjectInfo, Theme } from "../types";
import { cx } from "../lib/utils";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

interface TopBarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  currentProject: ProjectInfo | null;
  onOpenProjectDialog: () => void;
  method: string;
  url: string;
  requestLineUrl?: string;
  busy: boolean;
  canExport: boolean;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
  onCopyImage: () => void;
  onExportImage: () => void;
  onOpenSettings: () => void;
  onImportCurl: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

export function TopBar(props: TopBarProps) {
  const {
    activeView,
    onViewChange,
    currentProject,
    onOpenProjectDialog,
    method,
    url,
    busy,
    canExport,
    onMethodChange,
    onUrlChange,
    onSend,
    onCopyImage,
    onExportImage,
    onOpenSettings,
    onImportCurl,
    theme,
    onToggleTheme,
  } = props;

  const [draft, setDraft] = useState<string | null>(null);
  const shownUrl = draft ?? url;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-ink-600 bg-ink-800 px-3 select-none">
      {/* 左侧：品牌 + 视图切换 + 项目状态 */}
      <div className="flex items-center gap-3">
        {/* 品牌 */}
        <div className="flex select-none items-center gap-2 pr-2">
          <img src="/favicon.png" alt="RepX" className="h-4 w-4 rounded-[3px] shadow-sm" />
          <span className="font-mono text-[15px] font-bold tracking-[0.2em] text-fg-main">
            REPX
          </span>
        </div>

        {/* 双主视图切换按钮 (Repeater vs History) */}
        <div className="flex items-center rounded border border-ink-500 bg-ink-900/60 p-0.5 font-mono text-xs">
          <button
            onClick={() => onViewChange("repeater")}
            className={cx(
              "rounded px-3 py-1 font-medium transition",
              activeView === "repeater"
                ? "bg-accent text-ink-950 font-semibold shadow-sm"
                : "text-fg-mute hover:text-fg-main"
            )}
          >
            工作台 (Repeater)
          </button>
          <button
            onClick={() => onViewChange("history")}
            className={cx(
              "rounded px-3 py-1 font-medium transition",
              activeView === "history"
                ? "bg-accent text-ink-950 font-semibold shadow-sm"
                : "text-fg-mute hover:text-fg-main"
            )}
          >
            历史流量 (History)
          </button>
        </div>

        {/* 当前项目徽章 (点击调出项目向导) */}
        <button
          onClick={onOpenProjectDialog}
          title="点击切换或新建项目 (向导)"
          className="flex items-center gap-1.5 rounded border border-ink-500 bg-ink-700/80 px-2.5 py-1 font-mono text-xs text-fg-dim hover:border-accent/60 hover:bg-ink-700 hover:text-fg-main transition"
        >
          <IconFolder className="h-3.5 w-3.5 text-accent" />
          <span className="max-w-[140px] truncate">
            {currentProject ? currentProject.name : "载入项目中..."}
          </span>
          {currentProject?.isTemp && (
            <span className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-400">临时</span>
          )}
        </button>
      </div>

      {/* 中间：发包地址栏（仅在 Repeater 视图下展示） */}
      {activeView === "repeater" ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
          <select
            value={method}
            onChange={(e) => onMethodChange(e.target.value)}
            className="h-8 w-[92px] cursor-pointer appearance-none rounded border border-ink-400 bg-ink-700 px-2 text-center font-mono text-xs font-semibold text-accent hover:border-ink-500 outline-none"
            title="请求方法"
          >
            {METHODS.map((m) => (
              <option key={m} value={m} className="bg-ink-800 text-fg-main">
                {m}
              </option>
            ))}
          </select>

          <input
            value={shownUrl}
            onFocus={() => setDraft(url)}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
              setDraft(e.target.value);
              onUrlChange(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSend();
            }}
            spellCheck={false}
            title={props.requestLineUrl ? `报文请求行：${props.requestLineUrl}` : undefined}
            placeholder="https://example.com/api/test"
            className="h-8 min-w-0 flex-1 rounded border border-ink-400 bg-ink-900 px-3 font-mono text-xs text-fg-main placeholder:text-fg-mute hover:border-ink-500 focus:border-accent outline-none"
          />

          <button
            type="button"
            onClick={onSend}
            disabled={busy}
            className={cx(
              "flex h-8 items-center gap-1.5 rounded px-3.5 font-mono text-xs font-semibold text-ink-950 transition-colors",
              busy ? "cursor-wait bg-accent/60" : "bg-accent hover:bg-accent/90"
            )}
            title="发送请求 (Ctrl+Enter)"
          >
            {busy ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-950/40 border-t-ink-950" />
                <span>发包中</span>
              </>
            ) : (
              <>
                <span>发送</span>
                <span className="text-[10px] text-ink-950/70 font-normal">Ctrl+↵</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onImportCurl}
            title="粘贴 cURL 命令并自动解析"
            className="flex h-8 items-center gap-1 rounded border border-ink-400 px-2.5 font-mono text-xs text-fg-dim hover:bg-ink-700 hover:text-fg-main transition-colors"
          >
            <IconImport className="h-3.5 w-3.5" />
            <span>cURL</span>
          </button>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* 右侧：工具按键 */}
      <div className="flex items-center gap-1.5">
        <IconButton label="复制为图片 (Ctrl+Shift+C)" disabled={!canExport} onClick={onCopyImage}>
          <IconCamera />
        </IconButton>
        <IconButton label="导出 PNG (Ctrl+Shift+S)" disabled={!canExport} onClick={onExportImage}>
          <IconDownload />
        </IconButton>
        <div className="mx-1 h-4 w-px bg-ink-600" />
        <IconButton
          label={theme === "dark" ? "切换到亮色主题" : "切换到暗色主题"}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <IconSun /> : <IconMoon />}
        </IconButton>
        <IconButton label="系统设置" onClick={onOpenSettings}>
          <IconSettings />
        </IconButton>
      </div>
    </header>
  );
}

interface IconButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function IconButton({ label, disabled, onClick, children }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex h-8 w-8 items-center justify-center rounded border border-ink-400 text-fg-dim transition-colors",
        disabled ? "cursor-not-allowed opacity-30" : "hover:border-ink-500 hover:bg-ink-700 hover:text-fg-main"
      )}
    >
      {children}
    </button>
  );
}
