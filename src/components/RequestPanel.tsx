import type { ReactNode } from "react";
import type { HaeHit, Theme } from "../types";
import type { NotifyFn } from "../lib/editorActions";
import { CodeEditor } from "./CodeEditor";

interface RequestPanelProps {
  value: string;
  fontSize: number;
  fontFamily: string;
  onChange: (value: string) => void;
  // 请求侧的 HaE 命中，只在“请求报文”这一份文本上算
  marks?: HaeHit[];
  onCopyCurl: () => void;
  onResetTemplate: () => void;
  // MarkInfo 里点了请求侧的条目，滚到这里
  revealAt?: number | null;
  onNotify?: NotifyFn;
  theme: Theme;
}

// 左半区：请求原文编辑器（改完直接发，不做二次格式化）
export function RequestPanel(props: RequestPanelProps) {
  const { value, fontSize, fontFamily, onChange, marks, onCopyCurl, onResetTemplate, revealAt, onNotify, theme } = props;

  return (
    <section className="flex h-full min-w-0 flex-col border-r border-ink-600 bg-ink-800">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-ink-600 px-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11.5px] tracking-[0.18em] text-fg-mute">请求</span>
          <span className="font-mono text-[10px] text-fg-mute/70">原始报文 · 可直接改 · 选中右键可编码解码</span>
          {marks && marks.length > 0 ? (
            <span className="font-mono text-[10px] text-accent-orangeSoft">HaE 命中 {marks.length}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <SmallButton onClick={onCopyCurl}>复制 cURL</SmallButton>
          <SmallButton onClick={onResetTemplate}>模板</SmallButton>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <CodeEditor
          value={value}
          language="fp-http"
          fontSize={fontSize}
          fontFamily={fontFamily}
          onChange={onChange}
          marks={marks}
          revealAt={revealAt}
          onNotify={onNotify}
          theme={theme}
        />
      </div>
    </section>
  );
}

export function SmallButton(props: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="rounded-sm px-2 py-1 font-mono text-[11px] text-fg-dim hover:bg-ink-700 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
    >
      {props.children}
    </button>
  );
}
