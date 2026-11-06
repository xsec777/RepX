import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { ProjectInfo } from "../types";
import { newDiskProject, openDiskProject, openTempProject } from "../lib/api";
import { IconClose, IconFolder } from "./Icons";

interface ProjectDialogProps {
  open: boolean;
  currentProject: ProjectInfo | null;
  onClose: () => void;
  onProjectChanged: (info: ProjectInfo) => void;
}

export function ProjectDialog({
  open: isOpen,
  currentProject,
  onClose,
  onProjectChanged,
}: ProjectDialogProps) {
  const [tab, setTab] = useState<"new" | "open" | "temp">("new");
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [openPath, setOpenPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // 浏览保存路径
  const handleBrowseSave = async () => {
    try {
      const selected = await save({
        filters: [{ name: "RepX 项目文件 (*.repx)", extensions: ["repx", "db"] }],
        defaultPath: newName ? `${newName}.repx` : "target_project.repx",
      });
      if (selected) {
        setNewPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 浏览打开路径
  const handleBrowseOpen = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "RepX 项目文件 (*.repx, *.db)", extensions: ["repx", "db"] }],
      });
      if (selected && typeof selected === "string") {
        setOpenPath(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      setError("请输入项目名称");
      return;
    }
    if (!newPath.trim()) {
      setError("请选择项目保存路径");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const info = await newDiskProject(newPath.trim(), newName.trim());
      onProjectChanged(info);
      onClose();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenExisting = async () => {
    if (!openPath.trim()) {
      setError("请选择要打开的 .repx 项目文件");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const info = await openDiskProject(openPath.trim());
      onProjectChanged(info);
      onClose();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemp = async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await openTempProject();
      onProjectChanged(info);
      onClose();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex w-[540px] flex-col rounded-lg border border-ink-600 bg-ink-800 shadow-2xl">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-ink-600 px-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tracking-wider text-fg-main">
              项目管理 (PROJECT WIZARD)
            </span>
            {currentProject && (
              <span className="rounded bg-accent/20 px-2 py-0.5 font-mono text-[11px] text-accent">
                当前: {currentProject.name}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-fg-mute transition hover:bg-ink-700 hover:text-fg-main"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-ink-600 bg-ink-900/40 px-4 pt-2">
          <button
            onClick={() => {
              setTab("new");
              setError(null);
            }}
            className={`border-b-2 px-3 py-2 font-mono text-xs font-medium transition ${
              tab === "new"
                ? "border-accent text-accent"
                : "border-transparent text-fg-mute hover:text-fg-main"
            }`}
          >
            新建磁盘项目
          </button>
          <button
            onClick={() => {
              setTab("open");
              setError(null);
            }}
            className={`border-b-2 px-3 py-2 font-mono text-xs font-medium transition ${
              tab === "open"
                ? "border-accent text-accent"
                : "border-transparent text-fg-mute hover:text-fg-main"
            }`}
          >
            打开已有项目
          </button>
          <button
            onClick={() => {
              setTab("temp");
              setError(null);
            }}
            className={`border-b-2 px-3 py-2 font-mono text-xs font-medium transition ${
              tab === "temp"
                ? "border-accent text-accent"
                : "border-transparent text-fg-mute hover:text-fg-main"
            }`}
          >
            临时测试项目
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5">
          {error && (
            <div className="mb-4 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-300">
              {error}
            </div>
          )}

          {tab === "new" && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block font-mono text-xs text-fg-mute">
                  项目名称 <span className="text-accent">*</span>
                </label>
                <input
                  type="text"
                  placeholder="如: 某证券网关渗透测试"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded border border-ink-500 bg-ink-900 px-3 py-2 font-mono text-xs text-fg-main outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="mb-1 block font-mono text-xs text-fg-mute">
                  存储路径 (*.repx) <span className="text-accent">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="选择存储文件路径"
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    className="flex-1 rounded border border-ink-500 bg-ink-900 px-3 py-2 font-mono text-xs text-fg-main outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleBrowseSave}
                    className="flex items-center gap-1 rounded border border-ink-500 bg-ink-700 px-3 py-2 font-mono text-xs text-fg-main hover:bg-ink-600"
                  >
                    <IconFolder className="h-3.5 w-3.5" /> 浏览...
                  </button>
                </div>
                <p className="mt-1 font-mono text-[11px] text-fg-mute">
                  每个项目独占一个 SQLite 数据库文件，彻底防串库，单文件方便归档。
                </p>
              </div>

              <div className="pt-2">
                <button
                  disabled={loading}
                  onClick={handleCreate}
                  className="w-full rounded bg-accent py-2 font-mono text-xs font-semibold text-ink-950 transition hover:bg-accent/90 disabled:opacity-50"
                >
                  {loading ? "创建中..." : "创建并进入项目"}
                </button>
              </div>
            </div>
          )}

          {tab === "open" && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block font-mono text-xs text-fg-mute">
                  选择项目文件 (*.repx / *.db)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="路径至已有的 .repx 文件"
                    value={openPath}
                    onChange={(e) => setOpenPath(e.target.value)}
                    className="flex-1 rounded border border-ink-500 bg-ink-900 px-3 py-2 font-mono text-xs text-fg-main outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleBrowseOpen}
                    className="flex items-center gap-1 rounded border border-ink-500 bg-ink-700 px-3 py-2 font-mono text-xs text-fg-main hover:bg-ink-600"
                  >
                    <IconFolder className="h-3.5 w-3.5" /> 选择文件...
                  </button>
                </div>
                <p className="mt-1 font-mono text-[11px] text-fg-mute">
                  打开后将秒级恢复该项目的所有发包历史与之前打开的工作台标签页。
                </p>
              </div>

              <div className="pt-2">
                <button
                  disabled={loading}
                  onClick={handleOpenExisting}
                  className="w-full rounded bg-accent py-2 font-mono text-xs font-semibold text-ink-950 transition hover:bg-accent/90 disabled:opacity-50"
                >
                  {loading ? "载入中..." : "载入项目"}
                </button>
              </div>
            </div>
          )}

          {tab === "temp" && (
            <div className="space-y-4">
              <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 font-mono text-xs text-amber-300">
                临时项目使用系统 Temp 目录的临时 SQLite 数据库，关闭软件后不会在桌面留下归档文件，适合即开即测的轻量调试。
              </div>

              <div className="pt-2">
                <button
                  disabled={loading}
                  onClick={handleCreateTemp}
                  className="w-full rounded border border-ink-500 bg-ink-700 py-2 font-mono text-xs font-semibold text-fg-main transition hover:bg-ink-600 disabled:opacity-50"
                >
                  {loading ? "切换中..." : "开启全新临时项目"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
