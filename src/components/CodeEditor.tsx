import Editor from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { useCallback, useEffect, useRef } from "react";
import type { HaeHit, Theme } from "../types";
import { monaco } from "../lib/monacoSetup";
import { registerConvertActions } from "../lib/editorActions";
import type { NotifyFn } from "../lib/editorActions";
import { cx } from "../lib/utils";
import { THEMES } from "../lib/theme";

interface CodeEditorProps {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  fontSize: number;
  fontFamily: string;
  className?: string;
  // HaE 命中区：只画背景，不改文本
  marks?: HaeHit[];
  // 点 MarkInfo 列表时滚到这一处
  revealAt?: number | null;
  // 右键转换完给个反馈（只读编辑器走复制，需要提示）
  onNotify?: NotifyFn;
  // 黑白主题，编辑器跟随全局一起切
  theme: Theme;
}

// 把字符偏移换成 Monaco 的 行/列，编辑器里 offset 从 0 开始，行号从 1 开始
function offsetToPosition(lineStarts: number[], offset: number): { lineNumber: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { lineNumber: lo + 1, column: offset - lineStarts[lo] + 1 };
}

function lineStartsOf(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

// Monaco 的统一封装：主题、行号、字体全部在这层定死
export function CodeEditor(props: CodeEditorProps) {
  const { value, language, onChange, readOnly = false, fontSize, fontFamily, className, marks, revealAt, onNotify, theme } =
    props;
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const collectionRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null);

  const applyMarks = useCallback(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;

    const collection = collectionRef.current ?? editor.createDecorationsCollection([]);
    collectionRef.current = collection;

    const text = model.getValue();
    const lineStarts = lineStartsOf(text);
    const decorations: MonacoEditor.IModelDeltaDecoration[] = [];

    for (const mark of marks ?? []) {
      if (mark.end <= mark.start || mark.start >= text.length) continue;
      const start = offsetToPosition(lineStarts, mark.start);
      const end = offsetToPosition(lineStarts, Math.min(mark.end, text.length));
      decorations.push({
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        options: {
          inlineClassName: `hae-mark hae-${mark.color}`,
          hoverMessage: { value: `**${mark.rule}** · ${mark.group}\n\n\`${mark.value}\`` },
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });
    }

    collection.set(decorations.slice(0, 600));
  }, [marks]);

  // 值或命中变化都要重画（值变了偏移就不可信了，直接按新文本重算）
  useEffect(() => {
    applyMarks();
  }, [applyMarks, value]);

  // 从 HaE 列表跳过来时把命中滚到视野中间
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || revealAt === null || revealAt === undefined) return;
    const model = editor.getModel();
    if (!model) return;
    const pos = offsetToPosition(lineStartsOf(model.getValue()), Math.min(revealAt, model.getValueLength()));
    editor.revealPositionInCenter({ lineNumber: pos.lineNumber, column: pos.column }, monaco.editor.ScrollType.Immediate);
    editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column });
  }, [revealAt]);

  return (
    <div className={cx("fp-editor h-full w-full", className)}>
      <Editor
        value={value}
        language={language}
        theme={THEMES[theme].monaco}
        onChange={(next) => onChange?.(next ?? "")}
        onMount={(editor) => {
          editorRef.current = editor;
          // 选中后右键：URL / Base64 / Hex / Unicode 编码解码
          registerConvertActions(editor, { readOnly, notify: onNotify });
          applyMarks();
        }}
        loading={<div className="p-4 font-mono text-xs text-fg-mute">编辑器加载中…</div>}
        options={{
          readOnly,
          domReadOnly: readOnly,
          fontSize,
          fontFamily,
          fontLigatures: true,
          minimap: { enabled: false },
          lineNumbers: readOnly ? "off" : "on",
          lineNumbersMinChars: 3,
          glyphMargin: false,
          folding: false,
          renderLineHighlight: "none",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          wrappingIndent: "same",
          automaticLayout: true,
          padding: { top: 12, bottom: 12 },
          tabSize: 2,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
            useShadows: false,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          renderWhitespace: "selection",
          guides: { indentation: false },
        }}
      />
    </div>
  );
}
