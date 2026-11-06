import { useState } from "react";
import type { ReactNode } from "react";
import type { AppSettings } from "../types";
import { cx } from "../lib/utils";
import { FONT_CHOICES, MAX_FONT_SIZE, MIN_FONT_SIZE } from "../lib/fonts";
import { IconClose } from "./Icons";

interface SettingsDialogProps {
  settings: AppSettings;
  onSave: (next: AppSettings) => void;
  // 字体这类"看得见"的项改完立刻生效，不用等按保存
  onLiveChange: (part: Partial<AppSettings>) => void;
  onClose: () => void;
}

export function SettingsDialog({ settings, onSave, onLiveChange, onClose }: SettingsDialogProps) {
  const [draft, setDraft] = useState<AppSettings>(settings);

  const patch = (part: Partial<AppSettings>) => setDraft((prev) => ({ ...prev, ...part }));

  // 一边改草稿，一边把值推给外面（编辑器会立即重排）
  const patchLive = (part: Partial<AppSettings>) => {
    setDraft((prev) => ({ ...prev, ...part }));
    onLiveChange(part);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[540px] rounded border border-ink-400 bg-ink-700 shadow-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="设置"
      >
        <div className="flex h-11 items-center justify-between border-b border-ink-500 px-4">
          <span className="font-mono text-[12px] tracking-[0.18em] text-fg-dim">设置</span>
          <button type="button" onClick={onClose} className="text-fg-mute hover:text-fg" aria-label="关闭">
            <IconClose />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <Field label="上游代理" hint="http://127.0.0.1:8080 · socks5://127.0.0.1:1080 · 留空则直连">
            <input
              value={draft.proxy}
              onChange={(e) => patch({ proxy: e.target.value })}
              placeholder="http://127.0.0.1:8080"
              spellCheck={false}
              className="h-8 w-full rounded-sm border border-ink-400 bg-ink-800 px-2 font-mono text-[12px] text-fg placeholder:text-fg-mute focus:border-accent-green/70"
            />
          </Field>

          <Field
            label="默认协议"
            hint="请求行只写路径时（Burp 复制出来的包），用它和 Host 头拼出完整 URL；Host 带 :80 / :443 时按端口自动判断"
          >
            <div className="flex gap-2">
              {(["https", "http"] as const).map((scheme) => (
                <button
                  type="button"
                  key={scheme}
                  onClick={() => patch({ defaultScheme: scheme })}
                  className={cx(
                    "h-8 flex-1 rounded-sm border font-mono text-[12px] uppercase tracking-wider",
                    draft.defaultScheme === scheme
                      ? "border-accent-green bg-ink-800 text-fg"
                      : "border-ink-400 bg-ink-800 text-fg-mute hover:text-fg-dim"
                  )}
                >
                  {scheme}
                </button>
              ))}
            </div>
          </Field>

          <Field label="主题" hint="暗色：VS Code 深灰；亮色：参考图那套白底（#FBFBFB / #000075 头名 / #ED1C24 强调）。顶栏也能一键切">
            <div className="flex gap-2">
              {(["dark", "light"] as const).map((theme) => (
                <button
                  type="button"
                  key={theme}
                  onClick={() => patch({ theme })}
                  className={cx(
                    "h-8 flex-1 rounded-sm border font-mono text-[12px]",
                    draft.theme === theme
                      ? "border-accent-green bg-ink-800 text-fg"
                      : "border-ink-400 bg-ink-800 text-fg-mute hover:text-fg-dim"
                  )}
                >
                  {theme === "dark" ? "暗色" : "亮色"}
                </button>
              ))}
            </div>
          </Field>

          <div className="flex gap-4">
            <Field label="超时 (ms)" className="flex-1">
              <input
                type="number"
                min={1000}
                max={600000}
                step={1000}
                value={draft.timeoutMs}
                onChange={(e) => patch({ timeoutMs: Number(e.target.value) || 30000 })}
                className="h-8 w-full rounded-sm border border-ink-400 bg-ink-800 px-2 font-mono text-[12px] text-fg focus:border-accent-green/70"
              />
            </Field>
            <Field label="历史条数" className="flex-1">
              <input
                type="number"
                min={10}
                max={500}
                step={10}
                value={draft.maxHistory}
                onChange={(e) => patch({ maxHistory: Number(e.target.value) || 80 })}
                className="h-8 w-full rounded-sm border border-ink-400 bg-ink-800 px-2 font-mono text-[12px] text-fg focus:border-accent-green/70"
              />
            </Field>
          </div>

          <Field label="字号" hint="10 ~ 20 px，拖动即时生效（编辑器、行高、截图一起变）">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                step={1}
                value={draft.fontSize}
                onChange={(e) => patchLive({ fontSize: Number(e.target.value) })}
                className="fp-range flex-1 cursor-pointer"
              />
              <input
                type="number"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                value={draft.fontSize}
                onChange={(e) => patchLive({ fontSize: Number(e.target.value) })}
                className="h-8 w-16 rounded-sm border border-ink-400 bg-ink-800 px-2 text-center font-mono text-[12px] text-fg focus:border-accent-green/70"
              />
              <span className="font-mono text-[11px] text-fg-mute">px</span>
            </div>
          </Field>

          <Field label="编辑器字体" hint="默认黑体；要严格对齐列宽就选等宽字体（Consolas / Fira Code）">
            <div className="flex gap-2">
              <select
                value={draft.fontFamily}
                onChange={(e) => patchLive({ fontFamily: e.target.value })}
                className="h-8 flex-1 cursor-pointer rounded-sm border border-ink-400 bg-ink-800 px-2 text-[12px] text-fg"
                style={{ fontFamily: draft.fontFamily }}
              >
                {FONT_CHOICES.map((f) => (
                  <option key={f.value} value={f.value} className="bg-ink-800">
                    {f.label}
                  </option>
                ))}
              </select>
              <span
                className="flex h-8 items-center rounded-sm border border-ink-500 px-3 text-[14px] text-fg-dim"
                style={{ fontFamily: draft.fontFamily }}
              >
                Aa 报文 Body
              </span>
            </div>
          </Field>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={draft.haeEnabled}
              onChange={(e) => patch({ haeEnabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-[#2E7D32]"
            />
            <span className="font-mono text-[12px] text-fg-dim">
              HaE 规则高亮（敏感信息 / 指纹 / 疑似漏洞，共 38 条，规则来自 Burp HaE 3.3.4）
            </span>
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={draft.followRedirects}
              onChange={(e) => patch({ followRedirects: e.target.checked })}
              className="h-3.5 w-3.5 accent-[#2E7D32]"
            />
            <span className="font-mono text-[12px] text-fg-dim">自动跟随 30x 跳转（默认关闭，方便看原始跳转包）</span>
          </label>

          <p className="rounded-sm border border-ink-500 bg-ink-800/60 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-fg-mute">
            SSL 证书校验已强制关闭（自签名、过期证书照发）。Cookie 由本地 Jar 统一管理，跨请求自动携带，不写进请求头里也生效。
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-500 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-ink-400 px-4 py-1.5 font-mono text-[12px] text-fg-dim hover:bg-ink-600 hover:text-fg"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="rounded-sm bg-accent-green px-4 py-1.5 font-mono text-[12px] font-semibold text-white hover:bg-[#357a38]"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={props.className}>
      <div className="mb-1 font-mono text-[11px] text-fg-mute">{props.label}</div>
      {props.children}
      {props.hint ? <div className="mt-1 font-mono text-[10px] text-fg-mute/70">{props.hint}</div> : null}
    </div>
  );
}
