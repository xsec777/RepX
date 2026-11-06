import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { HaeHit, HttpResponseData, Theme } from "../types";
import { buildResponseText, headersToText } from "../lib/http";
import { prettyBody } from "../lib/format";
import { runHaeSide } from "../lib/hae";
import type { NotifyFn } from "../lib/editorActions";
import { copyText, cx, formatBytes, statusColor } from "../lib/utils";
import { CodeEditor } from "./CodeEditor";
import { SmallButton } from "./RequestPanel";

type Tab = "raw" | "body" | "headers" | "markinfo";
type ViewMode = "pretty" | "raw";

interface ResponsePanelProps {
  response: HttpResponseData | null;
  error: string | null;
  busy: boolean;
  fontSize: number;
  fontFamily: string;
  // 请求侧的 HaE 命中，MarkInfo 面板里一起列出来
  requestHits?: HaeHit[];
  // HaE 总开关，关掉就不算也不画
  haeEnabled: boolean;
  onCopyBody: () => void;
  // MarkInfo 里点了请求侧的条目，让左边的请求编辑器滚过去
  onRevealRequest: (offset: number) => void;
  onNotify?: NotifyFn;
  // 黑白主题
  theme: Theme;
  // MarkInfo 里改命中值：请求侧能写回报文，响应侧只读
  onEditHit: (hit: HaeHit, value: string) => void;
}

