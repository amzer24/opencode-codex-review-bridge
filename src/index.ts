import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import type { Part } from "@opencode-ai/sdk"
import { isEnabled, readConfig, getMaxRounds } from "./config.ts"
import { buildReviewPrompt, runCodexReview } from "./review.ts"
import { formatReviewFeedback, formatMajorAlert } from "./format.ts"
import { getRoundCount, incrementRoundCount, resetRoundCount } from "./guard.ts"

// Per-session in-flight guard. Acquired before the first await, released in
// a top-level finally — ensures the entire handler is single-flight per
// session regardless of severity or failure path.
const advancing = new Set<string>()

async function getLastAssistantText(
  client: PluginInput["client"],
  sessionId: string,
): Promise<string | null> {
  try {
    const result = await client.session.messages({ path: { id: sessionId } })
    const messages = result.data
    if (!Array.isArray(messages)) return null

    // Walk backwards to find the last assistant message
    for (let i = messages.length - 1; i >= 0; i--) {
      const entry = messages[i]
      if (!entry || entry.info.role !== "assistant") continue

      const text = (entry.parts as Part[])
        .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join("\n")
        .trim()

      if (text) return text
    }
    return null
  } catch {
    return null
  }
}

// git diff is repo-wide, not session-scoped. Disabled by default to avoid
// inadvertently sending unrelated local changes or secrets to the reviewer.
// Set OCRB_REVIEW_DIFF=1 to enable.
async function getGitDiff($: PluginInput["$"]): Promise<string | null> {
  if (process.env["OCRB_REVIEW_DIFF"] !== "1") return null
  try {
    const result = await $`git --no-pager diff --no-ext-diff HEAD --`.text()
    const diff = result.trim()
    return diff.length > 0 ? diff : null
  } catch {
    return null
  }
}

export const server: Plugin = async ({ client, $ }: PluginInput) => {
  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return

      const sessionId = event.properties.sessionID

      // Fast checks before acquiring the lock
      if (advancing.has(sessionId)) return
      if (!isEnabled()) return

      const maxRounds = getMaxRounds()
      if (getRoundCount(sessionId) >= maxRounds) return

      // Acquire lock before the first await — held for the entire handler
      // so no two idle events for the same session can interleave.
      advancing.add(sessionId)
      try {
        const [responseText, diff] = await Promise.all([
          getLastAssistantText(client, sessionId),
          getGitDiff($),
        ])

        if (!responseText && !diff) return

        const config = readConfig()
        const prompt = buildReviewPrompt({ responseText, diff })

        let result
        try {
          result = await runCodexReview(prompt, config)
        } catch (err) {
          process.stderr.write(`[OCRB] Codex review failed: ${String(err)}\n`)
          return
        }

        if (result.severity === "LGTM") {
          resetRoundCount(sessionId)
          return
        }

        const round = incrementRoundCount(sessionId)

        if (result.severity === "MINOR") {
          const feedback = formatReviewFeedback(result, round, maxRounds)
          await client.session.prompt({
            path: { id: sessionId },
            body: { parts: [{ type: "text", text: feedback }] },
          })
          return
        }

        // MAJOR — surface to user non-blocking via stderr
        if (result.severity === "MAJOR") {
          process.stderr.write("\n" + formatMajorAlert(result) + "\n")
        }
      } finally {
        advancing.delete(sessionId)
      }
    },
  }
}

// V1 plugin format — OpenCode's loader checks mod.default for { id, server }
// before falling back to legacy named-function exports. Being explicit here
// ensures reliable loading regardless of which path the runtime takes.
export default {
  id: "opencode-codex-review",
  server,
}
