# CarTrade --- Workflow-to-Code Map and End-to-End Verification Playbook

> This document maps the REST workflows to the code layers, explains
> execution order, provides complete `curl` requests, and gives an
> ordered verification plan.
>
> **Repository:** `cartrade-fabric`\
> **SDK:** Node.js + Express, normally `http://localhost:4000`\
> **Channel:** `cartrade-channel`\
> **Chaincodes:** `vehicle`, `erc20`\
> **Identity header:** `X-Fabric-Identity: dealer | buyer | inspector`
>
> **Accuracy note:** File names and routes below are grounded in the
> project structure and code excerpts available during this work. The
> controller/chaincode call names and tested outcomes are included where
> known. Some success-response JSON fields vary by controller and were
> not all captured verbatim; where exact JSON was not recorded, this
> guide describes the expected response shape instead of inventing an
> exact payload. Confirm any request-body fields against the current
> controller before using this as a formal API contract.

---

## 1. The execution path for every API call

Most business requests follow this sequence:

```text
curl / Postman
  |
  v
HTTP request to sdk/src/index.js Express app
  |
  +--> helmet / express.json / morgan
  |
  +--> sdk/src/middleware/identity.middleware.js
  |      reads X-Fabric-Identity; defaults/validates identity context
  |
  +--> Express mount in sdk/src/index.js
  |
  +--> sdk/src/routes/<feature>.routes.js
  |      matches HTTP method + path; asyncHandler forwards rejections
  |
  +--> sdk/src/controllers/<feature>.controller.js
  |      validates/normalizes input; invokes a service method
  |
  +--> sdk/src/services/fabric.service.js
  |      loads wallet identity, creates/reuses Fabric Gateway session,
  |      selects channel + chaincode, evaluate() or submit()
  |
  +--> Fabric Gateway over gRPC/TLS -> peer endorsement / chaincode
  |
  +--> chaincode/<vehicle|erc20>/lib/*-contract.js
  |      checks role, arguments, state, balances/permissions
  |
  +--> ledger/world state or private-data collection
  |
  +--> controller formats HTTP success response
  |
  +--> sdk/src/middleware/error.middleware.js on failures
         formats { success:false, error, path } and HTTP status
```

### Files and responsibilities

---

File Role in request execution

---

`sdk/src/index.js` Loads environment; creates Express
app and services/controllers;
registers global middleware,
health/API endpoints, route mounts,
404 and error middleware; listens
on port 4000

`sdk/src/config/network.config.js` Maps `dealer`, `buyer`, `inspector`
to organization configuration/MSP,
endpoints, TLS paths and related
settings

`sdk/src/middleware/identity.middleware.js` Reads identity header and attaches
request identity context; check its
current implementation for exact
default/validation behavior

`sdk/src/middleware/async-handler.js` Wraps async route handlers so
rejected promises reach Express
error middleware

`sdk/src/middleware/error.middleware.js` Central HTTP error mapping; formats
failure JSON and maps recognized
chaincode authorization failures to
403

`sdk/src/routes/identity.routes.js` Maps identity HTTP endpoints to
identity controller methods

`sdk/src/routes/vehicle.routes.js` Maps vehicle HTTP endpoints to
vehicle controller methods

`sdk/src/routes/deal.routes.js` Maps deal endpoints to deal
controller methods

`sdk/src/routes/token.routes.js` Maps token endpoints to token
controller methods

`sdk/src/controllers/identity.controller.js` Handles register, enroll and
identity-list requests

`sdk/src/controllers/vehicle.controller.js` Handles registration, read,
inspection, verification, transfer
and history requests

`sdk/src/controllers/deal.controller.js` Handles private-deal creation and
retrieval

`sdk/src/controllers/token.controller.js` Handles token initialization, mint,
balance, transfer, approve,
allowance, transferFrom, burn and
supply

`sdk/src/services/identity.service.js` Connects to Fabric CA,
registers/enrolls identities, reads
CA TLS material, and stores/loads
identities in the wallet

