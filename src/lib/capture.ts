// 截图：把屏幕上正在看的这一块抓成 PNG
import { domToBlob } from "modern-screenshot";
import { writeImage } from "@tauri-apps/plugin-clipboard-manager";
import { Image } from "@tauri-apps/api/image";
import { save } from "@tauri-apps/plugin-dialog";
import { revealInExplorer, saveBinaryFile } from "./api";
import { formatBytes, formatClock } from "./utils";

export interface CaptureMeta {
  method: string;
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  size: number;
  at: number;
  // 状态码颜色，跟着主题走
  statusInk: string;
  // 徽标颜色
  methodInk: string;
}

interface CaptureOptions {
  // 2 倍图，贴到报告里不糊
  pixelRatio?: number;
  // 底色，跟随主题：暗色 #1E1E1E / 亮色 #FFFFFF
  background?: string;
  // 顶部元数据带
  meta?: CaptureMeta;
  // 正文/元数据字体
  fontFamily?: string;
  // 文字颜色（画元数据带用）
  fg?: string;
  muted?: string;
  // 再大的窗口也只截这么宽，超出部分裁掉
  maxWidth?: number;
  // 高度上限，兜底防止某些情况把整页抓下来
  maxHeight?: number;
}

const DEFAULT_MAX_WIDTH = 1500;
const DEFAULT_MAX_HEIGHT = 1000;
const HEADER_HEIGHT = 30;

// 等两帧：一帧让 React 提交，一帧让 Monaco / 浏览器把绘制排完
function waitForPaint(): Promise<void> {
  const frames = new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
  const fallback = new Promise<void>((resolve) => window.setTimeout(resolve, 120));
  return Promise.race([frames, fallback]);
}

// 把回调让给空闲时间，别和主线程抢
function waitForIdle(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    if (typeof ric === "function") ric(() => resolve(), { timeout: 200 });
    else window.setTimeout(resolve, 16);
  });
}

// 把指定 DOM 节点按可见尺寸渲染成 PNG Blob
export async function captureRegion(node: HTMLElement, options: CaptureOptions = {}): Promise<Blob> {
  const scale = options.pixelRatio ?? 2;
  const background = options.background ?? "#1E1E1E";

  const box = node.getBoundingClientRect();
  const width = Math.min(Math.round(box.width), options.maxWidth ?? DEFAULT_MAX_WIDTH);
  const height = Math.min(Math.round(box.height), options.maxHeight ?? DEFAULT_MAX_HEIGHT);
  if (width < 40 || height < 40) throw new Error("面板还没渲染出来，稍等一下再截图");

  await waitForPaint();

  const raw = await domToBlob(node, {
    scale,
    backgroundColor: background,
    width,
    height,
    // 只截这块矩形，超出容器的滚动内容不参与渲染
    style: { transform: "none", margin: "0" },
  });
  if (!raw) throw new Error("节点渲染成图片失败");

  await waitForIdle();

  if (!options.meta) return raw;
  return drawMetaHeader(raw, options.meta, {
    scale,
    background,
    fg: options.fg ?? "#202020",
    muted: options.muted ?? "#787878",
    fontFamily: options.fontFamily ?? "Consolas, monospace",
  });
}

