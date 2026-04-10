export type Severity = "LGTM" | "MINOR" | "MAJOR"

export interface ReviewResult {
  severity: Severity
  issues: string[]
  suggestions: string[]
}

export interface Config {
  model: string | null
  reasoning: string
}

export const VALID_REASONING = ["none", "minimal", "low", "medium", "high", "xhigh"] as const
export type ReasoningEffort = (typeof VALID_REASONING)[number]

export const DEFAULT_REASONING: ReasoningEffort = "medium"
export const MAX_ROUNDS = 5
export const DEFAULT_MAX_ROUNDS = 3