`sdk/src/services/fabric.service.js` Creates/caches Gateway sessions;
selects `cartrade-channel` and
chaincode; invokes evaluate or
submit; parses returned bytes

`chaincode/vehicle/index.js` Chaincode entry point/export

`chaincode/vehicle/lib/vehicle-contract.js` Vehicle state transitions,
authorization, private deals,
history

`chaincode/erc20/index.js` Token chaincode entry point/export

`chaincode/erc20/lib/erc20-contract.js` Token balances, allowance,
transfers, mint, burn, total supply
and authorization

`collections/collections_config.json` Defines
`DealerBuyerPrivateCollection`;
attached to `vehicle` chaincode
deployment

`sdk/wallet/` Local identity credentials used by
Gateway; treat as secret material
----------------------------------------------------------------------------------

### `evaluate` vs `submit`

- **Evaluate/query:** reads ledger state without creating a
  state-changing transaction. Examples: vehicle read, history, deal
  read, token balance, allowance, total supply.
- **Submit/write:** submits a transaction that changes ledger state.
  Examples: register, inspect, verify, transfer ownership, create
  deal, mint, transfer token, approve, TransferFrom, burn.

A successful REST response is not a substitute for checking committed
state when verifying a write.

---

## 2. Identity aliases and common headers

Use these exact application aliases:

---

Alias MSP Role

---

`dealer` `Org1MSP` Registers/verifies/transfers
vehicles; issuer/dealer token
actions

`buyer` `Org2MSP` Buyer and recipient; reads
private deal

`inspector` `Org3MSP` Records inspection outcomes
------------------------------------------------------------------------------

Every example below includes:

```http
X-Fabric-Identity: dealer
Content-Type: application/json
```

The identity header is a local SDK identity selector, not production
authentication. Never use a client-controlled identity header as the
only authorization control on a public API.

Set a base URL in your shell to reduce repetition:

```bash
export API=http://localhost:4000
```

To see the API's advertised routes and identity header:

```bash
curl -i "$API/health"
curl -i "$API/api"
curl -i "$API/api/identity"
```

Expected: - `/health`: HTTP 200 with `success: true`, service name and
channel. - `/api`: HTTP 200 with service name, supported identity
aliases and route prefixes. - `/api/identity`: HTTP 200
listing/representing wallet identities, according to the controller.

---

## 3. Workflow A --- Register / enroll identities

Identity creation is a CA workflow, not a vehicle-chaincode workflow.

### A1. Register an identity

**Endpoint:** `POST /api/identity/register`\
**Route file:** `sdk/src/routes/identity.routes.js`\
**Controller:** `sdk/src/controllers/identity.controller.js` → register
handler\
**Service:** `sdk/src/services/identity.service.js` →
`registerUser(...)`\
**Configuration:** `sdk/src/config/network.config.js`\
**Network dependency:** correct organization CA URL, CA name, CA TLS
root and authorized registrar identity.

The request body must match the current `identity.controller.js`. The
documented contract is to provide the user/identity alias and
organization mapping fields used by the controller. Since the exact
current body schema was not fully captured in the available excerpts,
inspect it before copying a body from an old version:

```bash
sed -n '1,220p' sdk/src/controllers/identity.controller.js
sed -n '1,240p' sdk/src/services/identity.service.js
```

**Expected success:** HTTP 2xx JSON confirming registration or the
created identity.\
**Expected failure:** HTTP 4xx/5xx JSON from `error.middleware.js`;
examples encountered include unknown alias, missing CA TLS file, CA TLS
trust failure, and registrar authorization failure.

### A2. Enroll the identity

**Endpoint:** `POST /api/identity/enroll`\
**Route file:** `sdk/src/routes/identity.routes.js`\
**Controller:** `identity.controller.js` → enroll handler\
**Service:** `identity.service.js` → enroll flow; stores
certificate/private key identity in `sdk/wallet`.

Again, use the current controller's accepted body rather than guessing:

```bash
sed -n '1,220p' sdk/src/controllers/identity.controller.js
```

