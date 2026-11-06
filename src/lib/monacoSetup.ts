// Monaco 本地化装载 + 自定义主题 + 自定义 HTTP 语法 关键点：不走上游
import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

interface MonacoEnvironmentLike {
  getWorker(moduleId: string, label: string): Worker;
}

(self as unknown as { MonacoEnvironment: MonacoEnvironmentLike }).MonacoEnvironment = {
  getWorker(_moduleId: string, label: string): Worker {
    switch (label) {
      case "json":
        return new jsonWorker();
      case "css":
      case "scss":
      case "less":
        return new cssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new htmlWorker();
      case "typescript":
      case "javascript":
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

loader.config({ monaco });

// 介于 VS Code 暗色和纯黑之间，背景固定 #1E1E1E，和整体 UI 对齐
monaco.editor.defineTheme("fp-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "6A9955" },

    { token: "keyword", foreground: "C586C0" },
    { token: "type", foreground: "4EC9B0" },
    { token: "delimiter", foreground: "808080" },
    { token: "http-method", foreground: "4FC1FF", fontStyle: "bold" },
    { token: "http-header", foreground: "9CDCFE" },
    { token: "http-version", foreground: "808080" },
    { token: "http-url", foreground: "DCDCAA" },
    // 报文正文：标签紫、属性名玫红、属性值/字符串/链接绿、DOCTYPE 灰
    { token: "tag", foreground: "C792EA" },
    { token: "attribute.name", foreground: "F07178" },
    // “正文”页签里的 JSON 键，和报文里的键保持同色
    { token: "string.key", foreground: "F07178" },
    { token: "attribute.value", foreground: "7BD88F" },
    { token: "string", foreground: "7BD88F" },
    { token: "string.url", foreground: "7BD88F", fontStyle: "bold underline" },
    { token: "metatag", foreground: "808080" },
    { token: "delimiter", foreground: "808080" },
    { token: "punctuation", foreground: "8A8A8A" },
    { token: "number", foreground: "D7BA7D" },
    { token: "comment", foreground: "6A9955", fontStyle: "italic" },
  ],
  colors: {
    "editor.background": "#1E1E1E",
    "editor.foreground": "#D4D4D4",
    "editor.lineHighlightBackground": "#232323",
    "editorLineNumber.foreground": "#5A5A5A",
    "editorLineNumber.activeForeground": "#C6C6C6",
    "editor.selectionBackground": "#264F78",
    "editor.inactiveSelectionBackground": "#264F7855",
    "editorCursor.foreground": "#AEAFAD",
    "editorIndentGuide.background1": "#2A2A2A",
    "editorIndentGuide.activeBackground1": "#3C3C3C",
    "editorWidget.background": "#252526",
    "editorWidget.border": "#3C3C3C",
    "scrollbarSlider.background": "#3A3A3A66",
    "scrollbarSlider.hoverBackground": "#4A4A4A99",
    "scrollbarSlider.activeBackground": "#5A5A5A99",
  },
});

// 亮色主题：色值取自参考图（IntelliJ Light 风格）
monaco.editor.defineTheme("fp-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "comment", foreground: "8C8C8C" },

    { token: "keyword", foreground: "0033B3" },
    { token: "type", foreground: "00627A" },
    { token: "delimiter", foreground: "202020" },
    { token: "http-method", foreground: "000075", fontStyle: "bold" },
    { token: "http-header", foreground: "000075" },
    { token: "http-version", foreground: "787878" },
    { token: "http-url", foreground: "26649D" },
    // 报文正文：标签深紫、属性名深红、属性值深绿
    { token: "tag", foreground: "7A1FA2" },
    { token: "attribute.name", foreground: "A31515" },
    // “正文”页签里的 JSON 键，和报文里的键保持同色
    { token: "string.key", foreground: "A31515" },
    { token: "attribute.value", foreground: "0B7A0B" },
    { token: "string", foreground: "0B7A0B" },
    { token: "string.url", foreground: "067D17", fontStyle: "bold underline" },
    { token: "metatag", foreground: "808080" },
    { token: "delimiter", foreground: "7A7A7A" },
    { token: "punctuation", foreground: "6E6E6E" },
    { token: "number", foreground: "9A4B00" },
    { token: "comment", foreground: "6A737D", fontStyle: "italic" },
  ],
  colors: {
    "editor.background": "#FBFBFB",
    "editor.foreground": "#202020",
    "editor.lineHighlightBackground": "#F0F0F0",
    "editorLineNumber.foreground": "#9A9A9A",
    "editorLineNumber.activeForeground": "#202020",
    "editor.selectionBackground": "#B3D7FF",
    "editor.inactiveSelectionBackground": "#B3D7FF88",
    "editorCursor.foreground": "#202020",
    "editorIndentGuide.background1": "#E8E8E8",
    "editorIndentGuide.activeBackground1": "#C9C9C9",
    "editorWidget.background": "#FFFFFF",
    "editorWidget.border": "#C9C9C9",
    "scrollbarSlider.background": "#C9C9C966",
    "scrollbarSlider.hoverBackground": "#B0B0B099",
    "scrollbarSlider.activeBackground": "#9A9A9A99",
  },
});

