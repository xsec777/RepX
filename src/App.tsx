import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type {
  ActiveView,
  AppSettings,
  HaeHit,
  HttpResponseData,
  ProjectInfo,
  Scheme,
  TabItem,
} from "./types";
import {
  DEFAULT_REQUEST_TEXT,
  ensureMethodDefaults,
  looksLikeBareHost,
  parseRequestText,
  setRequestMethod,
  setRequestUrl,
  splitAbsoluteUrl,
  toAbsoluteUrl,
  toCurl,
  upsertHostHeader,
} from "./lib/http";
import { runHaeSide } from "./lib/hae";
import { loadSettings, saveSettings } from "./lib/history";
import {
  appMeta,
  getCurrentProject,
  loadProjectTabs,
  saveProjectTabs,
  sendHttpRequest,
} from "./lib/api";
import { captureRegion, copyPngToClipboard, exportPng } from "./lib/capture";
import { THEMES } from "./lib/theme";
import { ImportCurlDialog } from "./components/ImportCurlDialog";
import { copyText } from "./lib/utils";
import { TopBar } from "./components/TopBar";
import { SplitPane } from "./components/SplitPane";
import { RequestPanel } from "./components/RequestPanel";
import { ResponsePanel } from "./components/ResponsePanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { ProjectDialog } from "./components/ProjectDialog";
import { HistoryView } from "./components/HistoryView";
import { TabBar } from "./components/TabBar";
import { Toast } from "./components/Toast";

interface ToastState {
  id: number;
  text: string;
  tone: "ok" | "error";
}

function statusInkOf(theme: "dark" | "light", status: number): string {
  const ink = THEMES[theme].status;
  if (status >= 500) return ink.server;
  if (status >= 400) return ink.client;
  if (status >= 300) return ink.redirect;
  return ink.ok;
}

