// 主题色板：截图、状态码这类要拿具体色值的地方用它
import type { HaeColor, Theme } from "../types";

export type { Theme };

interface ThemeInk {
  // 卡片底色
  card: string;
  // 代码块底色
  code: string;
  border: string;
  fg: string;
  fgDim: string;
  fgMute: string;
  fgFaint: string;
  // 请求/响应头名字（参考图里是深蓝 #000075）
  headerName: string;
  // 请求/响应头值
  headerValue: string;
  accentGreen: string;
  accentOrange: string;
  accentRed: string;
  accentBlue: string;
  method: Record<string, string>;
  status: { ok: string; redirect: string; client: string; server: string };
  hae: Record<HaeColor, string>;
  // monaco 主题 id
  monaco: string;
  // 截图背景，给 modern-screenshot 用，绝不能是 transparent
  background: string;
}

export const THEMES: Record<Theme, ThemeInk> = {
  dark: {
    card: "#1E1E1E",
    code: "#161616",
    border: "#2A2A2A",
    fg: "#D4D4D4",
    fgDim: "#9A9A9A",
    fgMute: "#6E6E6E",
    fgFaint: "#5A5A5A",
    headerName: "#9CDCFE",
    headerValue: "#9A9A9A",
    accentGreen: "#2E7D32",
    accentOrange: "#E65100",
    accentRed: "#F14C4C",
    accentBlue: "#4FC1FF",
    method: {
      GET: "#4EC9B0",
      POST: "#CE9178",
      PUT: "#4FC1FF",
      PATCH: "#4FC1FF",
      DELETE: "#F14C4C",
    },
    status: { ok: "#4EC9B0", redirect: "#CE9178", client: "#E65100", server: "#F14C4C" },
    hae: {
      red: "#F48771",
      orange: "#F0A05A",
      yellow: "#DCDCAA",
      green: "#4EC9B0",
      cyan: "#4FC1FF",
      magenta: "#C586C0",
      pink: "#FF7EB6",
      gray: "#BDBDBD",
    },
    monaco: "fp-dark",
    background: "#1E1E1E",
  },
  light: {
    // 亮色：色值从参考图吸出来，白底 #FBFBFB
    card: "#FFFFFF",
    code: "#FBFBFB",
    border: "#DFDFDF",
    fg: "#202020",
    fgDim: "#4B4B4B",
    fgMute: "#787878",
    fgFaint: "#A0A0A0",
    headerName: "#000075",
    headerValue: "#26649D",
    accentGreen: "#2E7D32",
    accentOrange: "#B0361E",
    accentRed: "#A01010",
    accentBlue: "#26649D",
    method: {
      GET: "#0E6B4F",
      POST: "#B0361E",
      PUT: "#26649D",
      PATCH: "#26649D",
      DELETE: "#A01010",
    },
    status: { ok: "#0E6B4F", redirect: "#8A5A00", client: "#B0361E", server: "#A01010" },
    hae: {
      red: "#A01010",
      orange: "#B0361E",
      yellow: "#7A6B00",
      green: "#0E6B4F",
      cyan: "#0B5C78",
      magenta: "#8B1D8B",
      pink: "#A81F63",
      gray: "#5A5A5A",
    },
    monaco: "fp-light",
    background: "#FFFFFF",
  },
};
