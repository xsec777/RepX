# RepX AI 与自动化程序接入指南

本文档介绍如何将 **RepX** 作为极速发包引擎与流量审计后端，无缝接入各类大语言模型 Agent（Claude Desktop、Cursor、ZCode、Windsurf）以及 Python 渗透测试自动化脚本。

---

## 模式一：作为 MCP Server 接入（推荐用于大模型 Agent）

RepX 内置原生的 Model Context Protocol（MCP）stdio JSON-RPC 2.0 服务端。AI Agent 调用 RepX 工具发包时，底层会自动落库到 RepX 当前项目的 SQLite 数据库中，完全解耦且零 Token 污染。

### 1. 编译生成二进制
确保已编译出 `repx.exe`：
```bash
cd <你的 RepX 目录>
npm run tauri build -- --no-bundle
```
产物位置：`<你的 RepX 目录>\src-tauri\target\release\repx.exe`。

### 2. 宿主 Agent 配置文件

#### (1) Claude Desktop (`claude_desktop_config.json`)
文件路径：`%APPDATA%\Claude\claude_desktop_config.json`
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

#### (2) Cursor (`.cursor/mcp.json` 或 Settings -> MCP)
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

#### (3) ZCode 插件或自定义 MCP 配置
```json
{
  "name": "repx",
  "command": "<RepX目录>\\src-tauri\\target\\release\\repx.exe",
  "args": ["--mcp"]
}
```

### 3. AI 可用的 4 个原子工具

| 工具名称 | 作用 | 核心参数 |
|---|---|---|
| `repx_send_packet` | 发送原始 Burp 格式 HTTP 报文，自动持久化入库，并返回安全截断摘要（防 Token 爆炸） | `raw_http` (必填), `timeout_ms` (可选) |
| `repx_get_history` | 调阅当前项目历史流量列表（精简表格行，极低 Token 消耗） | `limit`, `offset`, `host`, `status`, `search` |
| `repx_get_packet` | 获取指定历史数据包的完整原始 Request 与 Response 元数据 | `id` (必填) |
| `repx_get_packet_body` | 针对大响应进行切片调阅或定向关键词搜索 | `id` (必填), `offset`, `limit`, `search` |

---

## 模式二：本地 HTTP REST API（用于 Python 脚本与自动化流水线）

当你启动 RepX 桌面端客户端时，后台会自动监听本地回环地址：
`http://127.0.0.1:18080`

### Python 自动化发包与联动示例

```python
import requests

REPX_API = "http://127.0.0.1:18080/api"

# 1. 发送原始数据包 (就像在 Burp Repeater 点击发送一样)
raw_packet = """POST /api/user/query HTTP/1.1
Host: api.target.com
Content-Type: application/json
Authorization: Bearer my_token

{"id": 1001, "role": "admin"}
"""

resp = requests.post(
    f"{REPX_API}/packet/send",
    json={"raw_http": raw_packet, "timeout_ms": 10000}
)
result = resp.json()

print(f"[*] 发包完成! 历史包序号: #{result['id']}")
print(f"[*] 状态码: {result['status']}, 耗时: {result['durationMs']}ms, 大小: {result['length']} 字节")
print(f"[*] 响应预览:\n{result['bodyPreview']}")

# 2. 查询刚才发出的包 (也可以按状态码检索 500 报错)
history_resp = requests.get(f"{REPX_API}/history?status=200&limit=5")
print(f"[*] 最近 200 历史总数: {history_resp.json()['total']}")

# 3. 按 ID 调阅完整数据包
packet_detail = requests.get(f"{REPX_API}/packet/{result['id']}").json()
print(f"[*] 完整响应头: {packet_detail['responseHeaders']}")
```

---

## 优势与总结

1. **共享流量黑板**：脚本或 AI 发送的每一个请求，都会即时在 RepX 桌面端的 **「历史流量 (History)」** 表格中高亮跳出；
2. **人工一键复现**：你在桌面上看到 AI 发出的异常包，按下 **`Ctrl+R`** 瞬间克隆到工作台精调重发；
3. **零串库风险**：开工前在桌面端切换或新建一个 `.repx` 专属项目，所有脚本与 AI 发送的数据均物理隔离在该项目数据库中。
