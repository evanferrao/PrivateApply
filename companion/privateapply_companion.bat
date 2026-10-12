@echo off
rem ==============================================================================
rem PrivateApply Windows Native Messaging Companion Launcher
rem Invoked directly by Chrome, Edge, Brave, and Firefox on Windows.
rem ==============================================================================

setlocal
set PYTHONUNBUFFERED=1
set PYTHONIOENCODING=utf-8

set "SCRIPT_DIR=%~dp0"
set "TARGET_PY=%SCRIPT_DIR%privateapply_companion.py"

:: 1. Try Windows Python Launcher (py -3)
where py >nul 2>nul
if %ERRORLEVEL% equ 0 (
    py -3 -u "%TARGET_PY%" %*
    exit /b %ERRORLEVEL%
)

:: 2. Try python in current PATH
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    python -u "%TARGET_PY%" %*
    exit /b %ERRORLEVEL%
)

:: 3. Try common local user Python installation paths
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" -u "%TARGET_PY%" %*
    exit /b %ERRORLEVEL%
)
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" -u "%TARGET_PY%" %*
    exit /b %ERRORLEVEL%
)
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" -u "%TARGET_PY%" %*
    exit /b %ERRORLEVEL%
)
if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" -u "%TARGET_PY%" %*
    exit /b %ERRORLEVEL%
)

:: 4. Try common system-wide Python installation paths
if exist "C:\Program Files\Python312\python.exe" (
    "C:\Program Files\Python312\python.exe" -u "%TARGET_PY%" %*
    exit /b %ERRORLEVEL%
)
if exist "C:\Program Files\Python311\python.exe" (
    "C:\Program Files\Python311\python.exe" -u "%TARGET_PY%" %*
    exit /b %ERRORLEVEL%
)
if exist "C:\Python312\python.exe" (
    "C:\Python312\python.exe" -u "%TARGET_PY%" %*
    exit /b %ERRORLEVEL%
)
if exist "C:\Python311\python.exe" (
    "C:\Python311\python.exe" -u "%TARGET_PY%" %*
    exit /b %ERRORLEVEL%
)

echo [PrivateApply Companion] Error: Python 3 executable was not found. 1>&2
echo Please install Python 3.8+ or run: winget install Python.Python.3.12 1>&2
exit /b 1
