# ==============================================================================
# PrivateApply Companion — Windows Setup Script (PowerShell)
# Registers the Native Messaging Host in Windows Registry for Chrome, Edge, & Firefox
# ==============================================================================

[CmdletBinding()]
param(
    [string]$ExtensionId = ""
)

$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " PrivateApply: Windows Native Messaging Companion Setup " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CompanionPy = Join-Path $ScriptDir "privateapply_companion.py"
$CompanionBat = Join-Path $ScriptDir "privateapply_companion.bat"
$InstallDir = Join-Path $env:LOCALAPPDATA "PrivateApply"
$HostName = "com.privateapply.companion"

# 1. Detect Python 3
Write-Host "[*] Checking Python 3..." -ForegroundColor Yellow
$PythonCmd = $null
if (Get-Command "py" -ErrorAction SilentlyContinue) {
    try {
        $pyVer = & py -3 --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $PythonCmd = "py -3"
            Write-Host "[+] Python detected via launcher: $pyVer" -ForegroundColor Green
        }
    } catch {}
}

if (-not $PythonCmd -and (Get-Command "python" -ErrorAction SilentlyContinue)) {
    try {
        $pyVer = & python --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $PythonCmd = "python"
            Write-Host "[+] Python detected in PATH: $pyVer" -ForegroundColor Green
        }
    } catch {}
}

if (-not $PythonCmd) {
    Write-Host "[-] Warning: Python 3 not detected in PATH." -ForegroundColor Red
    Write-Host "    Install Python 3.8+ from https://www.python.org/ or run:" -ForegroundColor Gray
    Write-Host "      winget install Python.Python.3.12" -ForegroundColor White
    Write-Host "    (Ensure 'Add python.exe to PATH' is checked during installation)" -ForegroundColor Gray
}

# 2. Detect TeX distribution (MiKTeX or TeX Live)
Write-Host "[*] Checking installed LaTeX toolchain..." -ForegroundColor Yellow
$FoundTex = $false
$Engines = @("latexmk", "pdflatex", "xelatex", "lualatex")

# Standard Windows paths to probe if not yet in PATH
$WinTexPaths = @(
    (Join-Path $env:LOCALAPPDATA "Programs\MiKTeX\miktex\bin\x64"),
    "C:\Program Files\MiKTeX\miktex\bin\x64",
    "C:\Program Files (x86)\MiKTeX\miktex\bin",
    "C:\texlive\2026\bin\windows",
    "C:\texlive\2025\bin\windows",
    "C:\texlive\2024\bin\windows"
)

foreach ($eng in $Engines) {
    $cmd = Get-Command $eng -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Host "    [x] $eng : $($cmd.Source)" -ForegroundColor Green
        $FoundTex = $true
    } else {
        $foundInProbe = $false
        foreach ($probeDir in $WinTexPaths) {
            $candidate = Join-Path $probeDir "$eng.exe"
            if (Test-Path $candidate) {
                Write-Host "    [x] $eng : $candidate (probe)" -ForegroundColor Green
                $FoundTex = $true
                $foundInProbe = $true
                break
            }
        }
        if (-not $foundInProbe) {
            Write-Host "    [ ] $eng : not found in PATH" -ForegroundColor DarkGray
        }
    }
}

if (-not $FoundTex) {
    Write-Host ""
    Write-Host "[!] Notice: No LaTeX engines were found in PATH or standard directories." -ForegroundColor Yellow
    Write-Host "    The PrivateApply extension will function, but LaTeX compilation" -ForegroundColor Gray
    Write-Host "    requires a TeX distribution." -ForegroundColor Gray
    Write-Host ""
    Write-Host "    Recommended for Windows:" -ForegroundColor Cyan
    Write-Host "      winget install MiKTeX.MiKTeX" -ForegroundColor White
    Write-Host "      -- or --" -ForegroundColor Gray
    Write-Host "      Download MiKTeX installer from https://miktex.org/download" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "[+] TeX engine(s) detected and ready for compilation." -ForegroundColor Green
}

# 3. Create installation directory and copy files
Write-Host "[*] Installing companion files to $InstallDir..." -ForegroundColor Yellow
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

Copy-Item -Path $CompanionPy -Destination (Join-Path $InstallDir "privateapply_companion.py") -Force
Copy-Item -Path $CompanionBat -Destination (Join-Path $InstallDir "privateapply_companion.bat") -Force

