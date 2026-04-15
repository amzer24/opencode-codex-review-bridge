#!/usr/bin/env bash
# OpenCode Codex Review Bridge — macOS / Linux installer
# Usage: curl -fsSL https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.sh | bash
set -euo pipefail

REPO="https://github.com/amzer24/opencode-codex-review.git"
INSTALL_DIR="$HOME/.ocrb"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode.json"
PLUGIN_PATH="$INSTALL_DIR/src/index.ts"

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  OpenCode Codex Review Bridge (OCRB)    │"
echo "└─────────────────────────────────────────┘"
echo ""

# ── Prerequisites ──────────────────────────────────────────────────────────────
missing=()
for cmd in git node npm; do
  command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Error: the following tools are required but not found: ${missing[*]}"
  echo ""
  echo "  Node.js 18+ → https://nodejs.org"
  echo "  Git         → https://git-scm.com"
  exit 1
fi

# ── Clone or update ────────────────────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "↻  Updating existing install in $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only --quiet
else
  echo "↓  Installing to $INSTALL_DIR"
  git clone --quiet "$REPO" "$INSTALL_DIR"
fi

# ── Dependencies ───────────────────────────────────────────────────────────────
echo "↓  Installing dependencies"
npm --prefix "$INSTALL_DIR" install --silent 2>/dev/null

# ── Patch OpenCode config (node handles JSON safely) ──────────────────────────
echo "✎  Registering plugin in OpenCode config"
CONFIG_FILE="$CONFIG_FILE" PLUGIN_PATH="$PLUGIN_PATH" node -e '
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
  console.log("  Already registered — no changes needed.");
} else {
  config.plugin.push(pluginPath);
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
  console.log("  Written to: " + configFile);
}
'

echo ""
echo "✓  Done. Next steps:"
echo ""
echo "   1. Restart OpenCode"
echo "   2. /ocrb on"
echo "   3. /ocrb doctor"
echo ""
