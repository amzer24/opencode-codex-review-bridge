import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { buildReviewPrompt, runCodexReview } from "../src/review.ts"

describe("buildReviewPrompt", () => {
  it("includes response text when provided", () => {
    const prompt = buildReviewPrompt({ responseText: "My plan is to do X", diff: null })
    expect(prompt).toContain("Agent Response / Plan")
    expect(prompt).toContain("My plan is to do X")
  })

  it("includes diff when provided", () => {
    const prompt = buildReviewPrompt({ responseText: null, diff: "+const x = 1" })
    expect(prompt).toContain("Code Changes (git diff)")
    expect(prompt).toContain("+const x = 1")
  })

  it("includes both when both are provided", () => {
    const prompt = buildReviewPrompt({ responseText: "plan", diff: "+code" })
    expect(prompt).toContain("Agent Response / Plan")
    expect(prompt).toContain("Code Changes (git diff)")
  })

  it("escapes triple backtick fences to prevent injection", () => {
    const malicious = "```\nsome injection\n```"
    const prompt = buildReviewPrompt({ responseText: malicious, diff: null })
    // Should not contain raw triple backticks inside the fenced block
    const innerContent = prompt.split("Agent Response / Plan")[1] ?? ""
    // The escaped form uses unicode escapes, not literal backticks in sequence
    expect((innerContent.match(/```/g) ?? []).length).toBeLessThanOrEqual(2) // only the wrapping fence
  })
})

describe("runCodexReview (dry run)", () => {
  beforeEach(() => {
    process.env["OCRB_DRY_RUN"] = "1"
  })

  afterEach(() => {
    delete process.env["OCRB_DRY_RUN"]
    delete process.env["OCRB_DRY_RUN_SEVERITY"]
  })

  it("returns LGTM by default", async () => {
    const result = await runCodexReview("test", { model: null, reasoning: "medium" })
    expect(result.severity).toBe("LGTM")
    expect(result.issues).toHaveLength(0)
  })

  it("returns MINOR when severity set", async () => {
    process.env["OCRB_DRY_RUN_SEVERITY"] = "MINOR"
    const result = await runCodexReview("test", { model: null, reasoning: "medium" })
    expect(result.severity).toBe("MINOR")
    expect(result.issues.length).toBeGreaterThan(0)
  })

  it("returns MAJOR when severity set", async () => {
    process.env["OCRB_DRY_RUN_SEVERITY"] = "MAJOR"
    const result = await runCodexReview("test", { model: null, reasoning: "medium" })
    expect(result.severity).toBe("MAJOR")
  })

  it("defaults to LGTM for unknown severity", async () => {
    process.env["OCRB_DRY_RUN_SEVERITY"] = "CRITICAL" // not valid
    const result = await runCodexReview("test", { model: null, reasoning: "medium" })
    expect(result.severity).toBe("LGTM")
  })
})