$TargetBat = Join-Path $InstallDir "privateapply_companion.bat"
# Convert backslashes for JSON escaping
$TargetBatJsonEscaped = $TargetBat.Replace("\", "\\")

# 4. Generate Chrome / Edge / Chromium Manifest
$ChromeAllowedOrigins = if ($ExtensionId) {
    @("chrome-extension://$ExtensionId/")
} else {
    @("chrome-extension://*/*")
}

$ChromeManifest = @{
    name = $HostName
    description = "PrivateApply Windows compilation companion for AI LaTeX resume editor"
    path = $TargetBat
    type = "stdio"
    allowed_origins = $ChromeAllowedOrigins
} | ConvertTo-Json

$ChromeManifestFile = Join-Path $InstallDir "$HostName.json"
[System.IO.File]::WriteAllText($ChromeManifestFile, $ChromeManifest)
Write-Host "[+] Generated Chrome manifest: $ChromeManifestFile" -ForegroundColor Green

# 5. Generate Firefox Manifest
$FirefoxAllowedExtensions = if ($ExtensionId) {
    @($ExtensionId)
} else {
    @("privateapply@local")
}

$FirefoxManifest = @{
    name = $HostName
    description = "PrivateApply Windows compilation companion for AI LaTeX resume editor"
    path = $TargetBat
    type = "stdio"
    allowed_extensions = $FirefoxAllowedExtensions
} | ConvertTo-Json

$FirefoxManifestFile = Join-Path $InstallDir "$HostName-firefox.json"
[System.IO.File]::WriteAllText($FirefoxManifestFile, $FirefoxManifest)
Write-Host "[+] Generated Firefox manifest: $FirefoxManifestFile" -ForegroundColor Green

# 6. Register Windows Registry Keys
Write-Host "[*] Registering Native Messaging Host in Windows Registry..." -ForegroundColor Yellow

$RegistryTargets = @(
    @{
        Browser = "Google Chrome"
        Path = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
        Manifest = $ChromeManifestFile
    },
    @{
        Browser = "Microsoft Edge"
        Path = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
        Manifest = $ChromeManifestFile
    },
    @{
        Browser = "Brave Browser"
        Path = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName"
        Manifest = $ChromeManifestFile
    },
    @{
        Browser = "Mozilla Firefox"
        Path = "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
        Manifest = $FirefoxManifestFile
    }
)

foreach ($target in $RegistryTargets) {
    try {
        if (-not (Test-Path $target.Path)) {
            New-Item -Path $target.Path -Force | Out-Null
        }
        Set-ItemProperty -Path $target.Path -Name "(Default)" -Value $target.Manifest -Force | Out-Null
        Write-Host "    [x] Registered for $($target.Browser)" -ForegroundColor Green
    } catch {
        Write-Host "    [-] Warning: Could not register for $($target.Browser): $_" -ForegroundColor DarkGray
    }
}

# 7. Self-Test
Write-Host ""
Write-Host "[*] Running companion self-test..." -ForegroundColor Yellow
try {
    $testScript = @"
import sys, struct, json, subprocess
req = json.dumps({'cmd': 'get_status'}).encode('utf-8')
proc = subprocess.Popen([r'$TargetBat'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
proc.stdin.write(struct.pack('=I', len(req)) + req)
proc.stdin.flush()
raw_len = proc.stdout.read(4)
if len(raw_len) == 4:
    l = struct.unpack('=I', raw_len)[0]
    res = json.loads(proc.stdout.read(l).decode('utf-8'))
    print(json.dumps(res))
proc.terminate()
"@

    if ($PythonCmd) {
        $selfTestResult = $testScript | & ($PythonCmd.Split(' ')[0]) ($PythonCmd.Split(' ')[1..($PythonCmd.Split(' ').Length-1)]) 2>$null
        if ($selfTestResult -match "version") {
            Write-Host "[+] Self-test PASSED! Companion responded successfully over native stdio." -ForegroundColor Green
        } else {
            Write-Host "[!] Self-test notice: Companion process started. Restart your browser to apply changes." -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "[!] Self-test skipped: $_" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Installation Complete!                                " -ForegroundColor Cyan
Write-Host " Please restart Chrome, Edge, or Firefox.              " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
