# ==============================================================================
# PrivateApply Companion — Windows Uninstallation Script (PowerShell)
# Removes the Native Messaging Host registry keys and installed companion files
# ==============================================================================

Write-Host "Uninstalling PrivateApply Native Companion for Windows..." -ForegroundColor Yellow

$HostName = "com.privateapply.companion"
$InstallDir = Join-Path $env:LOCALAPPDATA "PrivateApply"

$RegistryTargets = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName",
    "HKCU:\Software\Mozilla\NativeMessagingHosts\$HostName"
)

foreach ($regPath in $RegistryTargets) {
    if (Test-Path $regPath) {
        Remove-Item -Path $regPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "[x] Removed registry key: $regPath" -ForegroundColor Green
    }
}

if (Test-Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "[x] Removed installation directory: $InstallDir" -ForegroundColor Green
}

Write-Host "Uninstallation complete." -ForegroundColor Cyan
