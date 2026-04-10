import { describe, it, expect, beforeEach } from "bun:test"
import { join } from "path"
import { tmpdir } from "os"
import { mkdirSync } from "fs"

const testStateDir = join(tmpdir(), "ocrb-test-guard")
mkdirSync(testStateDir, { recursive: true })

beforeEach(() => {
  process.env["OCRB_STATE_DIR"] = testStateDir
})

describe("round counter", () => {
  it("starts at 0 for a new session", async () => {
    const { getRoundCount } = await import("../src/guard.ts")
    expect(getRoundCount("new-session-" + Date.now())).toBe(0)
  })

  it("increments correctly", async () => {
    const { getRoundCount, incrementRoundCount } = await import("../src/guard.ts")
    const id = "inc-test-" + Date.now()
    expect(getRoundCount(id)).toBe(0)
    expect(incrementRoundCount(id)).toBe(1)
    expect(incrementRoundCount(id)).toBe(2)
    expect(getRoundCount(id)).toBe(2)
  })

  it("resets to 0", async () => {
    const { incrementRoundCount, resetRoundCount, getRoundCount } = await import("../src/guard.ts")
    const id = "reset-test-" + Date.now()
    incrementRoundCount(id)
    incrementRoundCount(id)
    resetRoundCount(id)
    expect(getRoundCount(id)).toBe(0)
  })

  it("sanitizes session IDs with special characters", async () => {
    const { getRoundCount, incrementRoundCount } = await import("../src/guard.ts")
    // Should not throw or create weird paths
    const id = "session/../../etc/passwd-" + Date.now()
    expect(() => incrementRoundCount(id)).not.toThrow()
    expect(getRoundCount(id)).toBe(1)
  })
})