**Expected success:** HTTP 2xx confirming enrollment/wallet identity.\
**Expected failure:** CA enrollment credentials invalid, identity
already enrolled, TLS path/URL invalid, or wallet write failure.

### A3. Verify identity aliases

```bash
curl -i "$API/api/identity"
```

Then check the wallet aliases on disk:

```bash
ls -la sdk/wallet
```

Do not print private-key contents or commit the wallet. If an API call
says `Identity 'dealer' is not enrolled in the wallet`, the selected
alias is not available to the running SDK's wallet even if the CA
service itself is healthy.

---

## 4. Workflow B --- Register a vehicle

**Endpoint:** `POST /api/vehicles/register`\
**Identity:** `dealer`\
**Route:** `sdk/src/routes/vehicle.routes.js`\
**Controller:** `sdk/src/controllers/vehicle.controller.js` →
registration handler\
**Service:** `sdk/src/services/fabric.service.js` → vehicle submit
helper\
**Chaincode:** `chaincode/vehicle/lib/vehicle-contract.js` →
registration transaction\
**Operation type:** submit/write.

### Execution order

1.  `curl` sends JSON and `X-Fabric-Identity: dealer`.
2.  `sdk/src/index.js` parses JSON and runs middleware.
3.  Vehicle route matches `POST /register`; async wrapper forwards
    failures.
4.  Vehicle controller extracts registration fields and calls the Fabric
    service.
5.  Fabric service resolves `dealer` from the wallet, opens/reuses
    Gateway, selects `cartrade-channel` and `vehicle`.
6.  Gateway submits the registration transaction to Fabric.
7.  Chaincode validates the input and creates the initial vehicle state.
8.  HTTP response returns; query the vehicle to verify persisted state.

### Request

The known vehicle fields are `vehicleId`, `manufacturer`, `model`,
`year`, and `vin`. Confirm the current controller's exact input
validation before use:

```bash
sed -n '1,220p' sdk/src/controllers/vehicle.controller.js
```

Example using a new ID:

```bash
curl -i -X POST "$API/api/vehicles/register" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{
    "vehicleId": "VEHICLE-003",
    "manufacturer": "Toyota",
    "model": "Corolla",
    "year": 2024,
    "vin": "JTDBR32E720123457"
  }'
```

Use a VIN and vehicle ID that are unique in your current ledger. Do not
rerun the same write blindly.

### Expected success

HTTP 2xx and a success JSON response from the vehicle controller. The
exact wrapper depends on the current controller. Query the record next:

```bash
curl -i "$API/api/vehicles/VEHICLE-003" \
  -H 'X-Fabric-Identity: dealer'
```

Expected initial state conceptually: - `inspectionStatus`: `PENDING` -
`verified`: `false` - `owner`: `Org1MSP` - `status`: `AVAILABLE`

### Expected failure

- Duplicate vehicle key / invalid fields: chaincode or controller
  validation error.
- Missing wallet identity: identity service failure before Gateway
  invocation.
- Wrong chaincode/channel or peer/TLS issue: Gateway/endorsement
  failure.
- SDK crash: inspect `docker compose logs --tail=150 cartrade-sdk`.

---

## 5. Workflow C --- Inspect a vehicle

**Endpoint:** `POST /api/vehicles/:vehicleId/inspect`\
**Identity:** `inspector` (`Org3MSP`) only\
**Controller:** `vehicle.controller.js` → inspect handler\
**Chaincode:** `vehicle-contract.js` → `InspectVehicle`\
**Operation:** submit/write.

### Execution order

Route → controller reads `vehicleId` and `result` → Fabric service
submits `InspectVehicle` → chaincode verifies caller MSP is `Org3MSP` →
validates `PASSED`/`FAILED` and vehicle lifecycle → updates state → HTTP
response.

### Successful inspection

```bash
curl -i -X POST "$API/api/vehicles/VEHICLE-003/inspect" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: inspector' \
  -d '{"result":"PASSED"}'
```

