@echo off
chcp 65001 >nul
title RepX - 下一代轻量级 HTTP 重放与流量审计工作台
cd /d "%~dp0"

:: 本机工具链路径不入库，放在 dev-env.local.bat 里（已在 .gitignore 中忽略）
if exist "dev-env.local.bat" call "dev-env.local.bat"

cls
echo =====================================================================
echo    ____             _  __
echo   / __ \___  ____  ^| ^|/ /    RepX (Repeater-X)
echo  / /_/ / _ \/ __ \ ^|   /     下一代轻量级 AI-Native HTTP 重放工作台
echo / _, _/  __/ /_/ //   ^|      REST API: 127.0.0.1:18080 · MCP stdio
echo/_/ ^|_^|\___/ .___//_/^|_^|      Rust + Tauri 2.0 + React 18 + Monaco
echo          /_/
echo =====================================================================
echo.
echo [1] 启动 RepX 客户端 (开发调试模式: npm run tauri dev) - 【推荐默认】
echo [2] 编译打包为单文件免安装 EXE (npx tauri build --no-bundle)
echo [3] 运行已编译的单文件客户端 (src-tauri\target\release\repx.exe)
echo [4] 启动 RepX 纯 MCP stdio 服务模式 (Agent 命令行对接测试)
echo [5] 安装 / 修复前端依赖 (npm install)
echo [0] 退出
echo.
echo =====================================================================

set /p choice="请输入数字选项 [默认回车直接启动 1]: "

if "%choice%"=="" set choice=1
if "%choice%"=="1" goto run_dev
if "%choice%"=="2" goto run_build
if "%choice%"=="3" goto run_exe
if "%choice%"=="4" goto run_mcp
if "%choice%"=="5" goto run_install
if "%choice%"=="0" exit /b 0

:run_dev
echo.
echo [*] 正在启动 RepX 客户端...
echo [*] 本地 REST API 将自动监听于 http://127.0.0.1:18080
echo.
npm run tauri dev
goto end

:run_build
echo.
echo [*] 正在编译构建独立单文件 EXE (首次构建 Rust 底层需耗时 2~3 分钟)...
npx tauri build --no-bundle
if exist "src-tauri\target\x86_64-pc-windows-gnu\release\repx.exe" (
    copy /y "src-tauri\target\x86_64-pc-windows-gnu\release\repx.exe" "RepX.exe" >nul
    copy /y "src-tauri\target\x86_64-pc-windows-gnu\release\WebView2Loader.dll" "WebView2Loader.dll" >nul
)
if exist "src-tauri\target\release\repx.exe" (
    copy /y "src-tauri\target\release\repx.exe" "RepX.exe" >nul
    copy /y "src-tauri\target\release\WebView2Loader.dll" "WebView2Loader.dll" >nul
)
if exist "RepX.exe" (
    echo.
    echo [√] 构建完成！已输出到当前目录: RepX.exe
    pause
) else (
    echo.
    echo [×] 构建遇到异常，请检查上方日志。
    pause
)
goto end

:run_exe
if exist "RepX.exe" (
    echo.
    echo [*] 正在直接运行 RepX.exe ...
    start "" "RepX.exe"
) else if exist "src-tauri\target\release\repx.exe" (
    echo.
    echo [*] 正在直接运行已编译的 RepX 单文件客户端...
    start "" "src-tauri\target\release\repx.exe"
) else (
    echo.
    echo [!] 未检测到已编译的 RepX.exe，请先选择 [2] 进行编译构建。
    pause
)
goto end

:run_mcp
if exist "RepX.exe" (
    echo.
    echo [*] 正在以 MCP stdio 模式启动 RepX (等待 JSON-RPC 2.0 输入)...
    "RepX.exe" --mcp
) else if exist "src-tauri\target\release\repx.exe" (
    echo.
    echo [*] 正在以 MCP stdio 模式启动 RepX (等待 JSON-RPC 2.0 输入)...
    "src-tauri\target\release\repx.exe" --mcp
) else (
    echo.
    echo [*] 正在通过 cargo 运行 MCP 模式...
    cd src-tauri
    cargo run --release -- --mcp
    cd ..
)
goto end

:run_install
echo.
echo [*] 正在安装前端依赖包...
npm install
echo.
echo [√] 依赖安装完成！
pause
goto end

:end
