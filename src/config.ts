import { readFileSync, existsSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import type { Config, ReasoningEffort } from "./types.ts"
import { VALID_REASONING, DEFAULT_REASONING } from "./types.ts"

const HOME = homedir()

function readToggleFile(): string {
  const path = process.env["OCRB_TOGGLE_FILE"] ?? join(HOME, ".ocrb-enabled")
  if (!existsSync(path)) return ""
  try {
    return readFileSync(path, "utf8").trim()
  } catch {
    return ""
  }
}

export function isEnabled(): boolean {
  const val = readToggleFile()
  return val === "1" || val === "true"
}

function readFileTrimmed(path: string): string | null {
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, "utf8").trim()
  } catch {
    return null
  }
}

export function readConfig(): Config {
  const modelEnv = process.env["OCRB_MODEL"]
  const reasoningEnv = process.env["OCRB_REASONING"]

  let model: string | null = null
  if (modelEnv) {
    model = /^[A-Za-z0-9._-]+$/.test(modelEnv) ? modelEnv : null
  } else {
    const fromFile = readFileTrimmed(join(HOME, ".ocrb-model"))
    if (fromFile && /^[A-Za-z0-9._-]+$/.test(fromFile)) {
      model = fromFile
    }
  }

  let reasoning: string = DEFAULT_REASONING
  if (reasoningEnv && (VALID_REASONING as readonly string[]).includes(reasoningEnv)) {
    reasoning = reasoningEnv
  } else {
    const fromFile = readFileTrimmed(join(HOME, ".ocrb-reasoning"))
    if (fromFile && (VALID_REASONING as readonly string[]).includes(fromFile)) {
      reasoning = fromFile
    }
  }

  return { model, reasoning }
}

export function getMaxRounds(): number {
  const env = process.env["OCRB_MAX_ROUNDS"]
  if (!env) return 3
  const n = parseInt(env, 10)
  if (isNaN(n) || n < 1) return 3
  return Math.min(n, 5)
}
