#!/usr/bin/env bash
# End-to-end smoke test — exercises every rule type plus the surrounding
# infrastructure (api keys, webhooks, test suites, simulations) against a
# locally-running stack.
#
# Pre-reqs:
#   - postgres on :5461 (xrules-postgres docker container)
#   - backend on :4000 (apps/xrules-backend dev server, fresh DB)
#   - engine  on :50051 (apps/xrules-engine cargo run)
#
# Usage:
#   ./scripts/smoke-test.sh          # green/red per assertion + totals
#   VERBOSE=1 ./scripts/smoke-test.sh  # full responses

set -uo pipefail

BACKEND=${BACKEND:-http://localhost:4000}
EMAIL=${EMAIL:-admin@example.com}
PASSWORD=${PASSWORD:-admin123}
PROJECT_ID=${PROJECT_ID:-}     # use first listed project if empty

PASS=0
FAIL=0
SKIP=0
FAILED_NAMES=()

c_red()   { printf "\033[31m%s\033[0m" "$*"; }
c_green() { printf "\033[32m%s\033[0m" "$*"; }
c_yellow(){ printf "\033[33m%s\033[0m" "$*"; }
c_dim()   { printf "\033[2m%s\033[0m" "$*"; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    PASS=$((PASS+1))
    printf "  %s %s\n" "$(c_green '✓')" "$label"
  else
    FAIL=$((FAIL+1))
    FAILED_NAMES+=("$label")
    printf "  %s %s\n    expected: %s\n    actual:   %s\n" \
      "$(c_red '✗')" "$label" "$expected" "$actual"
  fi
}

assert_truthy() {
  local label="$1" actual="$2"
  if [[ -n "$actual" && "$actual" != "null" && "$actual" != "false" ]]; then
    PASS=$((PASS+1))
    printf "  %s %s %s\n" "$(c_green '✓')" "$label" "$(c_dim "= $actual")"
  else
    FAIL=$((FAIL+1))
    FAILED_NAMES+=("$label")
    printf "  %s %s\n    actual: '%s'\n" "$(c_red '✗')" "$label" "$actual"
  fi
}

skip() {
  SKIP=$((SKIP+1))
  printf "  %s %s %s\n" "$(c_yellow '⊘')" "$1" "$(c_dim "${2:-skipped}")"
}

step() { printf "\n%s\n" "$(c_dim "── $* ──")"; }
note() { printf "  %s\n" "$(c_dim "$*")"; }

# ─────────────────────────────────────────────────────────────────────────────
step "auth"

LOGIN=$(curl -sS -X POST "$BACKEND/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | jq -r '.data.access_token // empty')
WS_ID=$(echo "$LOGIN" | jq -r '.data.user.tenantId // empty')

assert_truthy "login returns token" "$TOKEN"
H_AUTH="Authorization: Bearer $TOKEN"

# ─────────────────────────────────────────────────────────────────────────────
step "workspace + project"

if [[ -z "$PROJECT_ID" ]]; then
  PROJECTS=$(curl -sS "$BACKEND/projects" -H "$H_AUTH")
  PROJECT_ID=$(echo "$PROJECTS" | jq -r '.data[0].id // empty')
  WS_REAL=$(echo "$PROJECTS" | jq -r '.data[0].workspaceId // empty')
fi
assert_truthy "have a project to work in" "$PROJECT_ID"

# ─────────────────────────────────────────────────────────────────────────────
step "issue api key"
KEYRES=$(curl -sS -X POST "$BACKEND/api-keys" -H "$H_AUTH" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"smoke-$(date +%s)\",\"workspaceId\":\"$WS_REAL\"}")
API_KEY=$(echo "$KEYRES" | jq -r '.data.key // empty')
assert_truthy "api key issued" "$API_KEY"

# ─────────────────────────────────────────────────────────────────────────────
# Helper: create a rule of given type, set its definition, return rule id.
# args: type definition_json [name]
create_rule() {
  local rtype="$1"
  local defn="$2"
  local rname="${3:-Smoke $rtype}"
  local res
  res=$(curl -sS -X POST "$BACKEND/rules" -H "$H_AUTH" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg t "$rtype" --arg n "$rname" --arg p "$PROJECT_ID" \
      '{name:$n,type:$t,project_id:$p,description:"smoke"}')")
  local id
  id=$(echo "$res" | jq -r '.data.id // empty')
  if [[ -z "$id" ]]; then
    echo "ERROR: failed to create $rtype rule: $res" >&2
    return 1
  fi
  curl -sS -X PUT "$BACKEND/rules/$id" -H "$H_AUTH" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --argjson d "$defn" '{definition:$d}')" >/dev/null
  echo "$id"
}

exec_rule_jwt() {
  local id="$1" input="$2"
  curl -sS -X POST "$BACKEND/execute" -H "$H_AUTH" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg r "$id" --argjson i "$input" \
      '{rule_id:$r,input:$i,context:{}}')"
}