export default function App() {
  // 主视图状态：工作台 (Repeater) vs 历史流量 (History)
  const [activeView, setActiveView] = useState<ActiveView>("repeater");

  // 项目元信息与弹窗
  const [currentProject, setCurrentProject] = useState<ProjectInfo | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  // 工作台多标签管理 (与当前项目 SQLite 实时同步)
  const [tabs, setTabs] = useState<TabItem[]>([
    {
      id: "tab-default",
      title: "Tab 1",
      requestText: DEFAULT_REQUEST_TEXT,
      responseData: null,
      position: 0,
      updatedAt: Date.now(),
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>("tab-default");

  // 当前活动 Tab 的数据快捷计算
  const activeTab = useMemo(() => {
    return tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  }, [tabs, activeTabId]);

  const rawText = activeTab?.requestText ?? DEFAULT_REQUEST_TEXT;
  const currentResponse: HttpResponseData | null = useMemo(() => {
    if (!activeTab?.responseData) return null;
    try {
      return JSON.parse(activeTab.responseData);
    } catch {
      return null;
    }
  }, [activeTab]);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shotBusy, setShotBusy] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [version, setVersion] = useState("1.0.0");
  const [restUrl, setRestUrl] = useState("http://127.0.0.1:18080");
  const [schemeOverride, setSchemeOverride] = useState<Scheme | null>(null);
  const [requestRevealAt, setRequestRevealAt] = useState<number | null>(null);

  const splitRef = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => parseRequestText(rawText), [rawText]);
  const absoluteUrl = useMemo(
    () => toAbsoluteUrl(parsed.url, parsed.headers, schemeOverride ?? settings.defaultScheme),
    [parsed, schemeOverride, settings.defaultScheme]
  );

  const requestMarks = useMemo(
    () => (settings.haeEnabled ? runHaeSide(rawText, "request") : []),
    [rawText, settings.haeEnabled]
  );

  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("set_window_theme", { theme: settings.theme }))
      .catch(() => undefined);
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--fp-font", settings.fontFamily);
  }, [settings.fontFamily]);

  // 初始化加载当前项目元信息与 Tabs
  const reloadProjectData = useCallback(() => {
    getCurrentProject()
      .then((info) => {
        setCurrentProject(info);
        return loadProjectTabs();
      })
      .then((loadedTabs) => {
        if (loadedTabs && loadedTabs.length > 0) {
          setTabs(loadedTabs);
          setActiveTabId(loadedTabs[0].id);
        } else {
          const initTab: TabItem = {
            id: `tab-${Date.now()}`,
            title: "Tab 1",
            requestText: DEFAULT_REQUEST_TEXT,
            responseData: null,
            position: 0,
            updatedAt: Date.now(),
          };
          setTabs([initTab]);
          setActiveTabId(initTab.id);
          void saveProjectTabs([initTab]);
        }
      })
      .catch((err) => {
        console.error("加载项目数据失败:", err);
      });
  }, []);

  useEffect(() => {
    appMeta()
      .then((meta) => {
        setVersion(meta.version);
        setRestUrl(meta.restUrl);
      })
      .catch(() => undefined);

    reloadProjectData();

    // 监听 Rust 后端项目切换事件
    let unlistenSwitch: (() => void) | undefined;
    listen<ProjectInfo>("repx://project-switched", (event) => {
      setCurrentProject(event.payload);
      reloadProjectData();
      notify(`已切换至项目: ${event.payload.name}`);
    }).then((un) => {
      unlistenSwitch = un;
    });

    return () => {
      if (unlistenSwitch) unlistenSwitch();
    };
  }, [reloadProjectData, notify]);

  // 防抖持久化 Tabs，避免每次按键都触发 SQLite 全量落盘
  const saveDebounceRef = useRef<number | null>(null);
  const debouncedSaveTabs = useCallback((tabsToSave: TabItem[]) => {
    if (saveDebounceRef.current) {
      window.clearTimeout(saveDebounceRef.current);
    }
    saveDebounceRef.current = window.setTimeout(() => {
      void saveProjectTabs(tabsToSave);
      saveDebounceRef.current = null;
    }, 400);
  }, []);

  // 更新当前活跃 Tab 的请求内容
  const updateCurrentRawText = useCallback(
    (newText: string) => {
      setTabs((prev) => {
        const next = prev.map((t) =>
          t.id === activeTabId ? { ...t, requestText: newText, updatedAt: Date.now() } : t
        );
        debouncedSaveTabs(next);
        return next;
      });
    },
    [activeTabId, debouncedSaveTabs]
  );

  // Tab 操作方法
  const handleAddTab = useCallback(() => {
    setTabs((prev) => {
      const newId = `tab-${Date.now()}`;
      const newTab: TabItem = {
        id: newId,
        title: `Tab ${prev.length + 1}`,
        requestText: DEFAULT_REQUEST_TEXT,
        responseData: null,
        position: prev.length,
        updatedAt: Date.now(),
      };
      const next = [...prev, newTab];
      setActiveTabId(newId);
      void saveProjectTabs(next);
      return next;
    });
  }, []);

  const handleCloseTab = useCallback(
    (closeId: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((t) => t.id !== closeId);
        if (activeTabId === closeId) {
          setActiveTabId(next[0].id);
        }
        void saveProjectTabs(next);
        return next;
      });
    },
    [activeTabId]
  );

  const handleRenameTab = useCallback((id: string, newTitle: string) => {
    setTabs((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, title: newTitle } : t));
      void saveProjectTabs(next);
      return next;
    });
  }, []);

  // 从历史记录或者外部将报文推送到工作台 (Ctrl+R)
  const handleSendToRepeater = useCallback((requestText: string, title?: string) => {
    setTabs((prev) => {
      const newId = `tab-${Date.now()}`;
      const newTab: TabItem = {
        id: newId,
        title: title || `Req ${prev.length + 1}`,
        requestText,
        responseData: null,
        position: prev.length,
        updatedAt: Date.now(),
      };
      const next = [...prev, newTab];
      setActiveTabId(newId);
      void saveProjectTabs(next);
      return next;
    });
    setActiveView("repeater");
  }, []);

  // 发包
  const doSend = useCallback(async () => {
    if (busy) return;

    const req = parseRequestText(rawText);
    const url = toAbsoluteUrl(req.url, req.headers, schemeOverride ?? settings.defaultScheme);
    if (!/^https?:\/\//i.test(url)) {
      notify("URL 必须是 http(s) 绝对地址，或在请求头带上 Host", "error");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await sendHttpRequest(
        {
          method: req.method,
          url,
          headers: req.headers,
          body: req.body.trim() ? req.body : null,
          bodyBase64: null,
          proxy: settings.proxy.trim() || null,
          timeoutMs: settings.timeoutMs,
          followRedirects: settings.followRedirects,
          httpVersion: "auto",
        },
        rawText
      );

      // 将响应数据保存到当前活动 Tab，并同步到项目 SQLite
      setTabs((prev) => {
        const next = prev.map((t) =>
          t.id === activeTabId
            ? { ...t, responseData: JSON.stringify(res), updatedAt: Date.now() }
            : t
        );
        void saveProjectTabs(next);
        return next;
      });
      notify("发包成功并已落库");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    rawText,
    schemeOverride,
    settings.defaultScheme,
    settings.followRedirects,
    settings.proxy,
    settings.timeoutMs,
    activeTabId,
    notify,
  ]);

  // 截图生成
  const captureNow = useCallback(async (): Promise<Blob> => {
    const node = splitRef.current;
    if (!node) throw new Error("工作台未渲染");
    const ink = THEMES[settings.theme];
    return captureRegion(node, {
      background: ink.background,
      fontFamily: settings.fontFamily,
      fg: ink.fg,
      muted: ink.fgMute,
      maxWidth: 1500,
      maxHeight: 1000,
      meta: currentResponse
        ? {
            method: parsed.method,
            url: absoluteUrl,
            status: currentResponse.status,
            statusText: currentResponse.statusText,
            durationMs: currentResponse.durationMs,
            size: currentResponse.size,
            at: currentResponse.receivedAt,
            statusInk: statusInkOf(settings.theme, currentResponse.status),
            methodInk: ink.method[parsed.method.toUpperCase()] ?? ink.fgMute,
          }
        : undefined,
    });
  }, [absoluteUrl, currentResponse, parsed.method, settings.fontFamily, settings.theme]);

  const handleCopyImage = useCallback(async () => {
    if (shotBusy) return;
    setShotBusy(true);
    try {
      const blob = await captureNow();
      await copyPngToClipboard(blob);
      notify("已复制截图卡片到剪贴板");
    } catch (err) {
      notify(`复制图片失败：${String(err)}`, "error");
    } finally {
      setShotBusy(false);
    }
  }, [captureNow, notify, shotBusy]);

  const handleExportImage = useCallback(async () => {
    if (shotBusy) return;
    setShotBusy(true);
    try {
      const blob = await captureNow();
      const host = absoluteUrl.replace(/^https?:\/\//i, "").split("/")[0].replace(/[^\w.-]/g, "_");
      const name = `repx_${currentResponse?.status ?? 0}_${host || "resp"}_${Date.now()}.png`;
      const saved = await exportPng(blob, name);
      notify(saved ? `已导出截图并在资源管理器中定位` : "已取消保存");
    } catch (err) {
      notify(`导出图片失败：${String(err)}`, "error");
    } finally {
      setShotBusy(false);
    }
  }, [absoluteUrl, captureNow, currentResponse, notify, shotBusy]);

  const handleCopyBody = useCallback(() => {
    if (!currentResponse) return;
    copyText(currentResponse.bodyText)
      .then(() => notify("已复制响应体"))
      .catch(() => notify("复制失败", "error"));
  }, [notify, currentResponse]);

  const handleCopyCurl = useCallback(() => {
    const req = parseRequestText(rawText);
    copyText(
      toCurl({
        ...req,
        url: toAbsoluteUrl(req.url, req.headers, schemeOverride ?? settings.defaultScheme),
      })
    )
      .then(() => notify("已导出并复制为 cURL"))
      .catch(() => notify("复制失败", "error"));
  }, [notify, rawText, schemeOverride, settings.defaultScheme]);

  const handleEditHit = useCallback(
    (hit: HaeHit, value: string) => {
      if (hit.side === "response") {
        notify("响应报文只读；已复制该值", "error");
        void copyText(hit.value);
        return;
      }
      updateCurrentRawText(
        `${rawText.slice(0, hit.start)}${value}${rawText.slice(hit.end)}`
      );
      notify("已写回当前请求报文");
    },
    [notify, rawText, updateCurrentRawText]
  );

  // 全局快捷键：Ctrl+Enter 发包，Ctrl+T 新标签，Ctrl+W 关标签
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "Enter") {
        e.preventDefault();
        void doSend();
      } else if (e.key.toLowerCase() === "t") {
        e.preventDefault();
        handleAddTab();
      } else if (e.key.toLowerCase() === "w" && activeView === "repeater") {
        e.preventDefault();
        handleCloseTab(activeTabId);
      } else if (e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void handleCopyImage();
      } else if (e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleExportImage();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doSend, handleAddTab, handleCloseTab, handleCopyImage, handleExportImage, activeTabId, activeView]);

  const handleUrlBarChange = useCallback(
    (input: string) => {
      const absolute = splitAbsoluteUrl(input);
      if (absolute) {
        setSchemeOverride(absolute.scheme);
        updateCurrentRawText(upsertHostHeader(setRequestUrl(rawText, absolute.path), absolute.host));
        return;
      }
      if (looksLikeBareHost(input)) {
        const hostPart = input.trim().split(/[/?#]/)[0];
        const rest = input.trim().slice(hostPart.length) || "/";
        updateCurrentRawText(
          upsertHostHeader(
            setRequestUrl(rawText, rest.startsWith("/") ? rest : `/${rest}`),
            hostPart
          )
        );
        return;
      }
      updateCurrentRawText(setRequestUrl(rawText, input.trim() || "/"));
    },
    [rawText, updateCurrentRawText]
  );

  const headersCount = parsed.headers.length;

  return (
    <div className="flex h-full flex-col bg-ink-900 text-fg-main font-sans">
      {/* 顶部主导航栏 */}
      <TopBar
        activeView={activeView}
        onViewChange={setActiveView}
        currentProject={currentProject}
        onOpenProjectDialog={() => setProjectDialogOpen(true)}
        method={parsed.method}
        url={absoluteUrl}
        requestLineUrl={parsed.url}
        busy={busy}
        canExport={!!currentResponse && !shotBusy}
        onMethodChange={(method) =>
          updateCurrentRawText(ensureMethodDefaults(setRequestMethod(rawText, method), method))
        }
        onUrlChange={handleUrlBarChange}
        onSend={doSend}
        onCopyImage={handleCopyImage}
        onExportImage={handleExportImage}
        onOpenSettings={() => setSettingsOpen(true)}
        onImportCurl={() => setImportOpen(true)}
        theme={settings.theme}
        onToggleTheme={() =>
          setSettings((prev) => ({
            ...prev,
            theme: prev.theme === "dark" ? "light" : "dark",
          }))
        }
      />

      {/* 主视图区域：按视图切换 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {activeView === "repeater" ? (
          <div className="flex h-full flex-col overflow-hidden">
            {/* 工作台多标签栏 */}
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={setActiveTabId}
              onAddTab={handleAddTab}
              onCloseTab={handleCloseTab}
              onRenameTab={handleRenameTab}
            />

            {/* 编辑区与响应区左右分栏 */}
            <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <SplitPane
                left={
                  <RequestPanel
                    value={rawText}
                    fontSize={settings.fontSize}
                    fontFamily={settings.fontFamily}
                    onChange={updateCurrentRawText}
                    marks={requestMarks}
                    revealAt={requestRevealAt}
                    onNotify={notify}
                    theme={settings.theme}
                    onCopyCurl={handleCopyCurl}
                    onResetTemplate={() => updateCurrentRawText(DEFAULT_REQUEST_TEXT)}
                  />
                }
                right={
                  <ResponsePanel
                    response={currentResponse}
                    error={error}
                    busy={busy}
                    fontSize={settings.fontSize}
                    fontFamily={settings.fontFamily}
                    requestHits={requestMarks}
                    haeEnabled={settings.haeEnabled}
                    onCopyBody={handleCopyBody}
                    onRevealRequest={setRequestRevealAt}
                    onNotify={notify}
                    theme={settings.theme}
                    onEditHit={handleEditHit}
                  />
                }
              />
            </div>
          </div>
        ) : (
          <HistoryView
            theme={settings.theme}
            fontSize={settings.fontSize}
            fontFamily={settings.fontFamily}
            onSendToRepeater={handleSendToRepeater}
            onNotify={notify}
          />
        )}
      </div>

      {/* 底部状态栏 */}
      <footer className="flex h-7 shrink-0 items-center justify-between border-t border-ink-600 bg-ink-800 px-3 font-mono text-[11px] text-fg-mute select-none">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-fg-main">RepX v{version}</span>
          <span className="text-ink-500">|</span>
          <span className="text-accent">{restUrl}</span>
          <span className="text-ink-500">|</span>
          <span>{currentProject ? `项目: ${currentProject.name}` : "未载入项目"}</span>
          <span className="text-ink-500">|</span>
          <span>{headersCount} 个请求头</span>
          <span className="text-ink-500">|</span>
          <span className={requestMarks.length > 0 ? "text-accent-orangeSoft font-semibold" : undefined}>
            HaE {settings.haeEnabled ? `命中 ${requestMarks.length}` : "已关闭"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>{settings.proxy ? `代理 ${settings.proxy}` : "直连"}</span>
          <span className="text-ink-500">|</span>
          <span>30x {settings.followRedirects ? "跟随时限10" : "严格不跟随"}</span>
          <span className="text-ink-500">|</span>
          <span className="text-fg-dim">Ctrl+↵ 发送 · Ctrl+T 新标签</span>
        </div>
      </footer>

      {/* 弹窗集合 */}
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={(next) => {
            setSettings(next);
            setSettingsOpen(false);
          }}
          onLiveChange={(part) => {
            setSettings((prev) => ({ ...prev, ...part }));
          }}
        />
      )}

      {importOpen && (
        <ImportCurlDialog
          onClose={() => setImportOpen(false)}
          onImport={(importedRaw) => {
            updateCurrentRawText(importedRaw);
            notify("已成功导入 cURL 报文");
            setImportOpen(false);
          }}
          onNotify={notify}
        />
      )}

      <ProjectDialog
        open={projectDialogOpen}
        currentProject={currentProject}
        onClose={() => setProjectDialogOpen(false)}
        onProjectChanged={(info) => {
          setCurrentProject(info);
          reloadProjectData();
          notify(`当前活跃项目已切换为: ${info.name}`);
        }}
      />

      {toast && <Toast text={toast.text} tone={toast.tone} />}
    </div>
  );
}
