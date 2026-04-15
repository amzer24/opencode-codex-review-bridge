<p align="center">
  <h1 align="center">OpenCode-Codex Review Bridge</h1>
  <p align="center">
    <strong>Codex reviews every response. Not just the code — the thinking too.</strong>
  </p>
  <p align="center">
    OpenCode plans and writes. Codex reviews the plan, the diff, or both. OpenCode fixes the issues. Repeat until clean.
  </p>
  <p align="center">
    <a href="#install">Install</a> &middot;
    <a href="#how-it-works">How It Works</a> &middot;
    <a href="#configuration">Configuration</a> &middot;
    <a href="#how-it-differs-from-crb">vs CRB</a>
  </p>
</p>

---

### The problem

Code review tools catch bugs in code. But the most expensive mistakes happen earlier — in the plan. By the time files are written, you're already committed to the approach.

### The fix

OCRB hooks into OpenCode's `session.idle` event and sends Codex two things on every response: the agent's last message (the plan, the reasoning, the proposed approach) and the git diff if one exists. Codex reviews both. Feedback routes back automatically. The loop runs until Codex says LGTM.

Use any model you want in OpenCode. OCRB always uses Codex as the reviewer.

---

## How It Works

```
  You give OpenCode a task
        |
        v
  OpenCode responds (plan, code, or both)
        |
        +-----> Has response text? --> Codex reviews the plan / reasoning
        |                                   |
        |                              Logical error? --> Feedback loops back. OpenCode continues.
        |
        +-----> Has git diff? -------> Codex reviews the code changes
                                            |
                                       LGTM ---------> Done. Silent pass.
                                       MINOR --------> Feedback reinjected. OpenCode continues.
                                       MAJOR --------> Alert surfaced to you directly.
                                            |
                                       (up to 3 rounds, then auto-exits)
```

**Catches plans before they become code** — If OpenCode proposes storing passwords in plaintext, Codex flags it before a single file is written. CRB can't do this. OCRB can.

**Stack-aware prompts** — OCRB detects your project's languages and frameworks. A Next.js app gets different review focus than a Go microservice.

**Works with any OpenCode model** — Use Claude, GPT, Gemini, or a local model in OpenCode. OCRB independently uses Codex for review regardless.

**No style nits** — Codex only flags real problems: bugs, security issues, missing error handling, logical errors, architectural concerns. Not formatting.

**Model presets** — Switch review depth on the fly:

| Command | Model | Reasoning | Speed | Use when |
|---------|-------|-----------|-------|----------|
| `/ocrb fast` | gpt-5.4-mini | low | ~8s | Rapid iteration, quick checks |
| `/ocrb default` | gpt-5.4 | medium | ~17s | Normal development |
| `/ocrb deep` | gpt-5.3-codex | high | ~16s | Pre-merge, security-critical work |

---

## Install

### Prerequisites

