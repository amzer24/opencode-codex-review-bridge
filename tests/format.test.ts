import { describe, it, expect } from "bun:test"
import { formatReviewFeedback, formatMajorAlert } from "../src/format.ts"

describe("formatReviewFeedback", () => {
  it("includes round info and severity", () => {
    const result = formatReviewFeedback(
      { severity: "MINOR", issues: ["Missing null check"], suggestions: [] },
      1, 3,
    )
    expect(result).toContain("Round 1/3")
    expect(result).toContain("MINOR")
    expect(result).toContain("Missing null check")
  })

  it("includes suggestions when present", () => {
    const result = formatReviewFeedback(
      { severity: "MINOR", issues: ["bug"], suggestions: ["Add test coverage"] },
      2, 3,
    )
    expect(result).toContain("Suggestions:")
    expect(result).toContain("Add test coverage")
  })

  it("omits suggestions section when empty", () => {
    const result = formatReviewFeedback(
      { severity: "MINOR", issues: ["bug"], suggestions: [] },
      1, 3,
    )
    expect(result).not.toContain("Suggestions:")
  })
})

describe("formatMajorAlert", () => {
  it("includes all issues with warning icon", () => {
    const result = formatMajorAlert({
      severity: "MAJOR",
      issues: ["SQL injection", "No auth check"],
      suggestions: [],
    })
    expect(result).toContain("SQL injection")
    expect(result).toContain("No auth check")
    expect(result).toContain("⚠")
  })
})
