# /ocrb - OpenCode-Codex Review Bridge

Parse the argument and execute the matching action. If no argument, show help.

## Actions

### `on`
```bash
echo 1 > ~/.ocrb-enabled
```
Respond: **OCRB enabled.** Codex will review every agent response and code diff.

### `off`
```bash
echo 0 > ~/.ocrb-enabled
```
Respond: **OCRB disabled.** Reviews paused.

### `status`
Read actual persisted state and display as a dashboard:
```bash
TOGGLE="$(cat ~/.ocrb-enabled 2>/dev/null || echo 'not set')"
MODEL="$(cat ~/.ocrb-model 2>/dev/null || echo 'default')"
REASONING="$(cat ~/.ocrb-reasoning 2>/dev/null || echo 'medium')"
STATE_DIR="${OCRB_STATE_DIR:-${TMPDIR:-/tmp}}"
LOG="$STATE_DIR/ocrb-review.log"
LAST_ENTRY="$(tail -1 "$LOG" 2>/dev/null || echo 'no activity yet')"
COUNTERS="$(ls "$STATE_DIR"/ocrb-review-*-count 2>/dev/null | wc -l | tr -d ' ')"
```

Use the **actual values** from those reads. Format as:
```
OCRB Status
  Review:    [enabled if TOGGLE=1, disabled if 0 or not set]
  Model:     [actual MODEL value] ([actual REASONING value] reasoning)
  Log:       [actual LOG path]
  Last:      [actual LAST_ENTRY]
  Counters:  [actual COUNTERS] active session(s)
```

Do NOT hardcode any values. Show what the files actually contain.

### `log`
```bash
STATE_DIR="${OCRB_STATE_DIR:-${TMPDIR:-/tmp}}"
tail -30 "$STATE_DIR/ocrb-review.log" 2>/dev/null || echo "No log file found."
```
Show the output to the user.

### `reset`
```bash
STATE_DIR="${OCRB_STATE_DIR:-${TMPDIR:-/tmp}}"
rm -f "$STATE_DIR"/ocrb-review-*-count 2>/dev/null
```
Respond: **Loop counters reset.**

### `fast`
```bash
echo "gpt-5.4-mini" > ~/.ocrb-model
echo "low" > ~/.ocrb-reasoning
```
Respond: **Fast mode** - gpt-5.4-mini, low reasoning. Quick reviews (~8s).

### `deep`
```bash
echo "gpt-5.3-codex" > ~/.ocrb-model
echo "high" > ~/.ocrb-reasoning
```
Respond: **Deep mode** - gpt-5.3-codex, high reasoning. Thorough reviews (~16s).

### `default`
```bash
rm -f ~/.ocrb-model ~/.ocrb-reasoning
```
Respond: **Default mode** restored — model and reasoning use codex defaults.

### `doctor`
Run all checks and report as a checklist:

```bash
echo "=== OCRB Doctor ==="

# Prerequisites
bash --version 2>/dev/null | head -1 && echo "  bash: OK" || echo "  bash: FAIL"
node --version 2>/dev/null && echo "  node: OK" || echo "  node: FAIL"
bun --version 2>/dev/null && echo "  bun: OK" || echo "  bun: FAIL (optional)"
git --version 2>/dev/null && echo "  git: OK" || echo "  git: FAIL"
codex --version 2>/dev/null && echo "  codex: OK" || echo "  codex: FAIL — install: npm install -g @openai/codex"

# Auth
echo ""
echo "=== Auth ==="
codex login status 2>/dev/null && echo "  codex auth: OK" || echo "  codex auth: NOT AUTHENTICATED — run: codex login"

# Config
echo ""
echo "=== Config ==="
echo "  Toggle: $(cat ~/.ocrb-enabled 2>/dev/null || echo 'not set (disabled)')"
echo "  Model: $(cat ~/.ocrb-model 2>/dev/null || echo 'default')"
echo "  Reasoning: $(cat ~/.ocrb-reasoning 2>/dev/null || echo 'default (medium)')"

# Dry run
echo ""
echo "=== Dry Run ==="
OCRB_DRY_RUN=1 OCRB_DRY_RUN_SEVERITY=LGTM node -e "
const { isEnabled } = require('./src/config.ts');
console.log('  config load: OK');
" 2>/dev/null && echo "  dry run: PASS" || echo "  dry run: SKIP (run from plugin directory)"
```

Format as a clean checklist. Flag any FAILs with suggested fixes.

### No argument or `help`
```
/ocrb on       Enable Codex review
/ocrb off      Disable Codex review
/ocrb status   Dashboard (toggle, model, counters)
/ocrb log      Recent review activity
/ocrb reset    Reset loop counters
/ocrb fast     Fast mode  (gpt-5.4-mini, low reasoning, ~8s)
/ocrb deep     Deep mode  (gpt-5.3-codex, high reasoning, ~16s)
/ocrb default  Default    (codex default model + medium reasoning)
/ocrb doctor   Verify setup (prerequisites, auth, dry run)
```
