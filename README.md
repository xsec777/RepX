# RepX (Repeater-X)

> **下一代轻量级 AI-Native HTTP 重放与流量审计工作台**  
> 专为白帽子与 AI 协同设计的极简渗透利器。摆脱 Burp Suite 的臃肿笨重，还原最纯粹的 Repeater + History 体验。

[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)](#)
[![Rust](https://img.shields.io/badge/Rust-reqwest-orange.svg)](#)
[![Tauri 2](https://img.shields.io/badge/Tauri-2.x-24C8DB.svg)](#)
[![React 18](https://img.shields.io/badge/React-18-61DAFB.svg)](#)
[![Monaco Editor](https://img.shields.io/badge/Editor-Monaco-blueviolet.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## ⚡ 为什么选择 RepX？

在使用传统 Burp Suite 进行渗透测试或接口复现时，我们经常遇到以下痛点：
1. **庞大臃肿**：JVM 动辄侵占 2GB~4GB 内存，冷启动等待 15~30 秒；
2. **多目标串包**：所有流量混在一个全局临时历史中，测试完系统 A 换到系统 B 容易串包；
3. **对 AI 极不友好**：传统工具难以程序化高效调用，直接抛回几十 KB 的 HTML 容易撑爆大模型 Token 上下文。

**RepX** 专为解决上述痛点而生：
- **极速轻量**：基于 Rust + Tauri 2.0 + React 18 构建，启动仅需 0.5 秒，内存开销仅 ~30MB；
- **Burp 风格项目向导**：每个项目对应一个专属的 SQLite 文件（`.repx`），换目标即换库，彻底杜绝串库；
- **双主视图架构**：
  - **工作台 (Repeater)**：支持多 Tab 并行测试，Tab 状态随项目自动保存，重启无损还原；
  - **历史流量 (History)**：全宽 Burp 经典大表格，状态码快速过滤，上下联动查看原始报文，支持 `Ctrl+R`（Send to Repeater）一键克隆回工作台；
- **AI 原生双通道**：内置本地 REST API（`127.0.0.1:18080`）与原生 MCP stdio 服务，AI 调用的包与人工发的包共享当前项目流量池。

---

## 🌟 核心功能特性

### 1. 报文直发与网络内核（Rust reqwest）
* **纯正原始报文**：首行写方法与路径，`Host` 自由伪造，不受浏览器 CORS 限制；
* **严格不跟随 30x 跳转**：保护 302 响应与 `Location` 原样返回，方便排查未授权与 SSRF；
* **TLS 全放行**：自签名、过期、内网证书一律放行；
* **独立 Cookie Jar**：自动管理当前项目的 Cookie，支持一键清空；
* **上游代理**：支持串联 HTTP 与 Socks5 代理。

### 2. Burp 风格历史大表格 (History)
* 上部为标准流量表格（`#`、`时间`、`Method`、`Host`、`Path`、`Status`、`长度`、`耗时`、`MIME`）；
* 快捷状态码过滤按钮（`ALL`、`2xx`、`3xx`、`4xx`、`5xx`）与全字段搜索；
* 下部 Request/Response 原文上下分栏联动预览；
* 选中任意历史包按 **`Ctrl+R`** 直接发送到 Repeater 开新 Tab 重放。

### 3. 工作台多标签管理 (Repeater Tabs)
* 支持多个 Tab 标签页并行对比发包；
* 双击 Tab 标题快速重命名，快捷键 `Ctrl+T` 新建标签、`Ctrl+W` 关闭标签；
* 所有 Tab 及其当前编辑的报文、响应结果实时持久化入项目的 `.repx` 数据库，下次打开项目完好无损。

### 4. 报告级高清卡片截图
* 快捷键 **`Ctrl+Shift+C`**：把请求区 + 响应区抓取成带元数据水印（Method、URL、状态码、耗时、大小、时间戳）的高清 PNG；
* 直接存入系统剪贴板，微信/钉钉/Markdown 报告即贴即用；
* 快捷键 **`Ctrl+Shift+S`**：一键导出 PNG 文件并在 Windows 资源管理器中高亮定位。

### 5. 原生内置 HaE（敏感情报高亮）
* 内置 38 条主流渗透实战正则规则（Shiro `rememberMe`、JWT、Swagger、Druid、云 AK、身份证、手机号等）；
* 命中内容直接在 Monaco 编辑器报文中彩色高亮，并在 MarkInfo 面板中精确定位行列。

---

## 🤖 AI 双通道接入指南

RepX 支持被 AI Agent（如 Claude Desktop、Cursor、ZCode）或 Python 渗透脚本直接调用：

### 通道 A：本地 REST API（默认监听 `http://127.0.0.1:18080`）
启动 RepX 桌面端后，后台自动开启本地 REST 服务：

* **发包接口**：
  ```bash
  curl -X POST http://127.0.0.1:18080/api/packet/send \
    -H "Content-Type: application/json" \
    -d '{
      "raw_http": "POST /api/login HTTP/1.1\nHost: target.com\nContent-Type: application/json\n\n{\"user\":\"admin\"}"
    }'
  ```
  *返回包含状态码、耗时、安全截断 Body 预览，并自动落库触发桌面 UI 刷新。*

* **调阅历史**：
  ```bash
  curl "http://127.0.0.1:18080/api/history?status=500&limit=20"
  ```

* **查看单包完整详情**：
  ```bash
  curl "http://127.0.0.1:18080/api/packet/1"
  ```

### 通道 B：MCP Server 模式（stdio）
配置在任意 MCP 宿主（如 `claude_desktop_config.json` 或 Cursor MCP）中：
```json
{
  "mcpServers": {
    "repx": {
      "command": "<RepX目录>\\src-tauri\\target\\release\\repx.exe",
      "args": ["--mcp"]
    }
  }
}
```
详见 [AI_INTEGRATION.md](./AI_INTEGRATION.md)。

---

## ⌨️ 常用快捷键

| 快捷键 | 功能操作 |
|---|---|
| `Ctrl + Enter` | 发送当前请求报文 |
| `Ctrl + T` | 新建工作台标签页 (New Tab) |
| `Ctrl + W` | 关闭当前工作台标签页 (Close Tab) |
| `Ctrl + R` | 在历史视图中，将选中的历史包克隆发送到 Repeater |
| `Ctrl + Shift + C` | 生成报告级高清卡片截图并复制到剪贴板 |
| `Ctrl + Shift + S` | 导出 PNG 截图并在资源管理器中定位 |
| `选中文本 + 右键` | 快速编解码（URL / Base64 / Hex / Unicode / HTML） |

---

## 🛠️ 构建与编译运行

### 运行环境要求
* Windows 10/11（内置系统 WebView2）
* [Node.js](https://nodejs.org) 18+
* [Rust](https://rustup.rs) stable 与 VS C++ Build Tools

### 1. 开发调试
```bash
npm install
npm run tauri dev
```

### 2. 编译生产单文件（免安装版）
```bash
npx tauri build --no-bundle
```
编译产物位于 `src-tauri/target/release/repx.exe`，单文件大小约 **7.9MB**，双击即开即用！

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源。
