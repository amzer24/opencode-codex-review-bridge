import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

function stateDir(): string {
  const dir = process.env["OCRB_STATE_DIR"] ?? tmpdir()
  return dir
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 64)
}

function counterPath(sessionId: string): string {
  return join(stateDir(), `ocrb-review-${sanitizeSessionId(sessionId)}-count`)
}

export function getRoundCount(sessionId: string): number {
  const path = counterPath(sessionId)
  if (!existsSync(path)) return 0
  try {
    const n = parseInt(readFileSync(path, "utf8").trim(), 10)
    return isNaN(n) ? 0 : n
  } catch {
    return 0
  }
}

export function incrementRoundCount(sessionId: string): number {
  const path = counterPath(sessionId)
  const next = getRoundCount(sessionId) + 1
  writeFileSync(path, String(next), "utf8")
  return next
}

export function resetRoundCount(sessionId: string): void {
  const path = counterPath(sessionId)
  if (existsSync(path)) {
    try { unlinkSync(path) } catch { /* ignore */ }
  }
}

export function resetAllRoundCounts(): void {
  const dir = stateDir()
  try {
    const { readdirSync } = require("fs")
    const files: string[] = readdirSync(dir)
    for (const f of files) {
      if (f.startsWith("ocrb-review-") && f.endsWith("-count")) {
        try { unlinkSync(join(dir, f)) } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}
