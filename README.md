# OpenCode-Codex Review Bridge (OCRB)

Automatic Codex code review for [OpenCode](https://opencode.ai). Works silently in the background — Codex reviews every agent response and code diff as a second pair of eyes.

## What It Reviews

Unlike the [Claude Code CRB plugin](https://github.com/amzer24/Claude-Codex-Review-Bridge-CRB), OCRB reviews two things on every response:

- **Plans and responses** — the agent's text output (catches bad reasoning, missed edge cases, security implications in proposed approaches)
- **Code changes** — `git diff HEAD` when files have been modified (catches bugs, security issues, missing error handling)

## Install

### Prerequisites

- [OpenCode](https://opencode.ai) 
- [Codex CLI](https://github.com/openai/codex): `npm install -g @openai/codex`
- Codex authenticated: `codex login`

### Add to OpenCode

Add to your `opencode.json` (global: `~/.config/opencode/opencode.json`, or project-level):

```json
{
  "plugin": ["opencode-codex-review"]
}
```

Then enable:

```
/ocrb on
```

## Usage

| Command | Description |
|---------|-------------|
| `/ocrb on` | Enable Codex review |
| `/ocrb off` | Disable Codex review |
| `/ocrb status` | Show current state (model, toggle, counters) |
| `/ocrb fast` | Switch to gpt-5.4-mini, low reasoning (~8s per review) |
| `/ocrb deep` | Switch to gpt-5.3-codex, high reasoning (~16s per review) |
| `/ocrb default` | Reset to default model and reasoning |
| `/ocrb reset` | Clear loop counters (if review loop gets stuck) |
| `/ocrb log` | Show recent review activity |
| `/ocrb doctor` | Verify setup: prerequisites, auth, dry run |

## How It Works

Every time OpenCode's agent finishes responding (`session.idle` event):

1. OCRB fetches the last assistant message and any `git diff HEAD`
2. Passes both to `codex exec --output-schema ... --sandbox read-only`
3. Codex returns structured JSON: `{ severity, issues, suggestions }`
4. **LGTM** → silent, no output
5. **MINOR** → feedback is reinjected as a follow-up prompt; agent addresses it
6. **MAJOR** → surfaced as a toast notification + stderr; visible to the user

Loop cap: max 3 reviews per session by default (configurable via `OCRB_MAX_ROUNDS`).

## Config Files

| File | Effect |
|------|--------|
| `~/.ocrb-enabled` | `1` = on, `0` / absent = off |
| `~/.ocrb-model` | Override model (e.g. `gpt-5.4-mini`) |
| `~/.ocrb-reasoning` | Override reasoning: `none\|minimal\|low\|medium\|high\|xhigh` |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OCRB_DRY_RUN=1` | Skip real Codex calls (for testing) |
| `OCRB_DRY_RUN_SEVERITY` | Force severity in dry-run: `LGTM\|MINOR\|MAJOR` |
| `OCRB_MAX_ROUNDS` | Max review rounds per session (default: 3, max: 5) |
| `OCRB_TIMEOUT` | Codex timeout in seconds (default: 120) |
| `OCRB_STATE_DIR` | Override state directory for round counters |

## Development

```bash
bun install
bun test
bun run typecheck
```

### Local plugin install (dev)

Point OpenCode at the local directory:

```json
{
  "plugin": ["/path/to/opencode-codex-review/src/index.ts"]
}
```

## Relation to CRB

This plugin is the OpenCode sibling of [Claude-Codex Review Bridge](https://github.com/amzer24/Claude-Codex-Review-Bridge-CRB). Key differences:

| | CRB (Claude Code) | OCRB (OpenCode) |
|---|---|---|
| Hook mechanism | Shell commands (`hooks.json`) | TypeScript plugin (`session.idle` event) |
| Scope | Diff review only | Response text + diff review |
| Feedback loop | `exit 2` → stderr reinject | `client.session.prompt()` API |
| Config | `~/.crb-*` files | `~/.ocrb-*` files |

## License

MIT