exec_rule_solver() {
  local id="$1" input="$2"
  curl -sS -X POST "$BACKEND/api/v1/rules/$id/execute" \
    -H "X-API-Key: $API_KEY" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --argjson i "$input" '{input:$i}')"
}

# ─────────────────────────────────────────────────────────────────────────────
step "rule type 1: SCORECARD"
SCORECARD_DEF='{"attributes":[{"name":"income","bands":[{"match":{"gte":80000},"points":50},{"match":{"gte":50000},"points":30}]},{"name":"fico","bands":[{"match":{"gte":720},"points":50},{"match":{"gte":680},"points":30}]}],"thresholds":[{"score":80,"decision":"approve"},{"score":50,"decision":"review"},{"score":0,"decision":"deny"}]}'
SC_ID=$(create_rule "SCORECARD" "$SCORECARD_DEF") || true

if [[ -n "$SC_ID" ]]; then
  R=$(exec_rule_jwt "$SC_ID" '{"income":95000,"fico":740}')
  assert_eq "scorecard high → approve (jwt)"  '"approve"' "$(echo "$R" | jq -c '.data.output.decision')"
  assert_eq "scorecard high score = 100"      "100"       "$(echo "$R" | jq -c '.data.output.score')"

  R=$(exec_rule_jwt "$SC_ID" '{"income":55000,"fico":690}')
  assert_eq "scorecard mid → review (jwt)"    '"review"'  "$(echo "$R" | jq -c '.data.output.decision')"

  R=$(exec_rule_jwt "$SC_ID" '{"income":20000,"fico":600}')
  assert_eq "scorecard low → deny (jwt)"      '"deny"'    "$(echo "$R" | jq -c '.data.output.decision')"

  R=$(exec_rule_solver "$SC_ID" '{"income":95000,"fico":740}')
  assert_eq "scorecard approve via solver"    '"approve"' "$(echo "$R" | jq -c '.output.decision')"

  R=$(exec_rule_solver "$SC_ID" '[{"income":95000,"fico":740},{"income":20000,"fico":600}]')
  assert_eq "scorecard bulk solver count"     '2'         "$(echo "$R" | jq -c 'length')"
  assert_eq "scorecard bulk[0].decision"      '"approve"' "$(echo "$R" | jq -c '.[0].output.decision')"
  assert_eq "scorecard bulk[1].decision"      '"deny"'    "$(echo "$R" | jq -c '.[1].output.decision')"
else
  skip "scorecard tests" "no rule id"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "rule type 2: FORMULA"
FORMULA_DEF='{"source":"input.qty * input.unitPrice"}'
FM_ID=$(create_rule "FORMULA" "$FORMULA_DEF") || true
if [[ -n "$FM_ID" ]]; then
  R=$(exec_rule_jwt "$FM_ID" '{"qty":3,"unitPrice":250}')
  assert_eq "formula 3*250 = 750" "750" "$(echo "$R" | jq -c '.data.output')"
  R=$(exec_rule_jwt "$FM_ID" '{"qty":0,"unitPrice":99}')
  assert_eq "formula 0*99 = 0"   "0"   "$(echo "$R" | jq -c '.data.output')"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "rule type 3: SCRIPT"
SCRIPT_DEF='{"source":"const t = Math.round(input.amount * 7) / 100; return { tax: t, total: input.amount + t };"}'
SR_ID=$(create_rule "SCRIPT" "$SCRIPT_DEF") || true
if [[ -n "$SR_ID" ]]; then
  R=$(exec_rule_jwt "$SR_ID" '{"amount":100}')
  assert_eq "script tax"   "7"   "$(echo "$R" | jq -c '.data.output.tax')"
  assert_eq "script total" "107" "$(echo "$R" | jq -c '.data.output.total')"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "rule type 4: LOOKUP"
