# CarTrade on Hyperledger Fabric --- Project, Assignment and Architecture Guide

> Purpose: a single revision document explaining what was built, why the
> components exist, the data schemas, authorization rules, API surface,
> and the assignment coverage.
>
> **Evidence note:** Current implementation and test results below are
> based on the project details and terminal outputs recorded during this
> work. Where the original assignment brief itself was not available
> verbatim, the "requirements" section describes the requirements
> reflected in the supplied training material and implemented
> project---not a claim that this reproduces an unseen rubric word for
> word.

## 1. Project in one minute

CarTrade is a local used-vehicle workflow implemented on Hyperledger
Fabric. Three organization identities have distinct roles:

- **Org1MSP --- Dealer:** registers vehicles, verifies an
  inspection-passed vehicle, creates/reads dealer--buyer deal
  information, and operates the token issuer account.
- **Org2MSP --- Buyer:** reads dealer--buyer private deal information
  and participates in token transfers/allowance-based transfers.
- **Org3MSP --- Inspector:** records vehicle inspection outcomes. Org3
  is intentionally excluded from the dealer--buyer private-data
  collection.

The application exposes a Node.js/Express REST API. The API loads a
named Fabric identity from a wallet and calls chaincode through Fabric
Gateway. Business rules are enforced in chaincode, not merely in the
REST controllers.

```text
curl / Postman
      |
      v
CarTrade REST SDK (Express, port 4000)
      | identity from wallet + Fabric Gateway over gRPC/TLS
      v
Fabric peer(s) ---- chaincode: vehicle / erc20
      |                         |
      |                         +-- public world state (vehicle state, token state)
      |                         +-- private collection (dealer/buyer deal terms)
      v
Ordering service -> channel blocks -> peer ledger / world state
```

## 2. What the major components do

---

Component Role in this project Remember this

---

Hyperledger Fabric Permissioned ledger shared Membership and
network by the organizations endorsement rules matter;
this is not a public
blockchain.

Organization / MSP Represents a member `Org1MSP`, `Org2MSP`, and
organization and its `Org3MSP` are membership
trusted identity material identities, not user
names.

Peer Hosts ledger copies, A peer endpoint and its
endorses proposals, runs TLS trust material must
chaincode execution, and match.
serves queries

Ordering service / Orders endorsed It orders transactions;
orderer transactions into blocks it does not replace
for a channel chaincode business
validation.

Channel Logical private ledger A chaincode committed on
(`cartrade-channel`) shared by channel members another channel is not
automatically available
here.

Fabric CA Registers/enrolls A CA URL, CA TLS
identities and issues certificate, registrar
X.509 certificates authority, and
credentials all need to
be correct.

Enrollment certificate Proves a client identity Its MSP ID and
to Fabric attributes/role are used
by chaincode
authorization.

TLS certificate Authenticates a TLS Do not confuse TLS trust
endpoint such as a CA or certificates with the
peer application identity
certificate used to sign
transactions.

Wallet (`sdk/wallet`) Stores the enrolled The API alias `dealer` is
identities used by the SDK mapped to a Fabric
identity belonging to
`Org1MSP`; it is not
itself an MSP.

Chaincode Business logic executed by It is the authoritative
Fabric peers place for vehicle,
private-deal, and token
rules.

`vehicle` chaincode Vehicle lifecycle, The private collection is
inspection/verification, configured with this
ownership transfer, chaincode.
private deals, and history

`erc20` chaincode AutoCoin token balances, ERC-20-style behavior
allowance, transfers, implemented on Fabric; it
mint, burn, and supply is not an Ethereum ERC-20
contract.

Private Data Collection Shares actual deal data Org1 and Org2 are
(PDC) only with collection members; Org3 is
members while Fabric excluded.
commits hashes on the  
channel ledger

Node.js / Express SDK HTTP endpoints, request It is an application
parsing, wallet identity adapter, not the source
selection, Gateway calls, of business truth.
and response formatting

Fabric Gateway Provides the client API to `evaluateTransaction()`
evaluate or submit is for queries;
chaincode transactions `submitTransaction()` is
for state-changing calls.

Docker Engine Runs containers on the `docker ps` shows runtime
local machine containers and their
state.

Docker image Packaged A chaincode or SDK image
filesystem/application can build successfully
used to create containers but its container can
still exit.

