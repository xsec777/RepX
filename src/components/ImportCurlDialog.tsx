import { useState } from "react";
import { importCurl } from "../lib/curlImport";
import { IconClose } from "./Icons";
import type { NotifyFn } from "../lib/editorActions";

interface ImportCurlDialogProps {
  onClose: () => void;
  // 解析成功后把 Burp 风格的报文回填给编辑器
  onImport: (requestText: string) => void;
  onNotify?: NotifyFn;
}

const PLACEHOLDER = `curl 'https://target.com/api/user?id=1' \\
  -H 'Content-Type: application/json' \\
  -H 'Cookie: sid=xxx' \\
  --data-raw '{"name":"ly1"}'`;

// 导入 cURL：粘命令 → 拆成 方法/URL/头/Body → 回填左侧编辑器
export function ImportCurlDialog(props: ImportCurlDialogProps) {
  const { onClose, onImport, onNotify } = props;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleImport = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importCurl(text);
      onImport(result.text);
      onNotify?.("cURL 解析成功，已填入请求编辑器");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      onNotify?.(`解析失败：${message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose} role="presentation">
      <div
        className="w-[720px] rounded border border-ink-400 bg-ink-700 shadow-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="导入 cURL"
      >
        <div className="flex h-11 items-center justify-between border-b border-ink-500 px-4">
          <span className="font-mono text-[12px] tracking-[0.18em] text-fg-dim">导入 cURL</span>
          <button type="button" onClick={onClose} className="text-fg-mute hover:text-fg" aria-label="关闭">
            <IconClose />
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="mb-2 font-mono text-[10.5px] leading-relaxed text-fg-mute">
            支持 <span className="text-fg-dim">-X / -H / -d / --data-raw / --data-urlencode / -b / -u / -F / --json</span>
            等常用参数，多行带 <span className="text-fg-dim">\</span> 续行的也能直接粘。解析后请求行写路径，主机进 Host 头。
          </p>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void handleImport();
            }}
            spellCheck={false}
            placeholder={PLACEHOLDER}
            className="h-[240px] w-full resize-none rounded-sm border border-ink-400 bg-ink-800 p-3 font-mono text-[12px] leading-relaxed text-fg placeholder:text-fg-mute/50 focus:border-accent-green/70"
          />
          {error ? (
            <p className="mt-2 rounded-sm border border-accent-red/40 bg-accent-red/5 px-2 py-1 font-mono text-[11px] text-accent-red">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-ink-500 px-4 py-3">
          <span className="font-mono text-[10px] text-fg-mute/70">Ctrl+Enter 直接解析</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-ink-400 px-4 py-1.5 font-mono text-[12px] text-fg-dim hover:bg-ink-600 hover:text-fg"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={busy || text.trim().length === 0}
              className="rounded-sm bg-accent-green px-4 py-1.5 font-mono text-[12px] font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "解析中…" : "解析并填入"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
