import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { writeFileSync, unlinkSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// Use a temp dir so tests don't touch real ~/.ocrb-* files
const testDir = join(tmpdir(), "ocrb-test-config")
mkdirSync(testDir, { recursive: true })

function writeToggle(val: string) {
  writeFileSync(join(testDir, ".ocrb-enabled"), val)
  process.env["OCRB_TOGGLE_FILE"] = join(testDir, ".ocrb-enabled")
}

function clearToggle() {
  try { unlinkSync(join(testDir, ".ocrb-enabled")) } catch { /* ok */ }
  // Point to the (now absent) test file rather than removing the env var,
  // so isEnabled() never falls through to the real ~/.ocrb-enabled
  process.env["OCRB_TOGGLE_FILE"] = join(testDir, ".ocrb-enabled")
}

describe("isEnabled", () => {
  afterEach(() => {
    clearToggle()
    delete process.env["OCRB_MODEL"]
    delete process.env["OCRB_REASONING"]
  })

  it("returns false when file is absent", async () => {
    clearToggle()
    const { isEnabled } = await import("../src/config.ts")
    expect(isEnabled()).toBe(false)
  })

  it("returns true when file contains 1", async () => {
    writeToggle("1")
    const { isEnabled } = await import("../src/config.ts")
    expect(isEnabled()).toBe(true)
  })

  it("returns true when file contains 1 with newline", async () => {
    writeToggle("1\n")
    const { isEnabled } = await import("../src/config.ts")
    expect(isEnabled()).toBe(true)
  })

  it("returns false when file contains 0", async () => {
    writeToggle("0")
    const { isEnabled } = await import("../src/config.ts")
    expect(isEnabled()).toBe(false)
  })
})

describe("readConfig", () => {
  afterEach(() => {
    delete process.env["OCRB_MODEL"]
    delete process.env["OCRB_REASONING"]
  })

  it("returns null model and medium reasoning by default", async () => {
    const { readConfig } = await import("../src/config.ts")
    const cfg = readConfig()
    expect(cfg.model).toBeNull()
    expect(cfg.reasoning).toBe("medium")
  })

  it("reads model from env var", async () => {
    process.env["OCRB_MODEL"] = "gpt-5.4-mini"
    const { readConfig } = await import("../src/config.ts")
    const cfg = readConfig()
    expect(cfg.model).toBe("gpt-5.4-mini")
  })

  it("rejects model with invalid characters", async () => {
    process.env["OCRB_MODEL"] = "gpt; rm -rf /"
    const { readConfig } = await import("../src/config.ts")
    const cfg = readConfig()
    expect(cfg.model).toBeNull()
  })

  it("reads reasoning from env var", async () => {
    process.env["OCRB_REASONING"] = "high"
    const { readConfig } = await import("../src/config.ts")
    const cfg = readConfig()
    expect(cfg.reasoning).toBe("high")
  })

  it("rejects invalid reasoning value", async () => {
    process.env["OCRB_REASONING"] = "ultra"
    const { readConfig } = await import("../src/config.ts")
    const cfg = readConfig()
    expect(cfg.reasoning).toBe("medium")
  })
})
