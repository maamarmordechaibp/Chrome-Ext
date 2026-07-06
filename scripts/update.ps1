# Marketplace Catalog Generator - updater for the "Load unpacked" install.
#
# Downloads the latest built extension from GitHub Releases and unzips it into a
# stable folder, so Chrome's "Load unpacked" always points at the newest build.
#
# First run:
#   1. Run this script (double-click, or: right-click > Run with PowerShell).
#   2. In Chrome open  chrome://extensions , enable "Developer mode",
#      click "Load unpacked", and pick the folder this script reports.
# To update later:
#   1. Run this script again.
#   2. In chrome://extensions click the refresh (circular arrow) on the extension.

$ErrorActionPreference = 'Stop'

$Repo      = 'maamarmordechaibp/Chrome-Ext'
$ZipUrl    = "https://github.com/$Repo/releases/latest/download/dist.zip"
$InstallDir = Join-Path $env:LOCALAPPDATA 'MarketplaceCatalog\extension'
$TmpZip    = Join-Path $env:TEMP 'marketplace-catalog-dist.zip'

Write-Host 'Downloading latest release...' -ForegroundColor Cyan
Invoke-WebRequest -Uri $ZipUrl -OutFile $TmpZip -UseBasicParsing

# Replace the folder contents with the fresh build.
if (Test-Path $InstallDir) { Remove-Item $InstallDir -Recurse -Force }
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

Write-Host 'Extracting...' -ForegroundColor Cyan
Expand-Archive -Path $TmpZip -DestinationPath $InstallDir -Force
Remove-Item $TmpZip -Force

# Report the installed version.
$manifest = Join-Path $InstallDir 'manifest.json'
$version = if (Test-Path $manifest) { (Get-Content $manifest -Raw | ConvertFrom-Json).version } else { 'unknown' }

Write-Host ''
Write-Host "Installed version $version to:" -ForegroundColor Green
Write-Host "  $InstallDir" -ForegroundColor Green
Write-Host ''
Write-Host 'Next: open chrome://extensions -> Developer mode ON ->' -ForegroundColor Yellow
Write-Host '  first time: "Load unpacked" and select the folder above;' -ForegroundColor Yellow
Write-Host '  updating:   click the refresh icon on the extension card.' -ForegroundColor Yellow