// 在图片顶部画一条元数据带：左边方法 + URL，右边状态码 / 耗时 / 大小 / 时间
async function drawMetaHeader(
  imageBlob: Blob,
  meta: CaptureMeta,
  ink: { scale: number; background: string; fg: string; muted: string; fontFamily: string }
): Promise<Blob> {
  const bitmap = await createImageBitmap(imageBlob);
  const headerH = Math.round(HEADER_HEIGHT * ink.scale);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height + headerH;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return imageBlob;
  }

  ctx.fillStyle = ink.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, headerH);
  bitmap.close();

  const pad = Math.round(10 * ink.scale);
  const font = Math.round(11.5 * ink.scale);

  // 左边：方法徽标 + 完整 URL
  ctx.font = `600 ${font}px ${ink.fontFamily}`;
  const badge = meta.method.toUpperCase();
  const badgeW = ctx.measureText(badge).width + Math.round(12 * ink.scale);
  ctx.fillStyle = `${meta.methodInk}1F`;
  ctx.fillRect(pad, pad - Math.round(2 * ink.scale), badgeW, headerH - pad * 1.4);
  ctx.fillStyle = meta.methodInk;
  ctx.fillText(badge, pad + Math.round(6 * ink.scale), Math.round(headerH / 2 + font / 3));

  // 右边先算宽度，剩下的空间留给 URL，超了就截断
  ctx.font = `${font}px ${ink.fontFamily}`;
  const right = `${meta.status} ${meta.statusText || ""}`.trim();
  const rightMeta = `${meta.durationMs} ms · ${formatBytes(meta.size)} · ${formatClock(meta.at)}`;
  const rightW = ctx.measureText(right).width + Math.round(10 * ink.scale) + ctx.measureText(rightMeta).width;
  const maxUrlW = canvas.width - pad * 3 - badgeW - rightW;

  let url = meta.url;
  while (url.length > 8 && ctx.measureText(url).width > maxUrlW) {
    url = `${url.slice(0, url.length - 12)}…`;
  }

  ctx.fillStyle = ink.fg;
  ctx.fillText(url, pad + badgeW + Math.round(8 * ink.scale), Math.round(headerH / 2 + font / 3));

  let cursor = canvas.width - rightW - pad;
  ctx.fillStyle = meta.statusInk;
  ctx.font = `700 ${font}px ${ink.fontFamily}`;
  ctx.fillText(right, cursor, Math.round(headerH / 2 + font / 3));
  cursor += ctx.measureText(right).width + Math.round(10 * ink.scale);
  ctx.font = `${font}px ${ink.fontFamily}`;
  ctx.fillStyle = ink.muted;
  ctx.fillText(rightMeta, cursor, Math.round(headerH / 2 + font / 3));

  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
  // 手动画完就别留着这块 canvas 占内存了
  canvas.width = 0;
  canvas.height = 0;
  return out ?? imageBlob;
}

// PNG → RGBA，给 Tauri 剪贴板插件用
async function blobToRgba(blob: Blob): Promise<{ rgba: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("当前环境拿不到 canvas 上下文");
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height).data;
  bitmap.close();
  const rgba = new Uint8Array(imageData.buffer.slice(0));
  canvas.width = 0;
  canvas.height = 0;
  return { rgba, width, height };
}

// 复制图片到系统剪贴板：微信/钉钉里直接 Ctrl+V
export async function copyPngToClipboard(blob: Blob): Promise<void> {
  try {
    if (navigator.clipboard && typeof ClipboardItem !== "undefined" && "write" in navigator.clipboard) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return;
    }
  } catch {
    // 标准 API 被 WebView 拦了，落到插件方案
  }
  const { rgba, width, height } = await blobToRgba(blob);
  const image = await Image.new(rgba, width, height);
  await writeImage(image);
}

// 让资源管理器打开并选中文件
async function revealFile(path: string): Promise<void> {
  try {
    await revealInExplorer(path);
  } catch {
    // 定位失败不影响保存结果
  }
}

// 导出 PNG：系统保存框 → 写盘 → 资源管理器定位
export async function exportPng(blob: Blob, fileName: string): Promise<string | null> {
  const path = await save({
    defaultPath: fileName,
    filters: [{ name: "PNG 图片", extensions: ["png"] }],
  });
  if (!path) return null;
  const buffer = await blob.arrayBuffer();
  await saveBinaryFile(path, toBase64(new Uint8Array(buffer)));
  await revealFile(path);
  return path;
}

// 浏览器兜底下载：异步 + 及时回收 URL，别把 blob 挂在内存里
export async function downloadPngInBrowser(blob: Blob, fileName: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