- **[OpenCode](https://opencode.ai)** with any configured provider
- **[Codex CLI](https://github.com/openai/codex)**: `npm install -g @openai/codex`
- **Codex authenticated**: `codex login`
- **Node.js 18+** and **Git**

### One command — that's it

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/amzer24/opencode-codex-review/main/install.ps1 | iex
```

The installer clones the repo to a standard location (`~/.ocrb` on Mac/Linux, `%LOCALAPPDATA%\ocrb` on Windows), installs dependencies, and automatically registers the plugin in your OpenCode config. No manual path editing needed.

### After install

```
/ocrb on
```
```
/ocrb doctor
```

That's it.

<details>
<summary><strong>Manual install / local dev</strong></summary>

If you prefer to control where the repo lives:

```bash
git clone https://github.com/amzer24/opencode-codex-review.git ~/my-plugins/ocrb
cd ~/my-plugins/ocrb
npm install
```

Then add the path to your OpenCode config:

**macOS / Linux** — `~/.config/opencode/opencode.json`
```json
{
  "plugin": ["/home/yourname/my-plugins/ocrb/src/index.ts"]
}
```

**Windows** — `%APPDATA%\opencode\opencode.json`
```json
{
  "plugin": ["C:/Users/YourName/my-plugins/ocrb/src/index.ts"]
}
```

Restart OpenCode after editing the config.

</details>

---

## Usage

OCRB is **disabled by default**. You control it:

| Command | What it does |
|---------|-------------|
| `/ocrb on` | Enable Codex review |
| `/ocrb off` | Disable Codex review |
| `/ocrb status` | Check toggle, model, active sessions |
| `/ocrb log` | View recent review activity |
| `/ocrb reset` | Reset the review loop counters |
| `/ocrb doctor` | Verify prerequisites, auth, config, and dry run |
| `/ocrb fast` | Switch to faster low-reasoning reviews |
| `/ocrb default` | Restore the default review model |
| `/ocrb deep` | Switch to deeper pre-merge reviews |

---

## What Gets Reviewed

On every `session.idle` event (each time OpenCode finishes a response), OCRB reviews:

| Input | What Codex looks for |
|-------|---------------------|
| **Agent response / plan** | Logical errors, bad assumptions, security implications, missing edge cases, flawed architecture |
| **Git diff** (if present) | Bugs, security vulnerabilities, missing error handling, unhandled cases |

If only a plan was produced (no files changed), only the plan is reviewed. If only code changed (no interesting response), only the diff is reviewed. If both are present, Codex sees both.

---

## Severity Levels

| Severity | Meaning | Action |
|----------|---------|--------|
| **LGTM** | Nothing to flag | Silent — loop ends, counter resets |
| **MINOR** | Issues worth addressing | Reinjected as a follow-up prompt via `session.prompt()` — OpenCode addresses them automatically |
| **MAJOR** | Critical bugs, security issues, fundamentally flawed reasoning | Surfaced as a stderr alert for your attention |

---

## Configuration

| File / Variable | Default | Description |
|-----------------|---------|-------------|
| `~/.ocrb-enabled` | absent = off | `1` to enable, `0` to disable |
| `~/.ocrb-model` | codex default | Override model (e.g. `gpt-5.4-mini`, `gpt-5.3-codex`) |
| `~/.ocrb-reasoning` | `medium` | Reasoning effort: `none` `minimal` `low` `medium` `high` `xhigh` |
| `OCRB_MAX_ROUNDS` | `3` | Review rounds per session before auto-exit (1–5) |
| `OCRB_TIMEOUT` | `120` | Codex call timeout in seconds |
| `OCRB_DRY_RUN=1` | - | Test the pipeline without calling Codex |
| `OCRB_DRY_RUN_SEVERITY` | `LGTM` | Force a severity in dry-run: `LGTM` `MINOR` `MAJOR` |
| `OCRB_STATE_DIR` | `$TMPDIR` | Override directory for round counter files |

---

## How It Differs from CRB

OCRB is the OpenCode sibling of [Claude-Codex Review Bridge](https://github.com/amzer24/Claude-Codex-Review-Bridge-CRB).

| | CRB (Claude Code) | OCRB (OpenCode) |
|---|---|---|
| **What gets reviewed** | Git diff only | Agent response text + git diff |
| **Hook mechanism** | Shell commands (`hooks.json`) | TypeScript plugin (`session.idle` event) |
| **Feedback injection** | `exit 2` → stderr reinject | `client.session.prompt()` API |
| **Git repo required** | Yes | No — response text reviewed regardless |
| **Config files** | `~/.crb-*` | `~/.ocrb-*` |
| **Language** | Bash | TypeScript (Bun) |
| **Compatible with** | Claude Code | OpenCode (any provider) |

The key difference: CRB is silent when the agent presents a plan with no file changes. OCRB catches it.

---

## Architecture

```
src/
  index.ts           Plugin entry — session.idle hook, re-entrancy guard, severity routing
  review.ts          Codex invocation — builds prompt, calls codex exec, parses result
  config.ts          Toggle + model/reasoning from ~/.ocrb-* files
  format.ts          Output formatting for MINOR feedback and MAJOR alerts
  guard.ts           Per-session round counter, path traversal protection
  types.ts           Shared types
hooks/
  review-schema.json Structured output schema for codex --output-schema
commands/
  ocrb.md            /ocrb slash command
skills/
  ocrb/
    SKILL.md         How OpenCode handles Codex review feedback
tests/               25 unit tests — all pass with OCRB_DRY_RUN=1
```

---

## How It Was Built

OCRB was built using CRB — Claude Code wrote the TypeScript plugin while Codex reviewed every file edit. The first real review caught it reviewing itself: a plan to build user auth without authentication middleware, flagged as MAJOR before a line of that code was written.

---

<p align="center">
  <a href="LICENSE">MIT License</a>
</p>
