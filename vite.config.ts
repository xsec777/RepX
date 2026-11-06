import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 官方推荐配置：固定端口给 devUrl 用
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // 让 Tauri CLI 的输出不被 Vite 清屏冲掉
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    // Windows 上 WebView2 最低支持到 chrome105
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    chunkSizeWarningLimit: 6000,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
});