Valid values: `PASSED` or `FAILED`.

Expected success: HTTP 2xx; subsequent GET should show
`inspectionStatus: PASSED` or `FAILED`. A failed inspection clears
`verified`. A sold vehicle cannot be inspected again.

### Negative authorization test

```bash
curl -i -X POST "$API/api/vehicles/VEHICLE-003/inspect" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"result":"PASSED"}'
```

Expected: **HTTP 403 Forbidden** with a message like
`Only Org3 Inspector can inspect vehicles`. This is a deliberate test;
the request must not change the vehicle.

---

## 6. Workflow D --- Verify a vehicle

**Endpoint:** `POST /api/vehicles/:vehicleId/verify`\
**Identity:** `dealer` (`Org1MSP`)\
**Controller:** `vehicle.controller.js` → verify handler\
**Chaincode:** `vehicle-contract.js` → `VerifyVehicle`\
**Operation:** submit/write.

### Preconditions

- Vehicle exists.
- Inspection status is `PASSED`.
- Vehicle is not sold.
- Caller is Org1 dealer.

### Request

```bash
curl -i -X POST "$API/api/vehicles/VEHICLE-003/verify" \
  -H 'X-Fabric-Identity: dealer'
```

No body was required in the observed route contract; if the current
controller requires a body, follow its validation.

### Expected success

HTTP 2xx; GET should show `verified: true` and
`inspectionStatus: PASSED`.

```bash
curl -i "$API/api/vehicles/VEHICLE-003" \
  -H 'X-Fabric-Identity: dealer'
```

### Expected failure

- Inspection still `PENDING` or `FAILED`.
- Wrong caller identity.
- Vehicle already sold or missing.
- Fabric infrastructure/endorsement error.

---

## 7. Workflow E --- Create a private dealer--buyer deal

**Endpoint:** `POST /api/deals`\
**Identity:** `dealer`\
**Route:** `sdk/src/routes/deal.routes.js`\
**Controller:** `sdk/src/controllers/deal.controller.js`\
**Service:** `fabric.service.js` → vehicle contract private-deal helper\
**Chaincode:** `vehicle-contract.js` → private deal create function\
**Collection:** `DealerBuyerPrivateCollection`\
**Operation:** submit/write.

### Preconditions

The vehicle must be verified and not sold. The deal data is written to
the private collection rather than ordinary public vehicle state.

### Request

```bash
curl -i -X POST "$API/api/deals" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{
    "vehicleId": "VEHICLE-003",
    "originalPrice": 1250000,
    "discount": 50000
  }'
```

The API calculates `finalPrice`; the chaincode independently checks the
arithmetic. Expected values: - `originalPrice`: 1,250,000 - `discount`:
50,000 - `finalPrice`: 1,200,000 - `currency`: `INR`

### Verify reads

```bash
curl -i "$API/api/deals/VEHICLE-003" \
  -H 'X-Fabric-Identity: dealer'

curl -i "$API/api/deals/VEHICLE-003" \
  -H 'X-Fabric-Identity: buyer'
```

Expected: both dealer and buyer can read the private deal.

### Negative privacy test

```bash
curl -i "$API/api/deals/VEHICLE-003" \
  -H 'X-Fabric-Identity: inspector'
```

Expected: **HTTP 403 Forbidden**, with an authorization message such as
`Only Org1 Dealer and Org2 Buyer can read the private deal`.

This proves that Org3's inspection role does not grant access to
commercial deal data. The collection config must be deployed with the
`vehicle` chaincode.

---

## 8. Workflow F --- Transfer vehicle ownership / mark sold

**Endpoint:** `POST /api/vehicles/:vehicleId/transfer`\
**Identity:** `dealer`\
**Controller:** `vehicle.controller.js` → transfer handler\
**Chaincode:** `vehicle-contract.js` → `TransferOwnership`\
**Operation:** submit/write.

### Preconditions

- Vehicle exists.
- Current owner is `Org1MSP`.
- Vehicle is verified.
- Vehicle is not already sold.
- New owner is `Org2MSP`.

