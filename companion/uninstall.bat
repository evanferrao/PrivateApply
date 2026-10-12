@echo off
rem ==============================================================================
rem PrivateApply Companion — Windows Uninstallation Launcher (Batch Wrapper)
rem ==============================================================================

setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*

echo.
echo Press any key to close this window...
pause >nul
