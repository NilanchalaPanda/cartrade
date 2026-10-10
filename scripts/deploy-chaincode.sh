#!/usr/bin/env bash
set -euo pipefail

: "${FABRIC_SAMPLES_DIR:?Set FABRIC_SAMPLES_DIR to your fabric-samples/test-network directory}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANNEL_NAME="${CHANNEL_NAME:-cartrade-channel}"

cd "$FABRIC_SAMPLES_DIR"

./network.sh deployCC \
  -ccn vehicle \
  -ccp "$REPO_ROOT/chaincode/vehicle" \
  -ccl javascript \
  -c "$CHANNEL_NAME" \
  -cccg "$REPO_ROOT/collections/collections_config.json"

./network.sh deployCC \
  -ccn erc20 \
  -ccp "$REPO_ROOT/chaincode/erc20" \
  -ccl javascript \
  -c "$CHANNEL_NAME"

echo "Vehicle and ERC20 chaincodes deployed to $CHANNEL_NAME"