### Request

```bash
curl -i -X POST "$API/api/vehicles/VEHICLE-003/transfer" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"newOwnerMSP":"Org2MSP"}'
```

### Expected success

HTTP 2xx. Verify state:

```bash
curl -i "$API/api/vehicles/VEHICLE-003" \
  -H 'X-Fabric-Identity: buyer'
```

Expected: - `owner`: `Org2MSP` - `status`: `SOLD` - `verified`: remains
true unless the implementation explicitly changes it.

### Expected failure

Wrong identity, vehicle not verified, current owner not Org1, target
owner not Org2, or already sold. Use a dedicated test vehicle: transfer
is a meaningful state change and should not be repeated on `VEHICLE-001`
or another already-sold vehicle.

---

## 9. Workflow G --- Read vehicle state and history

### Current state

**Endpoint:** `GET /api/vehicles/:vehicleId`\
**Controller:** `vehicle.controller.js` → get handler\
**Service:** `fabric.service.js` → `evaluate(...)`\
**Chaincode:** vehicle query transaction (the project uses a
`GetVehicle`-style query).

```bash
curl -i "$API/api/vehicles/VEHICLE-003" \
  -H 'X-Fabric-Identity: dealer'
```

Expected: HTTP 200 with the current vehicle JSON. A nonexistent ID
should return an error according to the chaincode/controller error
mapping.

### History

**Endpoint:** `GET /api/vehicles/:vehicleId/history`\
**Controller:** `vehicle.controller.js` → history handler\
**Service:** Fabric service `evaluate(...)`\
**Chaincode:** history implementation uses Fabric's `getHistoryForKey`
API.

```bash
curl -i "$API/api/vehicles/VEHICLE-003/history" \
  -H 'X-Fabric-Identity: dealer'
```

Expected: HTTP 200 with historical entries (transaction ID, timestamp,
delete marker and serialized state). The history implementation was
corrected to iterate using explicit `iterator.next()` and close the
iterator in `finally`; do not replace it with `for await...of` unless
the iterator supports async iteration.

History is newest-first in the observed API output. For `VEHICLE-002`,
the recorded history contained four states: registration, inspection,
verification, and a later inspection that retained verification. Each
new state-changing call can add another history entry.

---

## 10. Workflow H --- Initialize AutoCoin

**Endpoint:** `POST /api/tokens/initialize`\
**Identity:** `dealer` (`Org1MSP`)\
**Controller:** `token.controller.js` → initialize\
**Service:** `fabric.service.js` → token `initialize` → submit\
**Chaincode:** `chaincode/erc20/lib/erc20-contract.js` → `Initialize`.

```bash
curl -i -X POST "$API/api/tokens/initialize" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"name":"AutoCoin","symbol":"AUTO"}'
```

Expected: HTTP 2xx. Initialization is a one-time state change; if the
token is already initialized, the chaincode may reject a second
initialization. Do not run this repeatedly on the live demo ledger.

Demo assumption: `1 AUTO = ₹1`; this is not a real market valuation.

---

## 11. Workflow I --- Mint tokens

**Endpoint:** `POST /api/tokens/mint`\
**Identity:** `dealer` / Org1 issuer only\
**Chaincode:** `erc20-contract.js` → `Mint`.

```bash
curl -i -X POST "$API/api/tokens/mint" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"account":"Org1MSP","amount":1250000}'
```

Expected: HTTP 2xx; dealer balance and total supply increase by
1,250,000. Minting again increases them again, so this command is **not
idempotent**.

Expected failures: token not initialized, invalid/non-positive amount,
wrong caller organization, or invalid account.

---

## 12. Workflow J --- Read token balance and total supply

### Balance

**Endpoint:** `GET /api/tokens/balance/:account`\
**Controller:** `token.controller.js`\
**Service:** token `balance` → evaluate `BalanceOf`.

