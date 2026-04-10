# Spec: OpenCode-Codex Review Bridge (OCRB)

## Objective

An OpenCode plugin that automatically invokes the Codex CLI as a second pair of eyes
on every agent response. Unlike CRB (which only reviews git diffs), OCRB reviews two
things on every `session.idle` event:

1. **Response review** — the last assistant message text (catches bad plans, flawed
   reasoning, missed edge cases, security issues in proposed approaches)
2. **Diff review** — the git diff since HEAD (catches bugs in written code, security
   issues, missing error handling)

This fills the gap CRB has: CRB is silent when Claude presents a plan with no file
changes. OCRB reviews the response itself.

User workflow:
- Install plugin (npm package listed in `opencode.json`)
- `/ocrb on` to enable
- Works silently — LGTM reviews produce no noise
- MINOR findings are reinjected as a follow-up prompt (Claude addresses them)
- MAJOR findings surface as a system message (non-blocking, user sees it)

## Tech Stack

- Language: TypeScript (ESM, Bun runtime — consistent with OpenCode ecosystem)
- Plugin API: `@opencode-ai/sdk` (OpenCode plugin interface)
- Code review: `codex` CLI (`codex exec --output-schema ... --sandbox read-only -`)
- Config: flat files in `~` (`~/.ocrb-enabled`, `~/.ocrb-model`, `~/.ocrb-reasoning`)
- Build: Bun (no separate build step for local dev; npm package bundles via `bun build`)
- Tests: Bun test runner (`bun test`)

## Commands

```
bun install              # Install dependencies
bun test                 # Run test suite
bun run build            # Bundle for npm distribution
bun run typecheck        # tsc --noEmit
```

## Project Structure

```
src/
  index.ts               # Plugin entry point — exports default Plugin function
  review.ts              # Codex invocation: builds prompt, calls codex, parses result
  config.ts              # Toggle/model/reasoning read from ~/.ocrb-* files
  format.ts              # Format review output for display and reinjection
  guard.ts               # Loop-prevention: per-session round counter
  types.ts               # Shared types: ReviewResult, Severity, Config
hooks/
  review-schema.json     # JSON Schema for codex --output-schema (LGTM/MINOR/MAJOR)
commands/
  ocrb.md                # /ocrb slash command definition
skills/
  ocrb/
    SKILL.md             # Claude behavior instructions for handling review feedback
tests/
  review.test.ts         # Unit tests for review logic
  config.test.ts         # Unit tests for config reads
  guard.test.ts          # Unit tests for loop guard
  format.test.ts         # Unit tests for output formatting
package.json
tsconfig.json
opencode.json            # Example config showing plugin install
README.md
```

## Code Style

TypeScript, ESM modules, Bun runtime. No classes — plain functions and types.
Explicit return types on all exported functions. No `any`. No bare `catch` swallowing.

```typescript
// Good: explicit, narrow, no surprises
export async function runCodexReview(prompt: string, config: Config): Promise<ReviewResult> {
  const model = config.model ?? undefined
  const reasoning = config.reasoning ?? "medium"
  const cmd = buildCodexCommand(model, reasoning)
  const result = await $`${cmd}`.stdin(prompt).text()
  return parseReviewResult(result)
}

// Bad: implicit any, swallowed error
async function runReview(prompt) {
  try { return await codex(prompt) } catch { return null }
}
```

Naming: `camelCase` for functions/vars, `PascalCase` for types, `SCREAMING_SNAKE` for
module-level constants. File per concern — no barrel exports.

## Testing Strategy

Framework: `bun test` (built-in Bun test runner).

- Unit tests for all pure functions in `src/`
- Integration tests use `OCRB_DRY_RUN=1` to bypass real codex calls
- `OCRB_DRY_RUN_SEVERITY` controls fake severity (LGTM / MINOR / MAJOR)
- No external network calls in tests
- No Claude Code dependency — tests run standalone

Coverage targets: all happy paths + error branches for `review.ts`, `config.ts`, `guard.ts`.

## Boundaries

**Always:**
- Check toggle before any codex invocation
- Guard against re-entrancy (long-lived plugin process — `session.idle` can recurse)
- Sanitize session IDs before using as filenames
- Use `--sandbox read-only` on all `codex exec` calls
- Validate model/reasoning values before passing to codex subprocess
- Cap review rounds at 3 per session (configurable, hard max 5)

**Ask first:**
- Adding new npm dependencies
- Changing the review schema (affects all installs)
- Changing config file paths (breaking change for existing users)

**Never:**
- Pass unsanitized user content to shell without escaping
- Commit `~/.ocrb-*` config files
- Block MINOR findings (only reinject; let Claude decide)
- Hard-code API keys or model strings

## Feature Scope — V1

### In V1
- `session.idle` → review last assistant message text (plan/response review)
- `session.idle` → review `git diff HEAD` if non-empty (code change review)
- MINOR: reinject feedback via `client.session.prompt()`
- MAJOR: emit `tui.toast.show` + print to stderr (visible but non-blocking)
- LGTM: silent exit
- Loop guard: per-session round counter, max 3 rounds, reset on LGTM
- `/ocrb on|off|status|fast|deep|default|doctor|reset|log` slash command
- `OCRB_DRY_RUN` + `OCRB_DRY_RUN_SEVERITY` for testing

### Deferred to V2
- Per-file review on `file.edited` (equivalent to CRB's PostToolUse hook)
- Strict mode (blocking on MAJOR)
- npm publish + marketplace listing
- Web UI status indicator

## Config Files

| File | Default | Values |
|------|---------|--------|
| `~/.ocrb-enabled` | absent = disabled | `1` = enabled, `0` = disabled |
| `~/.ocrb-model` | absent = codex default | e.g. `gpt-5.4-mini`, `gpt-5.3-codex` |
| `~/.ocrb-reasoning` | absent = `medium` | `none\|minimal\|low\|medium\|high\|xhigh` |

Kept separate from `~/.crb-*` so CRB and OCRB can have independent model configs.

## Review Flow

```
session.idle fires
  │
  ├─ toggle off?          → exit (silent)
  ├─ re-entrancy guard?   → exit (silent)
  ├─ round cap reached?   → exit (silent)
  │
  ├─ fetch last assistant message text
  ├─ fetch git diff (if in git repo)
  ├─ build combined review prompt
  ├─ call: codex exec --output-schema review-schema.json --sandbox read-only -
  │
  ├─ LGTM   → delete round counter, exit
  ├─ MINOR  → increment counter, reinject via client.session.prompt()
  └─ MAJOR  → increment counter, tui.toast.show + stderr
```

## Success Criteria

- [ ] Installing the plugin and setting `~/.ocrb-enabled=1` causes Codex to review
      every agent response in OpenCode
- [ ] A text-only response (no file changes) is reviewed (response text sent to Codex)
- [ ] MINOR feedback is reinjected and Claude addresses it without user intervention
- [ ] MAJOR feedback is visible to the user (toast/stderr)
- [ ] LGTM responses produce zero output
- [ ] No infinite loops — round cap enforced per session
- [ ] `/ocrb doctor` verifies the full pipeline with a dry run
- [ ] All tests pass with `bun test`
- [ ] `OCRB_DRY_RUN=1` works for testing without hitting Codex API

## Open Questions (Resolved)

- Command name: `/ocrb` (not `/crb` — separate tool, separate namespace)
- Config files: `~/.ocrb-*` (independent from CRB)
- Language: TypeScript
- Distribution: local plugin file for V1; npm publish in V2
- MAJOR display: toast notification + stderr (non-blocking)
