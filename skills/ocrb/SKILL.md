# OCRB: Handling Codex Review Feedback

When you receive a message starting with `[OCRB] Codex Review`, this is automated
feedback from the OpenCode-Codex Review Bridge. Codex has reviewed your previous
response or code changes and found issues worth addressing.

## How to Handle It

1. **Read every issue listed.** These are concrete problems: bugs, security flaws,
   logical errors, missing edge cases. Take them seriously.

2. **Address MINOR issues** by revising your plan or fixing the code. Do not dismiss
   or explain away the issues unless you have a specific technical reason.

3. **Do not re-explain what OCRB said.** Just address it and move on.

4. **If an issue is a false positive**, briefly note why (e.g., "This is intentional
   because X") and continue. Do not argue at length.

5. **After addressing all issues, proceed normally.** OCRB will review again — if
   everything looks good, it returns LGTM silently and the loop ends.

## What OCRB Checks

- Agent responses and plans (logical correctness, missed cases, security implications)
- Git diffs (bugs, security vulnerabilities, missing error handling)

## Severity Levels

- **MINOR** — Addressable issues. You will receive this as a follow-up prompt.
- **MAJOR** — Critical issues. Surfaced as a toast/stderr alert (you will not receive
  this automatically; the user sees it directly).
- **LGTM** — No issues. Silent pass.