Docker container A running or stopped `Exited (127)` means the
instance of an image process failed to
launch/execute a command;
inspect logs rather than
guessing.

Docker Compose Describes and operates In this project it
related services from a runs/rebuilds
YAML file `cartrade-sdk`; Fabric
network services are
managed by the Fabric
network Compose
files/scripts.

`network.sh` Fabric sample network It can create a channel
lifecycle and chaincode and run lifecycle
deployment helper operations, but the stock
test-network starts with
only Org1 and Org2.

REST error middleware Converts thrown errors The fixed middleware maps
into HTTP responses recognized chaincode
authorization failures to
HTTP 403 instead of a
generic 500.
----------------------------------------------------------------------------

### Docker terms in a sentence

- **Image:** template.
- **Container:** instance of that template.
- **Compose file:** declarative definition of services, networks,
  mounts, environment, and startup configuration.
- **`docker compose up -d --build --force-recreate cartrade-sdk`:**
  rebuilds the SDK image and recreates that service; it is not a
  Fabric ledger reset.

## 3. Organizations and identity mapping

REST identity alias Organization / MSP Responsibility

---

`dealer` `Org1MSP` Dealer actions and token issuer account
`buyer` `Org2MSP` Buyer actions and receiving account
`inspector` `Org3MSP` Vehicle inspection

The alias is supplied in the HTTP header:

```http
X-Fabric-Identity: dealer
```

This header selects a wallet identity in the SDK. It is suitable for
this local assignment demonstration, but **it is not secure
authentication for a public production API**: a real deployment must
authenticate callers and bind them to authorized identities rather than
trust a freely chosen header.

## 4. Data schemas and where each schema is handled

### 4.1 Vehicle public state

A vehicle record is stored in the `vehicle` chaincode public world
state. The fields observed in the actual API response are:

```json
{
  "vehicleId": "VEHICLE-002",
  "manufacturer": "Honda",
  "model": "City",
  "year": 2025,
  "vin": "MAKGM653NFN123456",
  "inspectionStatus": "PASSED",
  "verified": true,
  "owner": "Org1MSP",
  "status": "AVAILABLE"
}
```

---

Field Meaning / who updates it

---

`vehicleId` Stable ledger key supplied at
registration

`manufacturer`, `model`, `year`, Vehicle identity fields supplied at
`vin` registration

`inspectionStatus` Inspector-controlled outcome:
`PENDING`, `PASSED`, or `FAILED`

`verified` Dealer-controlled verification
flag; verification requires a
passed inspection

`owner` Current owner organization MSP ID;
transfer changes it to `Org2MSP`

`status` Lifecycle state such as `AVAILABLE`
or `SOLD`
-----------------------------------------------------------------------

**Observed lifecycle:** registration starts at `PENDING` /
`verified: false`; inspection can set `PASSED` or `FAILED`; dealer
verification sets `verified: true` only after a passed inspection;
transfer marks the vehicle `SOLD` and updates ownership to `Org2MSP`. A
failed inspection clears verification. A sold vehicle cannot be
inspected again.

### 4.2 Private deal schema

Private deal terms are written by the `vehicle` chaincode to
`DealerBuyerPrivateCollection`, not the ordinary public vehicle record.

```json
{
  "vehicleId": "VEHICLE-002",
  "originalPrice": 1250000,
  "discount": 50000,
  "finalPrice": 1200000,
  "currency": "INR"
}
```

The example represents ₹12,50,000 original price, ₹50,000 discount, and
₹12,00,000 final price.

---

Collection setting Value Effect

---

`name` `DealerBuyerPrivateCollection` Name used by chaincode
private-data APIs

`policy` `OR('Org1MSP.member','Org2MSP.member')` Org1 or Org2 membership
is required

`requiredPeerCount` `1` At least one peer must
receive private data
during dissemination

`maxPeerCount` `2` Dissemination may
distribute it to up to
two peers

`blockToLive` `0` No automatic purge
based on block count

`memberOnlyRead` `true` Collection membership
required for reads

`memberOnlyWrite` `true` Collection membership
required for writes
-----------------------------------------------------------------------------------------

Org3 can inspect vehicles but is not a collection member and is also
explicitly denied by the chaincode's private-deal authorization rule.
The collection policy and chaincode authorization complement one
another.