LOOKUP_DEF='{"primaryKey":"code","columns":[{"name":"code","type":"string"},{"name":"name","type":"string"},{"name":"rate","type":"number"}],"rows":[{"code":"USD","name":"US Dollar","rate":1},{"code":"EUR","name":"Euro","rate":1.07},{"code":"THB","name":"Thai Baht","rate":0.028}]}'
LK_ID=$(create_rule "LOOKUP" "$LOOKUP_DEF") || true
if [[ -n "$LK_ID" ]]; then
  R=$(exec_rule_jwt "$LK_ID" '{"code":"EUR"}')
  assert_eq "lookup EUR.name" '"Euro"' "$(echo "$R" | jq -c '.data.output.name')"
  assert_eq "lookup EUR.rate" '1.07'   "$(echo "$R" | jq -c '.data.output.rate')"
  R=$(exec_rule_jwt "$LK_ID" '{"code":"XYZ"}')
  assert_eq "lookup miss returns null" 'null' "$(echo "$R" | jq -c '.data.output')"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "rule type 5: DECISION_TABLE (existing seeded)"
SEED_DT_ID=$(curl -sS "$BACKEND/rules?project_id=$PROJECT_ID" -H "$H_AUTH" \
  | jq -r '[.data[] | select((.type|ascii_upcase)=="DECISION_TABLE")][0].id // empty')
if [[ -n "$SEED_DT_ID" ]]; then
  note "using seeded decision-table $SEED_DT_ID"
  R=$(exec_rule_jwt "$SEED_DT_ID" '{"customerTier":"platinum","orderAmount":1500}')
  STATUS=$(echo "$R" | jq -r '.data.success // .success')
  assert_eq "decision-table executes (any output)" "true" "$STATUS"
else
  skip "decision-table tests" "no seeded rule found in project"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "rule type 6: AI_AGENT (skipped without LLM key)"
if [[ -n "${ANTHROPIC_API_KEY:-}${OPENAI_API_KEY:-}" ]]; then
  AI_DEF='{"model":"claude-haiku-4-5","prompt":"Decide if the user is at high risk based on input.\n\nInput: {input}\n","annotations":[{"field":"risk","type":"string","description":"low|med|high"},{"field":"reason","type":"string","description":"one line"}]}'
  AI_ID=$(create_rule "AI_AGENT" "$AI_DEF") || true
  if [[ -n "$AI_ID" ]]; then
    R=$(exec_rule_jwt "$AI_ID" '{"income":20000,"fico":480,"defaults":2}')
    note "AI output: $(echo "$R" | jq -c '.data.output')"
    assert_truthy "AI returns risk field" "$(echo "$R" | jq -r '.data.output.risk // empty')"
  fi
else
  skip "ai_agent tests" "ANTHROPIC_API_KEY/OPENAI_API_KEY not set"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "publish + version pinning"
if [[ -n "$SC_ID" ]]; then
  PUB=$(curl -sS -X POST "$BACKEND/rules/$SC_ID/publish" -H "$H_AUTH")
  V=$(echo "$PUB" | jq -r '.data.version // empty')
  assert_truthy "publish returns version" "$V"

  # bump definition (different points scheme)
  curl -sS -X PUT "$BACKEND/rules/$SC_ID" -H "$H_AUTH" \
    -H 'Content-Type: application/json' \
    -d '{"definition":{"attributes":[{"name":"income","bands":[{"match":{"gte":80000},"points":99}]}],"thresholds":[{"score":99,"decision":"premium"}]}}' >/dev/null
  curl -sS -X POST "$BACKEND/rules/$SC_ID/publish" -H "$H_AUTH" >/dev/null

  R=$(curl -sS -X POST "$BACKEND/api/v1/rules/$SC_ID/v/1/execute" \
    -H "X-API-Key: $API_KEY" -H 'Content-Type: application/json' \
    -d '{"input":{"income":95000,"fico":740}}')
  assert_eq "version 1 still returns approve" '"approve"' "$(echo "$R" | jq -c '.output.decision')"

  R=$(curl -sS -X POST "$BACKEND/api/v1/rules/$SC_ID/v/2/execute" \
    -H "X-API-Key: $API_KEY" -H 'Content-Type: application/json' \
    -d '{"input":{"income":95000}}')
  assert_eq "version 2 returns premium" '"premium"' "$(echo "$R" | jq -c '.output.decision')"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "openapi generator"
