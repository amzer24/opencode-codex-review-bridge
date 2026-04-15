# OpenCode Codex Review Bridge — Windows installer (PowerShell 5.1+)
# Usage: irm https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.ps1 | iex
$ErrorActionPreference = "Stop"

$Version    = "v1.0.0"
# Immutable commit SHA — tags can be force-moved; this cannot.
# Update both when cutting a new release.
$Commit     = "aecfc7a13c46d936507b212be83688ce907223b5"
$Repo       = "https://github.com/amzer24/opencode-codex-review.git"
$InstallDir = "$env:LOCALAPPDATA\ocrb"
$ConfigFile = "$env:APPDATA\opencode\opencode.json"
# OpenCode accepts forward slashes on Windows
$PluginPath = $InstallDir.Replace("\", "/") + "/src/index.ts"

Write-Host ""
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "|  OpenCode Codex Review Bridge (OCRB)    |" -ForegroundColor Cyan
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "  Version: $Version ($Commit)"
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

$nodeMajor = [int](node -e "process.stdout.write(process.versions.node.split('.')[0])")
if ($nodeMajor -lt 18) {
    $nodeVer = node -v
    Write-Host "Error: Node.js 18+ is required (found $nodeVer)" -ForegroundColor Red
    Write-Host "Upgrade at https://nodejs.org"
    exit 1
}

# ── Pre-flight: catch partial / broken installs early ─────────────────────────
if ((Test-Path $InstallDir) -and (-not (Test-Path "$InstallDir\.git"))) {
    Write-Host "Error: $InstallDir already exists but is not a valid git checkout." -ForegroundColor Red
    Write-Host "This usually means a previous install was interrupted."
    Write-Host ""
    Write-Host "To fix, remove it and re-run:"
    Write-Host "  Remove-Item -Recurse -Force $InstallDir"
    Write-Host "  irm https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.ps1 | iex"
    exit 1
}

# ── Clone at pinned commit, or verify + update an existing install ─────────────
function Confirm-Commit {
    $actual = git -C $InstallDir rev-parse HEAD
    if ($actual -ne $Commit) {
        Write-Host "Error: checkout HEAD is $actual, expected $Commit" -ForegroundColor Red
        Write-Host "The tag $Version may have been rewritten. Aborting for safety."
        Write-Host "To reinstall clean: Remove-Item -Recurse -Force $InstallDir and re-run."
        exit 1
    }
}

if (Test-Path "$InstallDir\.git") {
    $existingRemote = git -C $InstallDir remote get-url origin 2>$null
    if ($existingRemote -ne $Repo) {
        Write-Host "Error: $InstallDir points to a different remote:" -ForegroundColor Red
        Write-Host "  found:    $existingRemote"
        Write-Host "  expected: $Repo"
        Write-Host "Remove $InstallDir and re-run to install fresh."
        exit 1
    }
    $current = git -C $InstallDir rev-parse HEAD
    if ($current -eq $Commit) {
        Write-Host "Already at $Version -- nothing to update."
    } else {
        Write-Host "Updating $InstallDir to $Version"
        git -C $InstallDir fetch --quiet 2>&1 | Out-Null
        git -C $InstallDir checkout --quiet $Commit 2>&1 | Out-Null
        Confirm-Commit
    }
} else {
    Write-Host "Installing $Version to $InstallDir"
    git clone --quiet --branch $Version --depth 1 $Repo $InstallDir 2>&1 | Out-Null
    Confirm-Commit
}

# ── Dependencies (reproducible install from lockfile) ─────────────────────────
Write-Host "Installing dependencies"
npm --prefix $InstallDir ci --silent
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Error: dependency install failed. Check the output above for details." -ForegroundColor Red
    exit 1
}

# ── Patch OpenCode config ──────────────────────────────────────────────────────
Write-Host "Registering plugin in OpenCode config"
$env:CONFIG_FILE = $ConfigFile
$env:PLUGIN_PATH = $PluginPath
node "$InstallDir/scripts/patch-config.js"

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host ""
Write-Host "  1. Restart OpenCode"
Write-Host "  2. /ocrb on"
Write-Host "  3. /ocrb doctor"
Write-Host ""
