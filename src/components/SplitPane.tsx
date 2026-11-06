import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  // 首次打开时左侧占比（之后按像素记住）
  initialRatio?: number;
  // 两侧最小像素宽，窗口再小也不会把某一边挤没
  minLeftPx?: number;
  minRightPx?: number;
}

const STORAGE_KEY = "fp.split.leftPx";

// 记住的是像素宽而不是比例：换到大窗口 / 缩放到 150% 时不会一边被挤成一条缝
function readSaved(): number | null {
  const raw = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function SplitPane(props: SplitPaneProps) {
  const { left, right, initialRatio = 0.46, minLeftPx = 320, minRightPx = 340 } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [savedPx, setSavedPx] = useState<number | null>(readSaved);

  // 容器宽度：ResizeObserver 跟着窗口缩放走
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 真正生效的左侧宽度：先取记忆值/初始比例
  const usable = Math.max(containerWidth, minLeftPx + minRightPx);
  const desired = savedPx ?? containerWidth * initialRatio;
  const leftWidth = Math.round(
    Math.min(Math.max(desired, minLeftPx), Math.max(minLeftPx, usable - minRightPx))
  );

  const onMove = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = Math.min(Math.max(clientX - rect.left, minLeftPx), Math.max(minLeftPx, rect.width - minRightPx));
      setSavedPx(Math.round(next));
    },
    [minLeftPx, minRightPx]
  );

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      onMove(e.clientX);
    };
    const handleUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.classList.remove("dragging-split");
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [onMove]);

  // 手指/鼠标松开后落盘，拖拽过程不写 localStorage
  useEffect(() => {
    if (savedPx === null) return;
    const timer = window.setTimeout(() => localStorage.setItem(STORAGE_KEY, String(savedPx)), 300);
    return () => window.clearTimeout(timer);
  }, [savedPx]);

  return (
    <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1">
      <div style={{ width: leftWidth }} className="min-w-0 overflow-hidden">
        {left}
      </div>

      {/* 中缝：命中区 7px，视觉只有 1px */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="拖动调整宽度（双击复位）"
        onMouseDown={(e) => {
          e.preventDefault();
          draggingRef.current = true;
          document.body.classList.add("dragging-split");
        }}
        onDoubleClick={() => setSavedPx(null)}
        className="split-handle group relative w-[7px] shrink-0 cursor-col-resize"
      >
        <div className="absolute inset-y-0 left-[3px] w-px bg-ink-600 transition-colors group-hover:bg-accent-green/60" />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden">{right}</div>
    </div>
  );
}