if [[ -n "$SC_ID" ]]; then
  SPEC=$(curl -sS "$BACKEND/api/v1/rules/$SC_ID/openapi.json" -H "X-API-Key: $API_KEY")
  V=$(echo "$SPEC" | jq -r '.openapi // empty')
  assert_eq "openapi.json reports 3.1.0" "3.1.0" "$V"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "audit + executions log"
EXECS=$(curl -sS "$BACKEND/executions?limit=20" -H "$H_AUTH")
N=$(echo "$EXECS" | jq -r '.data | length')
assert_truthy "executions returned (>0)" "$([[ "$N" -gt 0 ]] && echo "$N")"

# ─────────────────────────────────────────────────────────────────────────────
step "test suites"
if [[ -n "$SC_ID" ]]; then
  TS=$(curl -sS -X POST "$BACKEND/test-suites" -H "$H_AUTH" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg p "$PROJECT_ID" --arg r "$SC_ID" \
      '{name:"Smoke Suite",projectId:$p,ruleIds:[{ruleId:$r}]}')")
  TS_ID=$(echo "$TS" | jq -r '.data.id // empty')
  assert_truthy "test suite created" "$TS_ID"

  if [[ -n "$TS_ID" ]]; then
    DS=$(curl -sS -X POST "$BACKEND/datasets" -H "$H_AUTH" \
      -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg p "$PROJECT_ID" \
        '{name:"Smoke DS",projectId:$p,inline:[{income:95000,fico:740},{income:55000,fico:690},{income:20000,fico:600}]}')")
    DS_ID=$(echo "$DS" | jq -r '.data.id // empty')
    assert_truthy "dataset created" "$DS_ID"

    if [[ -n "$DS_ID" ]]; then
      RUN=$(curl -sS -X POST "$BACKEND/test-suites/$TS_ID/run" -H "$H_AUTH" \
        -H 'Content-Type: application/json' \
        -d "$(jq -nc --arg d "$DS_ID" '{datasetId:$d}')")
      RUN_STATUS=$(echo "$RUN" | jq -r '.data.status // .status // empty')
      assert_truthy "test run completed" "$RUN_STATUS"
      assert_truthy "test run has passed count" "$(echo "$RUN" | jq -r '.data.passed // .passed // empty')"
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
step "tools — duplicates + dependencies + DRD"
if [[ -n "$SEED_DT_ID" ]]; then
  D=$(curl -sS "$BACKEND/tools/duplicates/$SEED_DT_ID" -H "$H_AUTH")
  assert_truthy "duplicates endpoint returns" "$(echo "$D" | jq -r '.success // empty')"
fi
if [[ -n "$SC_ID" ]]; then
  D=$(curl -sS "$BACKEND/tools/dependencies/$SC_ID" -H "$H_AUTH")
  assert_truthy "dependencies endpoint returns" "$(echo "$D" | jq -r '.success // empty')"
fi
DRD=$(curl -sS "$BACKEND/tools/drd/$PROJECT_ID" -H "$H_AUTH")
assert_truthy "drd endpoint returns nodes" "$(echo "$DRD" | jq -r '.data.nodes // empty | length')"

# ─────────────────────────────────────────────────────────────────────────────
step "webhooks — register + dispatch"
HOOK=$(curl -sS -X POST "$BACKEND/webhooks" -H "$H_AUTH" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg w "$WS_REAL" \
    '{name:"smoke",url:"http://localhost:9999/never-listens",events:["execute.success"],workspaceId:$w}')")
HOOK_ID=$(echo "$HOOK" | jq -r '.data.id // empty')
HOOK_SECRET=$(echo "$HOOK" | jq -r '.secret // .data.secret // empty')
assert_truthy "webhook created" "$HOOK_ID"
assert_truthy "webhook secret returned (whsec_*)" "$HOOK_SECRET"

if [[ -n "$HOOK_ID" ]]; then
  curl -sS -X DELETE "$BACKEND/webhooks/$HOOK_ID" -H "$H_AUTH" >/dev/null
fi

# ─────────────────────────────────────────────────────────────────────────────
step "summary"
TOTAL=$((PASS+FAIL+SKIP))
printf "\n  %s passed, %s failed, %s skipped (%s total)\n\n" \
  "$(c_green "$PASS")" "$(c_red "$FAIL")" "$(c_yellow "$SKIP")" "$TOTAL"
if [[ $FAIL -gt 0 ]]; then
  echo "FAILED:"
  for n in "${FAILED_NAMES[@]}"; do echo "  - $n"; done
  exit 1
fi
exit 0