```bash
curl -i "$API/api/tokens/balance/Org1MSP" \
  -H 'X-Fabric-Identity: dealer'

curl -i "$API/api/tokens/balance/Org2MSP" \
  -H 'X-Fabric-Identity: buyer'
```

### Total supply

**Endpoint:** `GET /api/tokens/total-supply`\
**Chaincode:** `TotalSupply`.

```bash
curl -i "$API/api/tokens/total-supply" \
  -H 'X-Fabric-Identity: dealer'
```

Expected: HTTP 200 and numeric balances/supply in the controller's JSON
wrapper. These are reads and should not change ledger state.

---

## 13. Workflow K --- Direct token transfer

**Endpoint:** `POST /api/tokens/transfer`\
**Identity:** must correspond to the `from` account\
**Chaincode:** `erc20-contract.js` → `Transfer`.

```bash
curl -i -X POST "$API/api/tokens/transfer" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{
    "from": "Org1MSP",
    "to": "Org2MSP",
    "amount": 100
  }'
```

Expected: HTTP 2xx; Org1 balance decreases by 100, Org2 increases by
100, total supply stays the same.

Failure conditions include insufficient balance, non-positive/invalid
amount, or caller MSP not matching `from`.

---

## 14. Workflow L --- Approve allowance

**Endpoint:** `POST /api/tokens/approve`\
**Identity:** owner (`Org1MSP`)\
**Chaincode:** `erc20-contract.js` → `Approve`.

```bash
curl -i -X POST "$API/api/tokens/approve" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{
    "owner": "Org1MSP",
    "spender": "Org2MSP",
    "amount": 500
  }'
```

Expected: HTTP 2xx; allowance Org1MSP → Org2MSP becomes 500 (or the
amount specified). Approval is not a transfer and does not change
balances or supply.

Read allowance:

```bash
curl -i "$API/api/tokens/allowance/Org1MSP/Org2MSP" \
  -H 'X-Fabric-Identity: buyer'
```

Expected: numeric allowance in a successful response.

---

## 15. Workflow M --- TransferFrom using allowance

**Endpoint:** `POST /api/tokens/transfer-from`\
**Identity:** spender (`Org2MSP`)\
**Chaincode:** `erc20-contract.js` → `TransferFrom`.

```bash
curl -i -X POST "$API/api/tokens/transfer-from" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: buyer' \
  -d '{
    "spender": "Org2MSP",
    "from": "Org1MSP",
    "to": "Org2MSP",
    "amount": 50
  }'
```

Expected: HTTP 2xx; source balance decreases by 50, destination balance
increases by 50, allowance decreases by 50, supply stays the same.

The recorded demo request was accidentally run twice at one point; this
is why the final observed balances reflected two 50-token `TransferFrom`
operations. Treat it as a non-idempotent write.

Failure conditions: wrong spender identity, insufficient allowance,
insufficient source balance, invalid amount.

---

## 16. Workflow N --- Burn tokens

**Endpoint:** `POST /api/tokens/burn`\
**Identity:** account being burned (`Org1MSP` in this example)\
**Chaincode:** `erc20-contract.js` → `Burn`.

```bash
curl -i -X POST "$API/api/tokens/burn" \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"account":"Org1MSP","amount":10}'
```

Expected: HTTP 2xx; dealer balance and total supply each decrease by 10.
Buyer balance is unchanged.

The final observed demo state after burning 10 AUTO: - Org1MSP balance:
1,249,790 AUTO - Org2MSP balance: 200 AUTO - Total supply: 1,249,990
AUTO - Org1MSP → Org2MSP allowance: 400 AUTO

Those are existing-ledger values, not values expected from a fresh
deployment.

---

## 17. Error and middleware workflow

When a request fails, the intended flow is:

```text
route asyncHandler(...)
    |
    +-- controller/service rejects or throws
             |
             v
       next(error)
             |
             v
sdk/src/middleware/error.middleware.js
             |
             +-- identify HTTP status / Fabric endorsement details
             +-- log server-side errors
             +-- return JSON with success:false, error, path
```

