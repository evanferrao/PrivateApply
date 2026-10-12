@echo off
rem ==============================================================================
rem PrivateApply Companion — Windows Setup Launcher (Batch Wrapper)
rem Double-click this file or run from command prompt to install on Windows.
rem ==============================================================================

setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*

if %ERRORLEVEL% neq 0 (
    echo.
    echo Installation script encountered an error.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo Press any key to close this window...
pause >nul
