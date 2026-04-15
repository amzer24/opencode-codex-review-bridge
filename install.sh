#!/usr/bin/env bash
# OpenCode Codex Review Bridge — macOS / Linux installer
# Usage: curl -fsSL https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.sh | bash
set -euo pipefail

VERSION="v1.0.0"
# Immutable commit SHA — tags can be force-moved; this cannot.
# Update both VERSION and COMMIT when cutting a new release.
COMMIT="a28769b82dd90107bdfc3905c11961d8d51ccbe3"
REPO="https://github.com/amzer24/opencode-codex-review.git"
INSTALL_DIR="$HOME/.ocrb"
# Stage under the same parent dir as INSTALL_DIR so mv is a rename,
# not a cross-filesystem copy — guarantees atomic swap.
STAGE_DIR="$(dirname "$INSTALL_DIR")/.ocrb-stage.$$"
OPENCODE_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
CONFIG_FILE="$OPENCODE_CONFIG_DIR/opencode.json"
COMMANDS_DIR="$OPENCODE_CONFIG_DIR/commands"
# Point at the package DIRECTORY so OpenCode resolves the entry point via
# package.json exports["./server"] → src/index.ts. Pointing directly at the
# .ts file bypasses package.json and can break relative imports in the plugin.
PLUGIN_URL="file://$INSTALL_DIR"

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
# Clones + verifies + installs into a staging dir on the SAME filesystem as
# INSTALL_DIR (so mv is a rename, not copy+delete), then atomically swaps.
# The old install is kept as a backup until the swap succeeds; on failure the
# partial target is removed before the backup is restored.
install_staged() {
  local label="$1"
  local backup="${INSTALL_DIR}.bak.$$"

  echo "↓  $label $VERSION"

  # Clean up any leftover stage from a previous interrupted run
  rm -rf "$STAGE_DIR"
  mkdir -p "$STAGE_DIR"

  # Ensure stage is removed on exit if we abort before the swap
  trap 'rm -rf "$STAGE_DIR"' RETURN

  # Clone at pinned tag into staging area
  if ! git -c advice.detachedHead=false clone --quiet \
        --branch "$VERSION" --depth 1 "$REPO" "$STAGE_DIR"; then
    echo "Error: git clone failed."
    exit 1
  fi

  # Verify the cloned commit matches the pinned SHA
  local actual
  actual=$(git -C "$STAGE_DIR" rev-parse HEAD)
  if [ "$actual" != "$COMMIT" ]; then
    echo "Error: cloned HEAD is $actual, expected $COMMIT"
    echo "The tag $VERSION may have been rewritten. Aborting for safety."
    exit 1
  fi

  # Install deps from lockfile; --ignore-scripts blocks postinstall execution.
  # Use cd, not --prefix, to avoid npm's dir-name-vs-package-name quirk.
  if ! (cd "$STAGE_DIR" && npm ci --ignore-scripts --silent); then
    echo "Error: dependency install failed."
    exit 1
  fi

  # Atomic swap using rename (same filesystem guaranteed):
  #   1. Move old install to backup
  #   2. Rename stage into place
  #   3. On any failure: remove partial target, restore backup
  if [ -d "$INSTALL_DIR" ]; then
    mv "$INSTALL_DIR" "$backup"
  fi

  if ! mv "$STAGE_DIR" "$INSTALL_DIR"; then
    echo "Error: failed to move update into place — restoring previous install."
    # Remove any partial target left by the failed mv before restoring
    rm -rf "$INSTALL_DIR"
    if [ -d "$backup" ]; then
      if ! mv "$backup" "$INSTALL_DIR"; then
        echo "Error: restore also failed. Your previous install is at:"
        echo "  $backup"
        echo "Manually run: mv \"$backup\" \"$INSTALL_DIR\""
      fi
    fi
    exit 1
  fi

  # Swap succeeded — drop the backup
  rm -rf "$backup"
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

# ── Copy slash command so OpenCode can discover it ────────────────────────────
echo "✎  Installing /ocrb slash command"
mkdir -p "$COMMANDS_DIR"
cp "$INSTALL_DIR/commands/ocrb.md" "$COMMANDS_DIR/ocrb.md"

# ── Patch OpenCode config ──────────────────────────────────────────────────────
echo "✎  Registering plugin in OpenCode config"
CONFIG_FILE="$CONFIG_FILE" PLUGIN_URL="$PLUGIN_URL" node "$INSTALL_DIR/scripts/patch-config.js"

echo ""
echo "✓  Done. Next steps:"
echo ""
echo "   1. Restart OpenCode"
echo "   2. /ocrb on"
echo "   3. /ocrb doctor"
echo ""