The standard failure response shape is:

```json
{
  "success": false,
  "error": "Meaningful error message",
  "path": "/api/vehicles/VEHICLE-003/inspect"
}
```

### Known expected authorization responses

---

Test Expected HTTP Meaning

---

Dealer calls inspect 403 Only Org3 Inspector
can inspect

Inspector reads 403 Org3 is not allowed
private deal to read private deal

Dealer reads private 200 Collection member and
deal authorized role

Buyer reads private 200 Collection member and
deal authorized role
------------------------------------------------------------------------

A Fabric endorsement error may contain the actual chaincode rejection in
`error.details[]`. The middleware must inspect that nested error
information to avoid converting an expected permission denial into a
generic HTTP 500.

### Debug commands

```bash
docker compose ps
docker compose logs --tail=150 cartrade-sdk
docker compose logs -f cartrade-sdk
docker inspect cartrade-sdk --format 'status={{.State.Status}} restarts={{.RestartCount}}'
```

Use `docker logs <container>` for a specific CA or chaincode container.
Use `docker compose logs <service>` for Compose-managed services.

---

## 18. Full end-to-end verification order

This is the recommended order for a **fresh test vehicle**. It avoids
invalid lifecycle transitions and minimizes accidental repeat writes.

### Phase 0 --- Infrastructure

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker compose ps
curl -i "$API/health"
curl -i "$API/api"
```

Do not proceed if the SDK is restarting or the Fabric
peer/orderer/required CA services are down.

### Phase 1 --- Network and chaincode readiness

With the appropriate Fabric peer environment configured:

```bash
peer lifecycle chaincode querycommitted -C cartrade-channel
peer lifecycle chaincode queryinstalled
```

Confirm `vehicle` and `erc20` are committed on `cartrade-channel`.
Ensure the vehicle chaincode was deployed with
`collections/collections_config.json`. Ensure Org3 is actually part of
the active network and joined to the channel.

### Phase 2 --- Wallet identities

```bash
curl -i "$API/api/identity"
```

If identities are not present, perform register then enroll for the
intended aliases using the exact current controller request schema.
Verify `dealer → Org1MSP`, `buyer → Org2MSP`, `inspector → Org3MSP`.

### Phase 3 --- Vehicle lifecycle

Use a new unique ID such as `VEHICLE-003`:

1.  Register as dealer.
2.  Read as dealer and confirm `PENDING`, `verified:false`,
    `owner:Org1MSP`, `status:AVAILABLE`.
3.  Inspect as inspector with `PASSED`.
4.  Read and confirm `inspectionStatus:PASSED`.
5.  Verify as dealer.
6.  Read and confirm `verified:true`.
7.  Read history and confirm state transitions.

### Phase 4 --- Private deal

1.  Create deal as dealer only after verification.
2.  Read deal as dealer --- expect 200.
3.  Read deal as buyer --- expect 200.
4.  Read deal as inspector --- expect 403.
5.  Confirm values and arithmetic:
    `finalPrice = originalPrice - discount`.

### Phase 5 --- Token flow

On a fresh ledger, and only once:

1.  Initialize `AutoCoin` / `AUTO`.
2.  Mint 1,250,000 AUTO to Org1MSP.
3.  Read Org1 balance and total supply.
4.  Transfer 100 AUTO from Org1MSP to Org2MSP.
5.  Approve 500 AUTO allowance from Org1MSP to Org2MSP.
6.  Verify allowance.
7.  Execute one `TransferFrom` for 50 AUTO as buyer/spender.
8.  Verify both balances and allowance.
9.  Burn 10 AUTO from Org1MSP.
10. Verify balances and total supply reconcile.

Do not rerun initialize/mint/transfer/TransferFrom/burn merely to see
the response again. Prefer balance/allowance/supply queries for
repeatable checks.

### Phase 6 --- Vehicle ownership transfer

Only after the vehicle is registered, inspection-passed and verified:

1.  Transfer as dealer with `newOwnerMSP: Org2MSP`.
2.  Query as buyer.
3.  Confirm owner `Org2MSP`, status `SOLD`.
4.  Confirm history includes the transfer state.
5.  Confirm a second transfer or inspection of the sold vehicle is
    rejected.

### Phase 7 --- Final negative tests

Run the negative tests last because they are intended to fail and should
not alter state:

- Dealer inspection attempt → 403.
- Inspector private-deal read → 403.
- Buyer/inspector attempt to mint → authorization failure.
- Invalid amount (zero/negative/non-integer) → validation failure.
- Unknown vehicle ID → not-found/business error.

Use the exact identity rules in
`chaincode/vehicle/lib/vehicle-contract.js` and
`chaincode/erc20/lib/erc20-contract.js`.

---

## 19. Response status quick reference

Exact success JSON wrappers are determined by the controller; inspect
them when documenting a strict contract. The following status
expectations are based on the API behavior exercised during this
project:

---

Situation Expected status What to inspect

---

Health/API route 200 JSON `success:true`
succeeds

Query succeeds 200 Returned state/value

Write succeeds 200 or another 2xx used by Success wrapper and
controller subsequent ledger
query

Invalid route 404 `Route not found`,
requested path

Missing/invalid input 400 or mapped `success:false`,
validation/business status meaningful error

Identity not enrolled 4xx/5xx depending error Wallet and network
/ bad alias mapping config

Chaincode role 403 Nested endorsement
rejection error correctly
mapped

CA TLS failure 5xx unless specifically CA URL, CA TLS root,
mapped certificate path

Peer/chaincode 5xx Peer/chaincode
runtime failure container logs
------------------------------------------------------------------------

Do not claim that every possible failure maps to one exact status until
the current error middleware and tests prove it.

---

## 20. How to inspect the exact current code before an interview/demo

From the repository root:

```bash
cd /home/nxl/Projects/cartrade-fabric

