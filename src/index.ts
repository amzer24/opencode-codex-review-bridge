import type { Plugin, PluginInput } from "@opencode-ai/plugin"
import type { Message, Part } from "@opencode-ai/sdk"
import { isEnabled, readConfig, getMaxRounds } from "./config.ts"
import { buildReviewPrompt, runCodexReview } from "./review.ts"
import { formatReviewFeedback, formatMajorAlert } from "./format.ts"
import { getRoundCount, incrementRoundCount, resetRoundCount } from "./guard.ts"

// Long-lived plugin process — guard against re-entrancy per session
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

async function getGitDiff($: PluginInput["$"]): Promise<string | null> {
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

      // Re-entrancy guard
      if (advancing.has(sessionId)) return

      // Toggle check
      if (!isEnabled()) return

      // Round cap check
      const maxRounds = getMaxRounds()
      const currentRound = getRoundCount(sessionId)
      if (currentRound >= maxRounds) return

      // Gather review inputs in parallel
      const [responseText, diff] = await Promise.all([
        getLastAssistantText(client, sessionId),
        getGitDiff($),
      ])

      // Nothing to review
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
        advancing.add(sessionId)
        try {
          await client.session.prompt({
            path: { id: sessionId },
            body: { parts: [{ type: "text", text: feedback }] },
          })
        } finally {
          advancing.delete(sessionId)
        }
        return
      }

      // MAJOR — surface to user non-blocking via stderr
      if (result.severity === "MAJOR") {
        process.stderr.write("\n" + formatMajorAlert(result) + "\n")
      }
    },
  }
}
