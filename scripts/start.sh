#!/usr/bin/env bash
# CarTrade Fabric: safe one-command startup + end-to-end smoke verification.
# Run from anywhere: ./cartrade-one-go.sh
# This script intentionally does NOT reset the Fabric network or redeploy chaincode.

set -Eeuo pipefail

REPO="${CARTRADE_REPO:-$HOME/Projects/cartrade-fabric}"
TEST_NETWORK="${FABRIC_TEST_NETWORK:-$HOME/Projects/hyperledger/fabric-samples/test-network}"
BASE_URL="${CARTRADE_BASE_URL:-http://localhost:4000}"
COMPOSE_FILE="${CARTRADE_COMPOSE_FILE:-}"
PASS=0
FAIL=0
SKIP=0

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
section(){ printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

need() {
  command -v "$1" >/dev/null 2>&1 || { red "Missing required command: $1"; exit 2; }
}

for cmd in docker curl jq; do need "$cmd"; done

[[ -d "$REPO" ]] || { red "Repository not found: $REPO"; exit 2; }
cd "$REPO"

section "1. Check prerequisites"
docker info >/dev/null 2>&1 || { red "Docker daemon is unavailable. Start it first (e.g. sudo systemctl start docker)."; exit 2; }
green "Docker daemon is running."
[[ -d "$TEST_NETWORK" ]] && green "Fabric test-network directory found." || yellow "Fabric test-network directory not found; continuing with current network."

section "2. Start/recreate only the CarTrade SDK"
# Prefer the SDK-local Compose file if present; never run 'down', prune, or network reset.
if [[ -n "$COMPOSE_FILE" ]]; then
  [[ -f "$COMPOSE_FILE" ]] || { red "Compose file not found: $COMPOSE_FILE"; exit 2; }
  docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate cartrade-sdk
elif [[ -f "$REPO/compose.yaml" ]]; then
  docker compose -f "$REPO/compose.yaml" up -d --build --force-recreate cartrade-sdk
elif [[ -f "$REPO/docker-compose.yml" ]]; then
  docker compose -f "$REPO/docker-compose.yml" up -d --build --force-recreate cartrade-sdk
elif [[ -f "$REPO/sdk/compose.yaml" ]]; then
  docker compose -f "$REPO/sdk/compose.yaml" up -d --build --force-recreate cartrade-sdk
elif [[ -f "$REPO/sdk/docker-compose.yml" ]]; then
  docker compose -f "$REPO/sdk/docker-compose.yml" up -d --build --force-recreate cartrade-sdk
else
  yellow "Could not identify the Compose file automatically."
  yellow "Set CARTRADE_COMPOSE_FILE=/absolute/path/to/compose.yaml and rerun."
  exit 2
fi

section "3. Wait for REST API"
ready=0
for _ in $(seq 1 30); do
  if curl -fsS "$BASE_URL/health" >/tmp/cartrade-health.json 2>/dev/null; then ready=1; break; fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  red "SDK did not become healthy at $BASE_URL/health"
  yellow "Inspect: docker ps -a; docker logs --tail 150 cartrade-sdk"
  exit 1
fi
cat /tmp/cartrade-health.json; printf '\n'
green "SDK health endpoint responded."

# run_check LABEL EXPECTED_HTTP METHOD PATH [IDENTITY] [JSON_BODY]
run_check() {
  local label="$1" expected="$2" method="$3" path="$4" identity="${5:-}" body="${6:-}"
  local tmp code
  tmp="$(mktemp)"
  local args=(-sS -o "$tmp" -w '%{http_code}' -X "$method" "$BASE_URL$path")
  [[ -n "$identity" ]] && args+=(-H "X-Fabric-Identity: $identity")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data "$body")
  if ! code="$(curl "${args[@]}")"; then
    red "FAIL: $label (curl/network error)"
    rm -f "$tmp"; ((FAIL+=1)); return
  fi
  if [[ "$code" == "$expected" ]]; then
    green "PASS: $label (HTTP $code)"
    ((PASS+=1))
  else
    red "FAIL: $label (expected HTTP $expected, got $code)"
    cat "$tmp"; printf '\n'
    ((FAIL+=1))
  fi
  rm -f "$tmp"
}

section "4. Verify vehicle lifecycle read paths"
# These records were created during the previous verified run.
run_check "Read VEHICLE-002 as dealer" 200 GET "/api/vehicles/VEHICLE-002" dealer
run_check "Read VEHICLE-002 as buyer" 200 GET "/api/vehicles/VEHICLE-002" buyer
run_check "Read VEHICLE-002 history" 200 GET "/api/vehicles/VEHICLE-002/history" dealer
run_check "Inspector forbidden from private deal" 403 GET "/api/deals/VEHICLE-002" inspector

section "5. Verify private deal access"
run_check "Dealer can read VEHICLE-002 private deal" 200 GET "/api/deals/VEHICLE-002" dealer
run_check "Buyer can read VEHICLE-002 private deal" 200 GET "/api/deals/VEHICLE-002" buyer

section "6. Verify token read paths"
run_check "Read dealer token balance" 200 GET "/api/tokens/balance/Org1MSP" dealer
run_check "Read buyer token balance" 200 GET "/api/tokens/balance/Org2MSP" buyer
run_check "Read dealer-to-buyer allowance" 200 GET "/api/tokens/allowance/Org1MSP/Org2MSP" dealer
run_check "Read total token supply" 200 GET "/api/tokens/total-supply" dealer

section "7. Verify role enforcement"
# A dealer attempting an inspector-only operation must be forbidden.
run_check "Dealer cannot inspect vehicle" 403 POST "/api/vehicles/VEHICLE-002/inspect" dealer '{"result":"PASSED"}'

section "Summary"
printf 'Passed: %d | Failed: %d | Skipped: %d\n' "$PASS" "$FAIL" "$SKIP"
if (( FAIL > 0 )); then
  red "Some checks failed. Review SDK logs and ensure the 3-org network, wallet identities, channel, and chaincodes are already configured."
  exit 1
fi
green "All smoke checks passed."
printf '\nNote: this script starts the SDK and verifies the existing ledger. It deliberately does not create identities, reset the network, or deploy chaincode.\n'
printf 'Why: Org3 is custom to this assignment and chaincode lifecycle sequence must not be blindly redeployed over the current channel.\n'
