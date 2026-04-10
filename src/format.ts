import type { ReviewResult } from "./types.ts"

export function formatReviewFeedback(
  result: ReviewResult,
  round: number,
  maxRounds: number,
): string {
  const lines: string[] = [
    `[OCRB] Codex Review — Round ${round}/${maxRounds} — ${result.severity}`,
    "─".repeat(50),
    "",
  ]

  if (result.issues.length > 0) {
    lines.push("Issues:")
    for (const issue of result.issues) {
      lines.push(`  • ${issue}`)
    }
    lines.push("")
  }

  if (result.suggestions.length > 0) {
    lines.push("Suggestions:")
    for (const s of result.suggestions) {
      lines.push(`  • ${s}`)
    }
    lines.push("")
  }

  lines.push("[OCRB] Please address the issues above.")
  return lines.join("\n")
}

export function formatMajorAlert(result: ReviewResult): string {
  const lines: string[] = [
    "[OCRB] Codex flagged MAJOR issues:",
    "",
  ]
  for (const issue of result.issues) {
    lines.push(`  ⚠ ${issue}`)
  }
  if (result.suggestions.length > 0) {
    lines.push("")
    for (const s of result.suggestions) {
      lines.push(`  • ${s}`)
    }
  }
  return lines.join("\n")
}
