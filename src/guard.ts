import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, mkdirSync, renameSync, lstatSync, chmodSync } from "fs"
import { homedir, tmpdir } from "os"
import { join, resolve, sep } from "path"
import { createHash, randomBytes } from "crypto"

// In-memory source of truth — JS event loop is single-threaded so no
// races within the plugin process. Disk is a persistence fallback only.
//
// SINGLE-PROCESS INVARIANT: OpenCode runs exactly one plugin host process
// per user. All session.idle events for a given user are dispatched
// serially through that process's event loop, so the in-memory Map is
// the authoritative counter and needs no cross-process synchronisation.
// The disk file exists solely for recovery after an unexpected restart
// (e.g. plugin reload, crash) — it is never shared with another live
// process. This is why no file locking or SQLite is needed here.
const inMemory = new Map<string, number>()

/**
 * Collision-resistant disk key from a session ID.
 * Using SHA-256 so distinct sessions always map to distinct filenames,
 * regardless of how similar their IDs look after character sanitization.
 */
function diskKey(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex")
}

/**
 * Returns a private, app-owned state directory.
 * Defaults to ~/.ocrb/state (user-owned, not world-writable).
 * Falls back to a process-scoped subdir of tmpdir when HOME is unavailable.
 */
function stateDir(): string {
  const override = process.env["OCRB_STATE_DIR"]
  if (override) {
    const abs = resolve(override)
    ensurePrivateDir(abs)
    return abs
  }
  try {
    const dir = join(homedir(), ".ocrb", "state")
    ensurePrivateDir(dir)
    return dir
  } catch {
    // Fallback: process-scoped subdir so names are not predictable
    const dir = join(tmpdir(), `ocrb-${process.pid}`)
    ensurePrivateDir(dir)
    return dir
  }
}

/**
 * Creates or validates a private directory.
 * Rejects symlinks, ensures it is a real directory, and enforces 0700 on Unix.
 */
function ensurePrivateDir(dir: string): void {
  if (existsSync(dir)) {
    const stat = lstatSync(dir) // lstat does NOT follow symlinks
    if (stat.isSymbolicLink()) {
      throw new Error(`[OCRB] State directory is a symlink — refusing to use: ${dir}`)
    }
    if (!stat.isDirectory()) {
      throw new Error(`[OCRB] State path exists but is not a directory: ${dir}`)
    }
    // On Unix: tighten permissions if group/world bits are set
    if (process.platform !== "win32") {
      if (stat.mode & 0o077) {
        chmodSync(dir, 0o700)
      }
    }
  } else {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
}

function counterPath(sessionId: string): string {
  const dir = stateDir()
  const resolvedDir = resolve(dir)
  const filename = `ocrb-${diskKey(sessionId)}.count`
  const full = resolve(join(dir, filename))
  // Paranoia check: ensure resolved path stays inside the state directory
  if (!full.startsWith(resolvedDir + sep)) {
    throw new Error(`[OCRB] Counter path escapes state dir: ${full}`)
  }
  return full
}

function readFromDisk(sessionId: string): number {
  try {
    const path = counterPath(sessionId)
    if (!existsSync(path)) return 0
    // lstat to reject symlinks in the state dir
    const stat = lstatSync(path)
    if (!stat.isFile()) return 0
    const n = parseInt(readFileSync(path, "utf8").trim(), 10)
    return isNaN(n) || n < 0 ? 0 : n
  } catch {
    return 0
  }
}

function writeToDisk(sessionId: string, value: number): void {
  try {
    const path = counterPath(sessionId)
    // Unique temp name to avoid collisions with concurrent writers
    const tmp = path + "." + randomBytes(4).toString("hex") + ".tmp"
    writeFileSync(tmp, String(value), { encoding: "utf8", mode: 0o600 })
    renameSync(tmp, path)
  } catch { /* best-effort persistence */ }
}

export function getRoundCount(sessionId: string): number {
  if (inMemory.has(sessionId)) return inMemory.get(sessionId)!
  // Restore from disk on first access (e.g. after plugin reload)
  const fromDisk = readFromDisk(sessionId)
  if (fromDisk > 0) inMemory.set(sessionId, fromDisk)
  return fromDisk
}

export function incrementRoundCount(sessionId: string): number {
  // Safe: JS event loop guarantees this read-modify-write is atomic within
  // the single OpenCode plugin process. No two event-loop ticks can
  // interleave here. Disk write is best-effort recovery state only.
  const next = getRoundCount(sessionId) + 1
  inMemory.set(sessionId, next)
  writeToDisk(sessionId, next)
  return next
}

export function resetRoundCount(sessionId: string): void {
  inMemory.delete(sessionId)
  try {
    const path = counterPath(sessionId)
    const stat = lstatSync(path)
    if (stat.isFile()) unlinkSync(path)
  } catch { /* ignore — file may not exist */ }
}

export function resetAllRoundCounts(): void {
  inMemory.clear()
  const dir = stateDir()
  try {
    const resolvedDir = resolve(dir)
    const files = readdirSync(dir)
    for (const f of files) {
      if (!f.startsWith("ocrb-") || !f.endsWith(".count")) continue
      const full = resolve(join(dir, f))
      // Verify path stays inside the state dir and is a real file
      if (!full.startsWith(resolvedDir + sep)) continue
      try {
        const stat = lstatSync(full)
        if (stat.isFile()) unlinkSync(full)
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}
