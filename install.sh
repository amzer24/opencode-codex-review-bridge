#!/usr/bin/env bash
# OpenCode Codex Review Bridge — macOS / Linux installer
# Usage: curl -fsSL https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.sh | bash
set -euo pipefail

VERSION="v1.0.0"
# Immutable commit SHA — tags can be force-moved; this cannot.
# Update both when cutting a new release.
COMMIT="aecfc7a13c46d936507b212be83688ce907223b5"
REPO="https://github.com/amzer24/opencode-codex-review.git"
INSTALL_DIR="$HOME/.ocrb"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode.json"
PLUGIN_PATH="$INSTALL_DIR/src/index.ts"

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  OpenCode Codex Review Bridge (OCRB)    │"
echo "└─────────────────────────────────────────┘"
echo "  Version: $VERSION ($COMMIT)"
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

node_major=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "$node_major" -lt 18 ]; then
  echo "Error: Node.js 18+ is required (found $(node -v))"
  echo "Upgrade at https://nodejs.org"
  exit 1
fi

# ── Pre-flight: catch partial / broken installs early ─────────────────────────
if [ -e "$INSTALL_DIR" ] && [ ! -d "$INSTALL_DIR/.git" ]; then
  echo "Error: $INSTALL_DIR already exists but is not a valid git checkout."
  echo "This usually means a previous install was interrupted."
  echo ""
  echo "To fix, remove it and re-run:"
  echo "  rm -rf $INSTALL_DIR"
  echo "  curl -fsSL https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.sh | bash"
  exit 1
fi

# ── Clone at pinned commit, or verify + update an existing install ─────────────
verify_commit() {
  local actual
  actual=$(git -C "$INSTALL_DIR" rev-parse HEAD)
  if [ "$actual" != "$COMMIT" ]; then
    echo "Error: checkout HEAD is $actual, expected $COMMIT"
    echo "The tag $VERSION may have been rewritten. Aborting for safety."
    echo "To reinstall clean: rm -rf $INSTALL_DIR and re-run."
    exit 1
  fi
}

if [ -d "$INSTALL_DIR/.git" ]; then
  existing_remote=$(git -C "$INSTALL_DIR" remote get-url origin 2>/dev/null || echo "")
  if [ "$existing_remote" != "$REPO" ]; then
    echo "Error: $INSTALL_DIR points to a different remote:"
    echo "  found:    $existing_remote"
    echo "  expected: $REPO"
    echo "Remove $INSTALL_DIR and re-run to install fresh."
    exit 1
  fi
  current=$(git -C "$INSTALL_DIR" rev-parse HEAD)
  if [ "$current" = "$COMMIT" ]; then
    echo "✓  Already at $VERSION — nothing to update."
  else
    echo "↻  Updating $INSTALL_DIR to $VERSION"
    git -C "$INSTALL_DIR" fetch --quiet
    git -C "$INSTALL_DIR" checkout --quiet "$COMMIT"
    verify_commit
  fi
else
  echo "↓  Installing $VERSION to $INSTALL_DIR"
  git clone --quiet --branch "$VERSION" --depth 1 "$REPO" "$INSTALL_DIR"
  verify_commit
fi

# ── Dependencies (reproducible install from lockfile) ─────────────────────────
echo "↓  Installing dependencies"
if ! npm --prefix "$INSTALL_DIR" ci --silent; then
  echo ""
  echo "Error: dependency install failed. Check the output above for details."
  exit 1
fi

# ── Patch OpenCode config ──────────────────────────────────────────────────────
echo "✎  Registering plugin in OpenCode config"
CONFIG_FILE="$CONFIG_FILE" PLUGIN_PATH="$PLUGIN_PATH" node "$INSTALL_DIR/scripts/patch-config.js"

echo ""
echo "✓  Done. Next steps:"
echo ""
echo "   1. Restart OpenCode"
echo "   2. /ocrb on"
echo "   3. /ocrb doctor"
echo ""