# Server and route mounting
sed -n '1,220p' sdk/src/index.js

# Route-to-controller mapping
sed -n '1,220p' sdk/src/routes/vehicle.routes.js
sed -n '1,180p' sdk/src/routes/deal.routes.js
sed -n '1,220p' sdk/src/routes/token.routes.js
sed -n '1,160p' sdk/src/routes/identity.routes.js

# Controller behavior and accepted request bodies
sed -n '1,240p' sdk/src/controllers/vehicle.controller.js
sed -n '1,220p' sdk/src/controllers/deal.controller.js
sed -n '1,260p' sdk/src/controllers/token.controller.js
sed -n '1,220p' sdk/src/controllers/identity.controller.js

# Service and error behavior
sed -n '1,260p' sdk/src/services/fabric.service.js
sed -n '1,260p' sdk/src/services/identity.service.js
sed -n '1,220p' sdk/src/middleware/identity.middleware.js
sed -n '1,220p' sdk/src/middleware/async-handler.js
sed -n '1,240p' sdk/src/middleware/error.middleware.js

# Authoritative business rules
sed -n '1,300p' chaincode/vehicle/lib/vehicle-contract.js
sed -n '1,320p' chaincode/erc20/lib/erc20-contract.js
cat collections/collections_config.json

# Syntax check and tests
cd sdk
npm run check
npm test
```

Use the actual scripts shown by `npm run` if this branch's
`package.json` differs.

## 21. Final mental model

For every workflow, remember the five questions:

1.  **Which HTTP route?** `sdk/src/routes/*.routes.js`
2.  **Which controller?** `sdk/src/controllers/*.controller.js`
3.  **Which service helper?** `identity.service.js` for CA/wallet;
    `fabric.service.js` for Gateway/channel/chaincode.
4.  **Which chaincode function and authorization rule?**
    `chaincode/*/lib/*-contract.js`
5.  **How do I prove it worked?** Read the state, balance, allowance,
    total supply or history after a write---and test the corresponding
    forbidden role separately.

This is the difference between proving that an HTTP endpoint responds
and proving that the full Fabric workflow behaves correctly.