### 4.3 AutoCoin / token state

`erc20` is an ERC-20-style Fabric chaincode. Accounts are represented by
MSP IDs in this demo. Amounts are positive safe integers; the demo
assumes `1 AUTO = ₹1` solely for demonstration, not as a real market
price.

Core conceptual state:

- Token metadata: name `AutoCoin`, symbol `AUTO`
- Balance mapping: account MSP ID → integer token balance
- Allowance mapping: owner MSP ID + spender MSP ID → integer approved
  amount
- Total supply: total outstanding token amount

Key operations: `Initialize`, `Mint`, `BalanceOf`, `Transfer`,
`Approve`, `Allowance`, `TransferFrom`, `Burn`, and `TotalSupply`.

Authorization observed in the contract: - Initialize and Mint: Org1
dealer/issuer only. - Transfer: caller MSP must match `from`. - Approve:
caller MSP must match `owner`. - TransferFrom: caller MSP must match
`spender`, and allowance/balance checks apply. - Burn: caller MSP must
match the account being burned.

### 4.4 Vehicle history schema

The history endpoint returns Fabric ledger history entries, each with:

```json
{
  "txId": "<transaction-id>",
  "timestamp": { "seconds": 1791639965, "nanos": 680000000 },
  "isDelete": false,
  "value": "{\"vehicleId\":\"VEHICLE-002\", ... }"
}
```

`value` is a JSON string containing the state at that historical point,
so a client may need to parse it separately. The current response is
newest-first. History is useful for demonstrating state evolution and
traceability; it should not be mistaken for a full business event log
unless the chaincode explicitly records event details.

## 5. Chaincode responsibilities and authorization matrix

### Vehicle chaincode

- Register a vehicle.
- Read a vehicle.
- Inspect it (Org3 Inspector only).
- Verify it (Org1 Dealer only; requires passed inspection and vehicle
  not sold).
- Transfer ownership (Org1 Dealer only; target is Org2MSP; vehicle
  must be verified, currently owned by Org1, and not sold).
- Create/read dealer--buyer private deal data.
- Return history.

### Token chaincode

- Initialize token metadata.
- Mint tokens.
- Query balances and total supply.
- Transfer tokens.
- Approve an allowance.
- Query allowance.
- Transfer from an owner using allowance.
- Burn tokens.

---

Action Authorized identity / constraint

---

Inspect vehicle Org3MSP Inspector

Verify vehicle Org1MSP Dealer, after passed
inspection

Transfer vehicle Org1MSP Dealer; verified vehicle;
current owner Org1MSP; target
Org2MSP; not sold

Read/write private deal Org1MSP or Org2MSP; Org3 denied

Initialize / mint AUTO Org1MSP

Transfer AUTO Caller must be the `from` account

Approve AUTO spending Caller must be the owner

`TransferFrom` Caller must be the spender and
allowance/balance must suffice

Burn AUTO Caller must match the account being
burned
-----------------------------------------------------------------------

## 6. REST API map

All routes are exposed by the local SDK at `http://localhost:4000`.

### Identity

---

Method Endpoint Purpose

---

POST `/api/identity/register` Register an identity
with the appropriate CA
(admin/registrar
permissions required)

POST `/api/identity/enroll` Enroll identity and
store credentials in
the wallet

GET `/api/identity` List/inspect SDK
identity aliases
--------------------------------------------------------------------------

### Vehicles

---

Method Endpoint Purpose

---

POST `/api/vehicles/register` Register a vehicle

GET `/api/vehicles/:vehicleId` Read current state

POST `/api/vehicles/:vehicleId/inspect` Record inspection
(`{"result":"PASSED"}`
or
`{"result":"FAILED"}`)

POST `/api/vehicles/:vehicleId/verify` Dealer verifies eligible
vehicle

POST `/api/vehicles/:vehicleId/transfer` Transfer ownership to
buyer organization

GET `/api/vehicles/:vehicleId/history` Query historical states
--------------------------------------------------------------------------------------

### Private deals

---

Method Endpoint Purpose

---

POST `/api/deals` Create a private deal;
accepts `vehicleId`,
`originalPrice`,
`discount`, and
optionally `finalPrice`

GET `/api/deals/:vehicleId` Read private deal if
authorized
-------------------------------------------------------------------------

### Tokens

