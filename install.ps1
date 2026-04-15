# OpenCode Codex Review Bridge — Windows installer (PowerShell 5.1+)
# Usage: irm https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.ps1 | iex
$ErrorActionPreference = "Stop"

$Version    = "v1.0.0"
# Immutable commit SHA — tags can be force-moved; this cannot.
# Update both Version and Commit when cutting a new release.
$Commit     = "fd2ba7cdfa01d5e3a5418bd99163da11a962996d"
$Repo       = "https://github.com/amzer24/opencode-codex-review.git"
$InstallDir = "$env:LOCALAPPDATA\ocrb"
# Stage under the same parent dir as InstallDir so Move-Item is a rename,
# not a cross-filesystem copy — guarantees atomic swap on Windows.
$StageDir   = "$env:LOCALAPPDATA\.ocrb-stage.$PID"
$ConfigFile = "$env:APPDATA\opencode\opencode.json"
# OpenCode accepts forward slashes on Windows
$PluginPath = $InstallDir.Replace("\", "/") + "/src/index.ts"

Write-Host ""
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "|  OpenCode Codex Review Bridge (OCRB)    |" -ForegroundColor Cyan
Write-Host "+------------------------------------------+" -ForegroundColor Cyan
Write-Host "  Version: $Version"
Write-Host ""

# ── Prerequisites ──────────────────────────────────────────────────────────────
$missing = @()
foreach ($cmd in @("git", "node", "npm")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { $missing += $cmd }
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
    Write-Host "Error: Node.js 18+ is required (found $(node -v))" -ForegroundColor Red
    Write-Host "Upgrade at https://nodejs.org"
    exit 1
}

# ── Pre-flight: catch partial / broken installs early ─────────────────────────
if ((Test-Path $InstallDir) -and (-not (Test-Path "$InstallDir\.git"))) {
    Write-Host "Error: $InstallDir already exists but is not a valid git checkout." -ForegroundColor Red
    Write-Host "This usually means a previous install was interrupted."
    Write-Host ""
    Write-Host "To fix, remove it and re-run:"
    Write-Host "  Remove-Item -Recurse -Force '$InstallDir'"
    Write-Host "  irm https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.ps1 | iex"
    exit 1
}

# ── Install-Staged ─────────────────────────────────────────────────────────────
# Clones + verifies + installs deps into a temp dir, then atomically swaps it
# into $InstallDir. Both fresh installs and updates use this path so a failed
# npm ci never leaves a half-finished tree that looks healthy on the next run.
function Install-Staged {
    param([string]$Label)

    Write-Host "$Label $Version"

    # Clean up any leftover stage from a previous interrupted run
    if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
    New-Item -ItemType Directory -Path $StageDir | Out-Null

    $backup = "$InstallDir.bak.$PID"

    try {
        # Clone at pinned tag into staging area (same drive as InstallDir)
        git -c advice.detachedHead=false clone --quiet `
            --branch $Version --depth 1 $Repo $StageDir 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Error: git clone failed." -ForegroundColor Red
            throw "clone failed"
        }

        # Verify the cloned commit matches the pinned SHA
        $actual = git -C $StageDir rev-parse HEAD
        if ($actual -ne $Commit) {
            Write-Host "Error: cloned HEAD is $actual, expected $Commit" -ForegroundColor Red
            Write-Host "The tag $Version may have been rewritten. Aborting for safety."
            throw "commit mismatch"
        }

        # Install deps from lockfile; --ignore-scripts blocks postinstall execution.
        # Use Push-Location (cd equivalent), not --prefix, to avoid npm quirk.
        Push-Location $StageDir
        try {
            npm ci --ignore-scripts --silent
            if ($LASTEXITCODE -ne 0) {
                Write-Host "Error: dependency install failed." -ForegroundColor Red
                throw "npm ci failed"
            }
        } finally {
            Pop-Location
        }

        # Atomic swap (same drive → rename, not copy+delete):
        #   1. Move old install to backup
        #   2. Rename stage into place
        #   3. On failure: remove partial target, restore backup
        if (Test-Path $InstallDir) {
            Move-Item $InstallDir $backup
        }

        try {
            Move-Item $StageDir $InstallDir
        } catch {
            Write-Host "Error: swap failed — restoring previous install." -ForegroundColor Red
            # Remove any partial target before restoring
            if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
            if (Test-Path $backup) {
                try { Move-Item $backup $InstallDir }
                catch {
                    Write-Host "Error: restore also failed. Previous install is at:" -ForegroundColor Red
                    Write-Host "  $backup"
                    Write-Host "Manually run: Move-Item '$backup' '$InstallDir'"
                }
            }
            throw
        }

        # Swap succeeded — drop the backup
        if (Test-Path $backup) { Remove-Item -Recurse -Force $backup }

    } catch {
        if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
        exit 1
    }
}

# ── Clone or update ────────────────────────────────────────────────────────────
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
        Install-Staged "Updating to"
    }
} else {
    Install-Staged "Installing"
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