// 右半区：状态行 + 报文/正文/响应头/MarkInfo 页签，正文支持美化与原文切换
export function ResponsePanel(props: ResponsePanelProps) {
  const {
    response,
    error,
    busy,
    fontSize,
    fontFamily,
    requestHits,
    haeEnabled,
    onCopyBody,
    onRevealRequest,
    onNotify,
    theme,
    onEditHit,
  } = props;
  const [tab, setTab] = useState<Tab>("raw");
  const [mode, setMode] = useState<ViewMode>("pretty");
  const [revealAt, setRevealAt] = useState<number | null>(null);

  const formatted = useMemo(
    () => (response ? prettyBody(response.bodyText, response.contentType) : null),
    [response]
  );

  const headersText = useMemo(
    () =>
      response
        ? headersToText(response.headers, `${response.httpVersion} ${response.status} ${response.statusText}`.trim())
        : "",
    [response]
  );

  // 整份响应报文：状态行 + 全部头 + 空行 + 体，Burp 里看到的就是这个
  const rawText = useMemo(() => (response ? buildResponseText(response) : ""), [response]);

  // 报文页签里的体也跟着“美化”开关走：格式化之后再拼回报文，看包还是看结构都行
  const rawDisplay = useMemo(() => {
    if (!response) return "";
    if (mode === "pretty" && formatted?.formatted) {
      const statusLine = `${response.httpVersion} ${response.status} ${response.statusText}`.trim();
      const head = [statusLine, ...response.headers.map(([k, v]) => `${k}: ${v}`)].join("\n");
      return `${head}\n\n${formatted.text}`;
    }
    return rawText;
  }, [formatted, mode, rawText, response]);

  // 命中直接算在“正在显示的这份文本”上，美化/原文切换后偏移依然准确
  const responseHits = useMemo(
    () => (haeEnabled && response ? runHaeSide(rawDisplay, "response") : []),
    [haeEnabled, rawDisplay, response]
  );
  const haeHits = useMemo(() => [...(requestHits ?? []), ...responseHits], [requestHits, responseHits]);
  const totalHits = haeHits.length;

  // 每次新响应回来都回到 报文 + 美化，符合“发完先看结果”的习惯
  useEffect(() => {
    if (response) {
      setTab("raw");
      setMode("pretty");
      setRevealAt(null);
    }
  }, [response?.receivedAt]);

  const statusLine = response ? `${response.httpVersion} ${response.status} ${response.statusText}`.trim() : "";

  return (
    <section className="flex h-full min-w-0 flex-col bg-ink-800">
      {/* 状态行 */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-ink-600 px-3">
        {response ? (
          <>
            <span className={cx("font-mono text-[12.5px] font-semibold", statusColor(response.status))}>
              {response.status} {response.statusText}
            </span>
            <span className="font-mono text-[11px] text-fg-mute">{response.durationMs} ms</span>
            <span className="font-mono text-[11px] text-fg-mute">{formatBytes(response.size)}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-mute" title={response.contentType}>
              {response.contentType || "无 Content-Type"}
            </span>
          </>
        ) : (
          <span className="font-mono text-[11px] text-fg-mute">
            {busy ? "请求发送中…" : error ? "请求失败" : "等待发送"}
          </span>
        )}

        {response && (
          <SmallButton onClick={onCopyBody} disabled={!response.bodyText}>
            复制响应体
          </SmallButton>
        )}
      </div>

      {/* 页签 + 模式切换 */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-ink-600 px-2">
        <div className="flex items-center gap-0.5">
          <TabButton active={tab === "raw"} onClick={() => setTab("raw")}>
            报文
            <span className="ml-1 text-fg-mute/60">原文</span>
          </TabButton>
          <TabButton active={tab === "body"} onClick={() => setTab("body")}>
            正文
          </TabButton>
          <TabButton active={tab === "headers"} onClick={() => setTab("headers")}>
            响应头
            {response ? <span className="ml-1 text-fg-mute">{response.headers.length}</span> : null}
          </TabButton>
          <TabButton active={tab === "markinfo"} onClick={() => setTab("markinfo")}>
            <span className={totalHits > 0 ? "text-accent-orangeSoft" : undefined}>MarkInfo</span>
            {totalHits > 0 ? <span className="ml-1 text-accent-orangeSoft">{totalHits}</span> : null}
          </TabButton>
        </div>

        {(tab === "body" || tab === "raw") && response ? (
          <div className="flex items-center rounded-sm border border-ink-400 p-0.5">
            <ToggleButton
              active={mode === "pretty"}
              disabled={!formatted?.formatted}
              title={formatted?.formatted ? "格式化 + 语法高亮" : "该内容没有可用的格式化方式"}
              onClick={() => setMode("pretty")}
            >
              美化
            </ToggleButton>
            <ToggleButton active={mode === "raw"} onClick={() => setMode("raw")} title="完全原始文本">
              原文
            </ToggleButton>
          </div>
        ) : null}
      </div>

      {/* 内容 */}
      <div className="min-h-0 flex-1">
        {error ? (
          <div className="h-full overflow-auto p-4">
            <div className="rounded-sm border border-accent-red/40 bg-accent-red/5 p-3 font-mono text-[12px] leading-relaxed text-accent-red">
              {error}
            </div>
          </div>
        ) : !response ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="font-mono text-[12px] text-fg-mute">Ctrl + Enter 发送 · 响应会显示在这里</p>
            <p className="font-mono text-[10.5px] text-fg-mute/60">
              忽略证书校验 · 不自动跟随跳转 · 共享 Cookie · 选中文本右键可编码解码
            </p>
          </div>
        ) : tab === "headers" ? (
          <CodeEditor
            value={headersText}
            language="plaintext"
            readOnly
            fontSize={fontSize}
            fontFamily={fontFamily}
            theme={theme}
            onNotify={onNotify}
          />
        ) : tab === "raw" ? (
          <CodeEditor
            key={`raw-${response.receivedAt}-${mode}`}
            value={rawDisplay}
            language="fp-http"
            readOnly
            fontSize={fontSize}
            fontFamily={fontFamily}
            theme={theme}
            marks={responseHits}
            revealAt={revealAt}
            onNotify={onNotify}
          />
        ) : tab === "markinfo" ? (
          <MarkInfoPanel
            hits={haeHits}
            enabled={haeEnabled}
            onNotify={onNotify}
            onEditHit={onEditHit}
            onPick={(hit) => {
              if (hit.side === "request") {
                // 请求侧命中在左边编辑器里，直接让它滚过去
                onRevealRequest(hit.start);
                return;
              }
              setTab("raw");
              setRevealAt(hit.start);
            }}
          />
        ) : response.isBinary ? (
          <div className="h-full overflow-auto p-4">
            <p className="mb-3 font-mono text-[11.5px] text-accent-orangeSoft">
              二进制响应（{formatBytes(response.size)}），下面是按 UTF-8 强制解码的预览，导出图片时不会包含这段内容。
            </p>
            <pre className="whitespace-pre-wrap break-all font-mono text-[11.5px] leading-relaxed text-fg-dim">
              {response.bodyText.slice(0, 4000)}
            </pre>
          </div>
        ) : (
          <CodeEditor
            key={`${response.receivedAt}-${mode}`}
            value={mode === "pretty" && formatted ? formatted.text : response.bodyText}
            language={mode === "pretty" && formatted ? formatted.language : "plaintext"}
            readOnly
            fontSize={fontSize}
            fontFamily={fontFamily}
            theme={theme}
            onNotify={onNotify}
          />
        )}
      </div>

      {/* 底部一行：跳转提示 / 警告 */}
      {response && (response.redirectLocation || response.warnings.length > 0) ? (
        <div className="shrink-0 space-y-1 border-t border-ink-600 px-3 py-1.5">
          {response.redirectLocation ? (
            <p className="truncate font-mono text-[10.5px] text-accent-orangeSoft">
              302 → {response.redirectLocation}（未跟随）
            </p>
          ) : null}
          {response.warnings.map((w) => (
            <p key={w} className="truncate font-mono text-[10.5px] text-fg-mute">
              ! {w}
            </p>
          ))}
        </div>
      ) : null}

      <span className="sr-only">{statusLine}</span>
    </section>
  );
}

interface InfoRow {
  key: string;
  rule: string;
  group: string;
  color: HaeHit["color"];
  value: string;
  // 同样的规则命中同样的值，只显示一行，次数记着
  count: number;
  hits: HaeHit[];
}

interface RuleGroup {
  name: string;
  group: string;
  color: HaeHit["color"];
  rows: InfoRow[];
  count: number;
}

// 同规则 + 同值 = 一行
function dedupeHits(hits: HaeHit[]): InfoRow[] {
  const map = new Map<string, InfoRow>();
  for (const hit of hits) {
    const key = `${hit.rule}\u0000${hit.value}`;
    const cur = map.get(key);
    if (cur) {
      cur.count += 1;
      cur.hits.push(hit);
    } else {
      map.set(key, {
        key,
        rule: hit.rule,
        group: hit.group,
        color: hit.color,
        value: hit.value,
        count: 1,
        hits: [hit],
      });
    }
  }
  return Array.from(map.values());
}

// MarkInfo：照 Burp HaE 的样子，上排规则带命中次数
function MarkInfoPanel(props: {
  hits: HaeHit[];
  enabled: boolean;
  onNotify?: NotifyFn;
  onPick: (hit: HaeHit) => void;
  onEditHit: (hit: HaeHit, value: string) => void;
}) {
  const { hits, enabled, onNotify, onPick, onEditHit } = props;
  const [activeRule, setActiveRule] = useState<string>("__all__");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const infoRows = useMemo(() => dedupeHits(hits), [hits]);

  const groups = useMemo<RuleGroup[]>(() => {
    const map = new Map<string, RuleGroup>();
    for (const row of infoRows) {
      const cur = map.get(row.rule);
      if (cur) {
        cur.rows.push(row);
        cur.count += row.count;
      } else {
        map.set(row.rule, { name: row.rule, group: row.group, color: row.color, rows: [row], count: row.count });
      }
    }
    // 命中多的排前面，扫一眼就知道这条包最值得看什么
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [infoRows]);

  // 切到别的包时，之前选中的规则可能已经没有了
  useEffect(() => {
    if (activeRule !== "__all__" && !groups.some((g) => g.name === activeRule)) setActiveRule("__all__");
  }, [activeRule, groups]);

  // 报文一变，正在编辑的行也可能没了
  useEffect(() => {
    if (editing && !infoRows.some((row) => row.key === editing)) setEditing(null);
  }, [editing, infoRows]);

  const rows = useMemo(
    () => (activeRule === "__all__" ? infoRows : infoRows.filter((row) => row.rule === activeRule)),
    [activeRule, infoRows]
  );

  const handleCopy = (value: string) => {
    copyText(value)
      .then(() => onNotify?.("已复制"))
      .catch(() => onNotify?.("复制失败", "error"));
  };

  const commitEdit = (row: InfoRow) => {
    const next = draft;
    setEditing(null);
    if (next === row.value) return;
    // 请求侧能写回去
    onEditHit(row.hits[0], next);
  };

  if (!enabled) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="font-mono text-[12px] text-fg-mute">MarkInfo 已关闭</p>
        <p className="font-mono text-[10.5px] text-fg-mute/60">到设置里打开「HaE 规则高亮」就会重新标记</p>
      </div>
    );
  }

  if (hits.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="font-mono text-[12px] text-fg-mute">没有规则命中</p>
        <p className="font-mono text-[10.5px] text-fg-mute/60">
          规则集与 Burp HaE 3.3.4 一致，共 38 条 · 请求和响应两侧都算
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 规则 tab：全部 + 命中的规则，带次数，跟 HaE 的 MarkInfo 一样横着排 */}
      <div ref={listRef} className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-ink-600 px-2">
        <RuleChip
          active={activeRule === "__all__"}
          label="全部"
          count={hits.length}
          onClick={() => setActiveRule("__all__")}
        />
        {groups.map((group) => (
          <RuleChip
            key={group.name}
            active={activeRule === group.name}
            label={group.name}
            count={group.count}
            color={group.color}
            title={`${group.group} · ${group.count} 处`}
            onClick={() => setActiveRule(group.name)}
          />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse font-mono text-[11px]">
          <thead className="sticky top-0 z-10 bg-ink-800">
            <tr className="text-left text-fg-mute">
              <th className="w-[36px] border-b border-ink-600 px-2 py-1.5 text-center font-normal">#</th>
              <th className="border-b border-ink-600 px-2 py-1.5 font-normal">信息</th>
              <th className="w-[70px] border-b border-ink-600 px-2 py-1.5 font-normal">位置</th>
              <th className="w-[64px] border-b border-ink-600 px-2 py-1.5 text-right font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const hit = row.hits[0];
              const isEditing = editing === row.key;
              return (
                <tr key={row.key} className="group hover:bg-ink-700/60">
                  <td
                    className="cursor-pointer border-b border-ink-700 px-2 py-1.5 text-center text-fg-mute/70"
                    onClick={() => onPick(hit)}
                  >
                    {index + 1}
                  </td>
                  <td className="cursor-pointer border-b border-ink-700 px-2 py-1.5" onClick={() => onPick(hit)}>
                    <span className="flex items-start gap-2">
                      <span className={cx("mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full", `hae-dot-${row.color}`)} />
                      <span className="min-w-0 flex-1">
                        {isEditing ? (
                          <input
                            autoFocus
                            value={draft}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => commitEdit(row)}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === "Enter") commitEdit(row);
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="w-full rounded-sm border border-accent-green/70 bg-ink-900 px-1 py-[1px] font-mono text-[11px] text-fg"
                          />
                        ) : (
                          <span className="block truncate text-fg" title={row.value}>
                            {row.value || "（空）"}
                          </span>
                        )}
                        <span className="block truncate text-[10px] text-fg-mute/70">
                          {activeRule === "__all__" ? row.rule : row.group}
                          {row.count > 1 ? <span className="ml-1 text-accent-orangeSoft">×{row.count}</span> : null}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td
                    className="cursor-pointer border-b border-ink-700 px-2 py-1.5 text-fg-mute"
                    onClick={() => onPick(hit)}
                  >
                    {hit.side === "request" ? "请求" : "响应"}
                    <span className="ml-1 text-fg-mute/50">:{hit.line}</span>
                  </td>
                  <td className="border-b border-ink-700 px-2 py-1.5 text-right">
                    <span className="inline-flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        title="复制这个值"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(row.value);
                        }}
                        className="rounded-[2px] px-1 text-[10px] text-fg-mute hover:bg-ink-600 hover:text-fg"
                      >
                        复制
                      </button>
                      <button
                        type="button"
                        title={hit.side === "request" ? "改完直接写回请求报文" : "响应只读，改了没用"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDraft(row.value);
                          setEditing(row.key);
                        }}
                        className="rounded-[2px] px-1 text-[10px] text-fg-mute hover:bg-ink-600 hover:text-fg"
                      >
                        改
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="shrink-0 border-t border-ink-600 px-3 py-1.5 text-[10.5px] text-fg-mute/60">
        共 {groups.length} 条规则、{hits.length} 处命中（去重后 {infoRows.length} 行）· 点一行跳到报文对应位置
      </div>
    </div>
  );
}

