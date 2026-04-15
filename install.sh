#!/usr/bin/env bash
# OpenCode Codex Review Bridge — macOS / Linux installer
# Usage: curl -fsSL https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.sh | bash
set -euo pipefail

VERSION="v1.0.0"
# Immutable commit SHA — tags can be force-moved; this cannot.
# Update both VERSION and COMMIT when cutting a new release.
COMMIT="a7f24c1d4bcef5ddce7fe3ea5c1f4446640f9c5a"
REPO="https://github.com/amzer24/opencode-codex-review.git"
INSTALL_DIR="$HOME/.ocrb"
CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode.json"
PLUGIN_PATH="$INSTALL_DIR/src/index.ts"

echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  OpenCode Codex Review Bridge (OCRB)    │"
echo "└─────────────────────────────────────────┘"
echo "  Version: $VERSION"
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
  echo "  rm -rf \"$INSTALL_DIR\""
  echo "  curl -fsSL https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.sh | bash"
  exit 1
fi

# ── install_staged ─────────────────────────────────────────────────────────────
# Clones + verifies + installs deps into a temp dir, then atomically swaps it
# into $INSTALL_DIR. Both fresh installs and updates use this path so a failed
# npm ci never leaves a half-finished tree that looks healthy on the next run.
# The old install (if any) is kept as a backup and restored on swap failure.
install_staged() {
  local label="$1"   # "Installing" or "Updating"
  local stage backup
  stage=$(mktemp -d)
  trap 'rm -rf "$stage"' RETURN

  echo "↓  $label $VERSION to $INSTALL_DIR"

  # Clone at pinned tag into staging area
  if ! git -c advice.detachedHead=false clone --quiet \
        --branch "$VERSION" --depth 1 "$REPO" "$stage"; then
    echo "Error: git clone failed."
    exit 1
  fi

  # Verify the cloned commit matches the pinned SHA
  local actual
  actual=$(git -C "$stage" rev-parse HEAD)
  if [ "$actual" != "$COMMIT" ]; then
    echo "Error: cloned HEAD is $actual, expected $COMMIT"
    echo "The tag $VERSION may have been rewritten. Aborting for safety."
    exit 1
  fi

  # Install deps from lockfile; --ignore-scripts blocks postinstall execution
  if ! (cd "$stage" && npm ci --ignore-scripts --silent); then
    echo "Error: dependency install failed."
    exit 1
  fi

  # Atomic swap: back up old install → move stage into place → drop backup
  if [ -d "$INSTALL_DIR" ]; then
    backup="${INSTALL_DIR}.bak.$$"
    mv "$INSTALL_DIR" "$backup"
    if ! mv "$stage" "$INSTALL_DIR"; then
      echo "Error: swap failed — restoring previous install."
      mv "$backup" "$INSTALL_DIR"
      exit 1
    fi
    rm -rf "$backup"
  else
    mv "$stage" "$INSTALL_DIR"
  fi
}

# ── Clone or update ────────────────────────────────────────────────────────────
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
    install_staged "Updating to"
  fi
else
  install_staged "Installing"
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