Method Endpoint Purpose

---

POST `/api/tokens/initialize` Initialize AutoCoin metadata
POST `/api/tokens/mint` Mint tokens to an account
GET `/api/tokens/balance/:account` Read account balance
POST `/api/tokens/transfer` Direct transfer
POST `/api/tokens/approve` Set spender allowance
GET `/api/tokens/allowance/:owner/:spender` Read allowance
POST `/api/tokens/transfer-from` Spend against an allowance
POST `/api/tokens/burn` Burn tokens
GET `/api/tokens/total-supply` Read total supply

## 7. Assignment requirement coverage

This table summarizes the capabilities reflected in the training
material and project, and what was actually demonstrated during this
session.

---

Requirement / Implementation Status from observed
capability evidence

---

Three role-based Org1 dealer, Org2 buyer, **Implemented and
organizations Org3 inspector exercised** in the
active network

Shared channel `cartrade-channel` **Active and used**

Vehicle registration `vehicle` chaincode + REST **Exercised**
and query routes

Inspector-only Org3MSP authorization in **Verified**: dealer
inspection chaincode attempt returned 403;
inspector attempt
returned 200

Dealer verification `vehicle` chaincode Current vehicle is
after inspection verified; previous
lifecycle states appear
in history

Vehicle transfer / sale Dealer-only transfer logic Implemented; a separate
vehicle `VEHICLE-001`
was previously
transferred to Org2MSP
and marked SOLD

Dealer--buyer private PDC plus chaincode checks **Exercised**: dealer
deal and buyer got 200;
inspector got 403

ERC-20-style token `erc20` chaincode **Exercised**: mint,
transfer, approval,
TransferFrom, burn,
balance, allowance,
supply

History/audit trail `GetHistoryForKey`-based **Exercised**:
endpoint `VEHICLE-002` returned
four states

REST interface Express SDK on port 4000 **Exercised** with curl

Correct HTTP Error middleware **Fixed and verified**:
authorization response chaincode authorization
rejection maps to 403

Automated tests / full Not established by the **Not yet confirmed**;
rubric coverage manual curl checks run the repository's
test/check scripts and
compare against the
official rubric

Fresh-machine Setup guide exists, but **Needs a clean-room
reproducibility three-org network run** before claiming
configuration is fully reproducible
environment-specific
--------------------------------------------------------------------------

### Latest observed state

Vehicle `VEHICLE-002`: - Honda City, 2025 - Inspection `PASSED` -
`verified: true` - Owner `Org1MSP` - Status `AVAILABLE` - History
endpoint returned four states, newest first.

Private deal: - Original price: ₹12,50,000 - Discount: ₹50,000 - Final
price: ₹12,00,000 - Dealer and buyer can read it; inspector cannot.

Token ledger: - Dealer balance: `1,249,790 AUTO` - Buyer balance:
`200 AUTO` - Remaining allowance Org1 → Org2: `400 AUTO` - Total supply:
`1,249,990 AUTO` - This reconciles with 1,250,000 minted minus 10
burned; the allowance is not a token balance.

## 8. Chaincode lifecycle concepts --- quick revision

- **Package:** bundles chaincode source and metadata.
- **Install:** places the package on a peer.
- **Approve:** each required organization approves a chaincode
  definition for a channel.
- **Check commit readiness:** confirms required approvals.
- **Commit:** commits the definition to the channel.
- **Sequence:** increments when a new definition version is committed.
- **Private collection config:** supplied when deploying the chaincode
  that uses the collection (`vehicle`), not `erc20`.
- **Endorsement:** peers execute a proposal and sign the result. A
  chaincode authorization error can fail during endorsement before a
  transaction is committed.
- **Evaluate vs submit:** evaluate reads state without committing a
  state change; submit requests a transaction that can be ordered and
  committed.

## 9. Security and scope notes

- This is a local development / assignment demonstration, not
  production-ready financial or vehicle infrastructure.
- `X-Fabric-Identity` is a selection mechanism in this local SDK, not
  proof that a real caller is entitled to that identity.
- Never commit `.env`, wallet credentials, private keys, CA registrar
  secrets, or enrollment material.
- Do not expose Fabric peer/orderer/CA ports publicly.
- HTTP 403 mapping improves API semantics, but chaincode authorization
  remains the authoritative enforcement layer.