function RuleChip(props: {
  active: boolean;
  label: string;
  count: number;
  color?: HaeHit["color"];
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      className={cx(
        "relative shrink-0 whitespace-nowrap px-2.5 py-2 font-mono text-[11.5px] transition-colors",
        props.active ? "text-fg" : "text-fg-mute hover:text-fg-dim"
      )}
    >
      <span className="flex items-center gap-1.5">
        {props.color ? <span className={cx("h-1.5 w-1.5 rounded-full", `hae-dot-${props.color}`)} /> : null}
        {props.label}
        <span className={cx("text-[10px]", props.active ? "text-accent-orangeSoft" : "text-fg-mute/60")}>({props.count})</span>
      </span>
      {props.active ? <span className="absolute inset-x-1.5 bottom-0 h-[2px] bg-accent-orange" /> : null}
    </button>
  );
}

function TabButton(props: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cx(
        "rounded-sm px-2.5 py-1 font-mono text-[11.5px] transition-colors",
        props.active ? "bg-ink-700 text-fg" : "text-fg-mute hover:text-fg"
      )}
    >
      {props.children}
    </button>
  );
}

function ToggleButton(props: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cx(
        "rounded-[2px] px-2 py-[3px] font-mono text-[10.5px] transition-colors",
        props.active ? "bg-accent-green text-white" : "text-fg-mute hover:text-fg",
        props.disabled && "cursor-not-allowed opacity-30 hover:text-fg-mute"
      )}
    >
      {props.children}
    </button>
  );
}
