@echo off
chcp 65001 >nul
title RepX - 极速启动
cd /d "%~dp0"

rem 本机工具链路径不入库，放在 dev-env.local.bat 里（已在 .gitignore 中忽略）
if exist "dev-env.local.bat" call "dev-env.local.bat"

if exist "RepX.exe" (
    start "" "RepX.exe"
    exit /b 0
)

if exist "src-tauri\target\x86_64-pc-windows-gnu\release\repx.exe" (
    start "" "src-tauri\target\x86_64-pc-windows-gnu\release\repx.exe"
    exit /b 0
)

if exist "src-tauri\target\release\repx.exe" (
    start "" "src-tauri\target\release\repx.exe"
    exit /b 0
)

echo [*] 未找到已编译的 RepX.exe，改用开发调试模式启动...
echo [*] 首次请先执行 npm install
echo [*] 本地 REST API: http://127.0.0.1:18080
npm run tauri dev
