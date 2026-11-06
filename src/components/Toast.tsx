import { cx } from "../lib/utils";

interface ToastProps {
  text: string;
  tone: "ok" | "error";
}

// 右下角轻提示，2.6 秒后由 App 自动清掉
export function Toast({ text, tone }: ToastProps) {
  return (
    <div
      className={cx(
        "pointer-events-none fixed bottom-9 right-4 z-[60] max-w-[420px] rounded-sm border px-3 py-2 font-mono text-[11.5px] shadow-card",
        tone === "ok"
          ? "border-accent-green/50 bg-ink-700 text-accent-greenSoft"
          : "border-accent-red/50 bg-ink-700 text-accent-red"
      )}
    >
      {text}
    </div>
  );
}
