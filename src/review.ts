import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { ReviewResult, Config } from "./types.ts"

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), "../hooks/review-schema.json")

const REVIEW_PROMPT_PREFIX = `You are an expert code reviewer and technical advisor.
Review the following content for: bugs, security vulnerabilities, logical errors,
missing edge cases, incorrect assumptions, and architectural problems.
Do NOT flag style issues or formatting preferences.
Respond with JSON only — no explanation outside the JSON object.

`

function escapeFences(text: string): string {
  // Replace triple backticks with their hex escape literals to prevent
  // code fence injection inside the review prompt
  return text.replace(/```/g, "\\x60\\x60\\x60")
}

export function buildReviewPrompt(opts: {
  responseText: string | null
  diff: string | null
}): string {
  const parts: string[] = [REVIEW_PROMPT_PREFIX]

  if (opts.responseText) {
    parts.push("## Agent Response / Plan\n\n```\n" + escapeFences(opts.responseText) + "\n```\n\n")
  }

  if (opts.diff) {
    parts.push("## Code Changes (git diff)\n\n```diff\n" + escapeFences(opts.diff) + "\n```\n\n")
  }

  parts.push(
    "Assess severity:\n" +
    "- LGTM: nothing significant to flag\n" +
    "- MINOR: issues worth addressing but not blocking\n" +
    "- MAJOR: critical bugs, security issues, or fundamentally flawed reasoning\n",
  )

  return parts.join("")
}

function dryRunReview(): ReviewResult {
  const severity = (process.env["OCRB_DRY_RUN_SEVERITY"] ?? "LGTM") as ReviewResult["severity"]
  const valid = ["LGTM", "MINOR", "MAJOR"]
  const resolved = valid.includes(severity) ? severity : "LGTM"
  return {
    severity: resolved as ReviewResult["severity"],
    issues: resolved === "LGTM" ? [] : [`Dry run ${resolved.toLowerCase()} issue`],
    suggestions: resolved === "LGTM" ? [] : [`Dry run ${resolved.toLowerCase()} suggestion`],
  }
}

function parseReviewResult(raw: string): ReviewResult {
  // Extract JSON from codex output (may have surrounding whitespace or text)
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`No JSON object found in codex output: ${raw.slice(0, 200)}`)
  const parsed = JSON.parse(match[0]) as unknown

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("severity" in parsed) ||
    !("issues" in parsed) ||
    !("suggestions" in parsed)
  ) {
    throw new Error(`Invalid review result shape: ${JSON.stringify(parsed).slice(0, 200)}`)
  }

  const result = parsed as Record<string, unknown>
  const severity = result["severity"]
  if (severity !== "LGTM" && severity !== "MINOR" && severity !== "MAJOR") {
    throw new Error(`Unknown severity: ${severity}`)
  }

  return {
    severity: severity as ReviewResult["severity"],
    issues: Array.isArray(result["issues"])
      ? (result["issues"] as unknown[]).map(String)
      : [],
    suggestions: Array.isArray(result["suggestions"])
      ? (result["suggestions"] as unknown[]).map(String)
      : [],
  }
}

export async function runCodexReview(prompt: string, config: Config): Promise<ReviewResult> {
  if (process.env["OCRB_DRY_RUN"] === "1") {
    return dryRunReview()
  }

  const args: string[] = [
    "exec",
    "--output-schema", SCHEMA_PATH,
    "--sandbox", "read-only",
    "--ephemeral",
    "--color", "never",
    "--skip-git-repo-check",
    "-c", `model_reasoning_effort=${config.reasoning}`,
    "-c", "model_verbosity=low",
  ]

  if (config.model) {
    args.unshift("--model", config.model)
    // Global flags must come before the subcommand
    // Restructure: codex [global flags] exec [exec flags]
    const modelIdx = args.indexOf("--model")
    const execIdx = args.indexOf("exec")
    if (modelIdx > execIdx) {
      // Move --model and its value before exec
      const [, , modelVal] = args.splice(modelIdx - 1, 2) as [string, string, string]
      args.unshift("--model", modelVal ?? config.model)
    }
  }

  args.push("-") // read prompt from stdin

  const timeout = parseInt(process.env["OCRB_TIMEOUT"] ?? "120", 10)

  const proc = Bun.spawn(["codex", ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })

  proc.stdin.write(prompt)
  proc.stdin.end()

  const outputPromise = new Response(proc.stdout).text()
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`codex timed out after ${timeout}s`)), timeout * 1000),
  )

  const raw = await Promise.race([outputPromise, timeoutPromise])
  await proc.exited

  return parseReviewResult(raw)
}
