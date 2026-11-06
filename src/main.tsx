import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
// 必须在渲染前完成 Monaco 的 worker 与主题注册
import "./lib/monacoSetup";
import { loadSettings } from "./lib/history";

// 首帧就把主题写进 <html>，避免亮色主题启动闪一下深色
document.documentElement.dataset.theme = loadSettings().theme;

const root = document.getElementById("root");
if (!root) throw new Error("找不到 #root 挂载点");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
