# OpenCode Codex Review Bridge — Windows installer (PowerShell 5.1+)
# Usage: irm https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.ps1 | iex
$ErrorActionPreference = "Stop"

$Repo       = "https://github.com/amzer24/opencode-codex-review.git"
$InstallDir = "$env:LOCALAPPDATA\ocrb"
$ConfigFile = "$env:APPDATA\opencode\opencode.json"
# OpenCode accepts forward slashes on Windows
$PluginPath = $InstallDir.Replace("\", "/") + "/src/index.ts"

Write-Host ""
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "|  OpenCode Codex Review Bridge (OCRB)    |" -ForegroundColor Cyan
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host ""

# ── Prerequisites ──────────────────────────────────────────────────────────────
$missing = @()
foreach ($cmd in @("git", "node", "npm")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        $missing += $cmd
    }
}
if ($missing.Count -gt 0) {
    Write-Host "Error: the following tools are required but not found: $($missing -join ', ')" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Node.js 18+  ->  https://nodejs.org"
    Write-Host "  Git          ->  https://git-scm.com"
    exit 1
}

# ── Clone or update ────────────────────────────────────────────────────────────
if (Test-Path "$InstallDir\.git") {
    Write-Host "Updating existing install in $InstallDir"
    git -C $InstallDir pull --ff-only --quiet 2>&1 | Out-Null
} else {
    Write-Host "Installing to $InstallDir"
    git clone --quiet $Repo $InstallDir 2>&1 | Out-Null
}

# ── Dependencies ───────────────────────────────────────────────────────────────
Write-Host "Installing dependencies"
npm --prefix $InstallDir install --silent 2>&1 | Out-Null

# ── Patch OpenCode config (node handles JSON safely) ──────────────────────────
Write-Host "Registering plugin in OpenCode config"
$env:CONFIG_FILE = $ConfigFile
$env:PLUGIN_PATH = $PluginPath
node -e @'
const fs = require("fs");
const path = require("path");
const configFile = process.env.CONFIG_FILE;
const pluginPath  = process.env.PLUGIN_PATH;

let config = {};
if (fs.existsSync(configFile)) {
  try { config = JSON.parse(fs.readFileSync(configFile, "utf8")); } catch {}
}
if (!Array.isArray(config.plugin)) config.plugin = [];
if (config.plugin.includes(pluginPath)) {
  console.log("  Already registered -- no changes needed.");
} else {
  config.plugin.push(pluginPath);
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
  console.log("  Written to: " + configFile);
}
'@

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host ""
Write-Host "  1. Restart OpenCode"
Write-Host "  2. /ocrb on"
Write-Host "  3. /ocrb doctor"
Write-Host ""