// 自定义 HTTP 原文语法：报文和正文共用同一组取色规则
const HTTP_METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\b/;

monaco.languages.register({ id: "fp-http" });

monaco.languages.setMonarchTokensProvider("fp-http", {
  defaultToken: "",
  tokenPostfix: ".http",
  brackets: [
    { open: "{", close: "}", token: "delimiter.bracket" },
    { open: "[", close: "]", token: "delimiter.bracket" },
    { open: "(", close: ")", token: "delimiter.parenthesis" },
    { open: "<", close: ">", token: "delimiter.tag" },
  ],
  tokenizer: {
    root: [
      // 空行 = 头结束，后面全是正文
      [/^\s*$/, { token: "white", next: "@body" }],
      [HTTP_METHOD_RE, "http-method"],
      [/\bHTTP\/\d(?:\.\d)?\b/, "http-version"],
      // 头字段名：行首到冒号
      [/^[A-Za-z0-9!#$%&'*+\-.^_`|~]+(?=\s*:)/, "http-header"],
      // 请求行里的绝对 URL / 头里的链接
      [/https?:\/\/[^\s"'<>]+/, "http-url"],
      [/"[^"]*"/, "string"],
      [/\b\d+(?:\.\d+)?\b/, "number"],
      [/[{}\[\];,:]/, "punctuation"],
    ],

    body: [
      // 注释、CDATA、DOCTYPE 先吃掉，别让 < 被当标签
      [/<!--/, { token: "comment", next: "@comment" }],
      [/<!\[CDATA\[/, { token: "comment", next: "@cdata" }],
      [/<![^>\n]*>/, "metatag"],
      // 结束标签 </div>：< 和 / 灰、标签名紫
      [/<\//, { token: "delimiter.tag", next: "@closeTag" }],
      // 开始标签 <script src=…>
      [/</, { token: "delimiter.tag", next: "@openTag" }],
      // JSON 的键（后面跟冒号）
      [/"[^"\n]*"(?=\s*:)/, "attribute.name"],
      // 裸链接：报文里最值得一眼看到的东西
      [/https?:\/\/[^\s"'<>()`]+/, "string.url"],
      [/"[^"\n]*"/, "string"],
      [/'[^'\n]*'/, "string"],
      [/(?<![\w-])\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%|s|ms)?\b/, "number"],
      // CSS / JSON 里的标点
      [/[{}()\[\];,:=]/, "punctuation"],
      // CSS 属性名（color: / font-size:）
      [/[a-zA-Z-]+(?=\s*:)/, "attribute.name"],
      // 普通文本整段吃掉，避免一个字一个字走规则（长响应体也不卡）
      [/[^<"'{}()\[\];,:=\d]+/, ""],
    ],

    openTag: [
      // 收尾：>/ > 直接结束标签
      [/\s*\/?>/, { token: "delimiter.tag", next: "@pop" }],
      // 属性三件套一起匹配（空白 + 名 + 等号 + 值），值里的链接单独给链接色
      [/(\s+)([\w:.-]+)(\s*=\s*)("https?:\/\/[^"]*")/, ["", "attribute.name", "delimiter", "string.url"]],
      [/(\s+)([\w:.-]+)(\s*=\s*)('https?:\/\/[^']*')/, ["", "attribute.name", "delimiter", "string.url"]],
      [/(\s+)([\w:.-]+)(\s*=\s*)("[^"]*")/, ["", "attribute.name", "delimiter", "attribute.value"]],
      [/(\s+)([\w:.-]+)(\s*=\s*)('[^']*')/, ["", "attribute.name", "delimiter", "attribute.value"]],
      [/(\s+)([\w:.-]+)(\s*=\s*)([^\s>]+)/, ["", "attribute.name", "delimiter", "attribute.value"]],
      [/\s+/, ""],
      // 剩下没被属性规则吃掉的单词就是标签名
      [/[\w:.-]+/, "tag"],
    ],

    closeTag: [
      [/\s+/, ""],
      [/>/, { token: "delimiter.tag", next: "@pop" }],
      [/[\w:.-]+/, "tag"],
    ],

    comment: [
      [/-->/, { token: "comment", next: "@pop" }],
      [/./, "comment"],
    ],

    cdata: [
      [/\]\]>/, { token: "comment", next: "@pop" }],
      [/./, "comment"],
    ],
  },
});

// 正文第一个非空字符：判断是 JSON、标记语言还是纯文本
export { monaco };
