# CarTrade — Hyperledger Fabric 2.5 Case Study

A complete reference implementation of the CarTrade used-car workflow from the supplied Hyperledger Fabric assignment/training material.

The repository contains **Fabric chaincode + a wallet-based Node.js SDK + REST API + Docker deployment configuration + documentation**. The Fabric network itself is intentionally kept separate because the assignment expects a three-organization network (Dealer, Buyer, Inspector) and the standard Fabric `test-network` does not provide Org3 out of the box.

## 1. Assignment Mapping

| Assignment requirement       | Implementation                                         |
| ---------------------------- | ------------------------------------------------------ |
| Org1 Dealer                  | `Org1MSP` authorization in Vehicle and ERC20 chaincode |
| Org2 Buyer                   | `Org2MSP` ownership and token account                  |
| Org3 Vehicle Inspector       | `Org3MSP` authorization for inspection                 |
| Channel                      | `cartrade-channel`                                     |
| Vehicle Chaincode            | `chaincode/vehicle`                                    |
| Register vehicle             | `RegisterVehicle`                                      |
| Query vehicle                | `GetVehicle`                                           |
| Inspect vehicle              | `InspectVehicle`                                       |
| Verify vehicle               | `VerifyVehicle`                                        |
| Transfer ownership           | `TransferOwnership`                                    |
| Vehicle history              | `GetVehicleHistory`                                    |
| Dealer/Buyer private pricing | `DealerBuyerPrivateCollection`                         |
| Create private deal          | `CreatePrivateDeal`                                    |
| Read private deal            | `GetPrivateDeal`                                       |
| AutoCoin                     | `chaincode/erc20`                                      |
| Token initialization         | `Initialize`                                           |
| Mint                         | `Mint`                                                 |
| Balance                      | `BalanceOf`                                            |
| Transfer                     | `Transfer`                                             |
| Approval                     | `Approve` / `Allowance`                                |
| Delegated transfer           | `TransferFrom`                                         |
| Burn                         | `Burn`                                                 |
| Supply                       | `TotalSupply`                                          |
| Fabric CA identity flow      | `sdk/src/services/identity.service.js`                 |
| Wallet                       | `sdk/wallet`                                           |
| Fabric Gateway               | `sdk/src/services/fabric.service.js`                   |
| REST API                     | `sdk/src/routes` + controllers                         |
| Docker deployment            | `Dockerfile`, `docker-compose.yml`                     |
| Environment configuration    | `sdk/.env.example`                                     |

The assignment describes the Node.js layer as responsible for identity creation, wallet management, Gateway connection, channel/chaincode selection, transaction evaluation/submission, and REST APIs, while business logic remains in Fabric chaincode. This implementation follows that separation.

## 2. Architecture

```text
                         ┌──────────────────────────┐
                         │       REST Client        │
                         │ curl / Postman / Web App │
                         └────────────┬─────────────┘
                                      │ HTTP
                                      ▼
                    ┌─────────────────────────────────┐
                    │      Node.js CarTrade SDK       │
                    │            Express              │
                    ├─────────────────────────────────┤
                    │ Routes → Controllers → Services │
                    │                                 │
                    │ Identity Service                │
                    │ Fabric Gateway Service          │
                    │ File-system wallet              │
                    └───────────────┬─────────────────┘
                                    │ Fabric Gateway / gRPC
             ┌──────────────────────┼─────────────────────────┐
             ▼                      ▼                         ▼
       ┌───────────┐          ┌───────────┐             ┌───────────┐
       │   Org1    │          │   Org2    │             │   Org3    │
       │  Dealer   │          │   Buyer   │             │ Inspector │
       │  Org1MSP  │          │  Org2MSP  │             │  Org3MSP  │
       └─────┬─────┘          └─────┬─────┘             └─────┬─────┘
             │                      │                         │
             └──────────────────────┼─────────────────────────┘
                                    ▼
                         ┌──────────────────────┐
                         │  cartrade-channel    │
                         ├──────────────────────┤
                         │ Vehicle Chaincode    │
                         │ ERC20 Chaincode      │
                         │ PDC: Dealer + Buyer  │
                         └──────────────────────┘
```

### Vehicle flow

```text
Dealer registers vehicle
        ↓
Inspector inspects
        ↓
Inspection = PASSED
        ↓
Dealer verifies
        ↓
Dealer + Buyer create private commercial deal
        ↓
Buyer pays using AUTO
        ↓
Dealer transfers ownership to Org2
        ↓
Vehicle status = SOLD
```

### Privacy model

Normal vehicle fields are stored in the public channel ledger. Pricing fields are written using Fabric private-data APIs to `DealerBuyerPrivateCollection`. The collection contains Org1 and Org2 only; Org3 is intentionally excluded. This matches the assignment's private-deal design. fileciteturn1file2

## 3. Repository Structure

```text
cartrade-fabric/
├── chaincode/
│   ├── vehicle/
│   │   ├── index.js
│   │   ├── package.json
│   │   ├── README.md
│   │   └── lib/
│   │       └── vehicle-contract.js
│   │
│   └── erc20/
│       ├── index.js
│       ├── package.json
│       ├── README.md
│       └── lib/
│           └── erc20-contract.js
│
├── collections/
│   └── collections_config.json
│
├── sdk/
│   ├── .env.example
│   ├── .dockerignore
│   ├── Dockerfile
│   ├── package.json
│   ├── index.js
│   ├── app.js
│   ├── connection.js
│   ├── wallet/                 # generated identities; never commit real keys
│   └── src/
│       ├── config/
│       │   └── network.config.js
│       ├── controllers/
│       │   ├── identity.controller.js
│       │   ├── vehicle.controller.js
│       │   ├── deal.controller.js
│       │   └── token.controller.js
│       ├── middleware/
│       │   ├── identity.middleware.js
│       │   └── error.middleware.js
│       ├── routes/
│       │   ├── identity.routes.js
│       │   ├── vehicle.routes.js
│       │   ├── deal.routes.js
│       │   └── token.routes.js
│       ├── services/
│       │   ├── identity.service.js
│       │   └── fabric.service.js
│       └── index.js
│
├── docs/
│   ├── DEPLOYMENT.md
│   └── FABRIC_NETWORK.md
│
├── scripts/
│   └── deploy-chaincode.sh
│
├── Dockerfile
├── docker-compose.yml
├── .gitignore
└── README.md
```

This is deliberately layered rather than putting Fabric calls directly inside Express routes. The assignment's reference SDK structure similarly separates config, controllers, routes, identity service, and Fabric service.

## 4. Vehicle Chaincode

`chaincode/vehicle/lib/vehicle-contract.js` contains the business rules.

### `RegisterVehicle`

- Org1 only.
- Rejects duplicate vehicle IDs.
- Stores manufacturer, model, year and VIN.
- Starts inspection as `PENDING`.
- Starts `verified=false`.
- Sets owner to `Org1MSP` and status to `AVAILABLE`.

### `InspectVehicle`

- Org3 only.
- Accepts only `PASSED` or `FAILED`.
- A sold vehicle cannot be inspected.
- A failed inspection clears verification.

### `VerifyVehicle`

- Org1 only.
- Requires inspection status `PASSED`.
- Sets `verified=true`.

### `TransferOwnership`

- Org1 only.
- New owner must be `Org2MSP` for this assignment.
- Vehicle must still belong to Org1.
- Vehicle must be verified.
- Changes owner to Org2 and status to `SOLD`.

### `GetVehicleHistory`

Uses Fabric's history API to return transaction history for a vehicle key.

## 5. Private Data Collection

`collections/collections_config.json`:

```json
[
  {
    "name": "DealerBuyerPrivateCollection",
    "policy": "OR('Org1MSP.member','Org2MSP.member')",
    "requiredPeerCount": 1,
    "maxPeerCount": 2,
    "blockToLive": 0,
    "memberOnlyRead": true,
    "memberOnlyWrite": true
  }
]
```

The private object contains:

```text
vehicleId
originalPrice
discount
finalPrice
currency = INR
```

The chaincode additionally validates:

```text
finalPrice = originalPrice - discount
```

and prevents a second private deal from silently overwriting the first one.

The collection is associated with **Vehicle Chaincode**, because the private-data functions are part of the Vehicle Chaincode. The supplied training material explicitly shows the collection configuration being deployed with Vehicle Chaincode. fileciteturn1file3

## 6. AutoCoin / ERC-20-Style Chaincode

This is an **ERC-20-style implementation inside Fabric**, not an Ethereum smart contract.

The assignment uses:

```text
Name: AutoCoin
Symbol: AUTO
Demo assumption: 1 AUTO = ₹1
```

The value is only a demonstration assumption. fileciteturn1file4

Implemented functions:

```text
Initialize
Mint
BalanceOf
Transfer
Approve
Allowance
TransferFrom
Burn
TotalSupply
```

Balances are intentionally keyed by MSP for this case study:

```text
BALANCE_Org1MSP
BALANCE_Org2MSP
BALANCE_Org3MSP
```

Token operations reject zero, negative, fractional, `NaN`, infinite and unsafe integer amounts. Org1 initializes and mints; transfers, approvals and burns require the caller to match the relevant organization account.

The training material lists these exact token functions and uses the same AutoCoin payment model. fileciteturn1file6

## 7. Node.js SDK

The SDK is the application layer. It does not contain the vehicle/token business rules.

### Identity Service

`identity.service.js` handles:

1. Fabric CA registration.
2. Fabric CA enrollment.
3. File-system wallet storage.
4. Loading an enrolled identity.

The assignment describes dealer, buyer and inspector as wallet users and expects the wallet to contain their Fabric credentials. fileciteturn1file4

### Fabric Service

`fabric.service.js` handles:

- loading the wallet identity;
- creating the gRPC connection to the correct peer;
- creating a Fabric Gateway session;
- selecting `cartrade-channel`;
- selecting `vehicle` or `erc20` chaincode;
- `evaluateTransaction()` for reads;
- `submitTransaction()` for writes;
- caching one Gateway session per wallet identity.

The assignment explicitly specifies Fabric Gateway, channel selection, chaincode selection, evaluate for reads and submit for writes. fileciteturn1file0

### Identity selection

REST requests select the Fabric identity with:

```http
X-Fabric-Identity: dealer
```

Supported values:

```text
dealer
buyer
inspector
```

The SDK maps each logical wallet identity to its organization/MSP and peer configuration.

> This header is an assignment/demo identity selector, not production authentication. In production it must be derived from authenticated application users rather than trusted directly from a client header.

## 8. REST API

Base URL:

```text
http://localhost:4000
```

### Health

```http
GET /health
```

### Identity

```http
POST /api/identity/register
POST /api/identity/enroll
GET  /api/identity
```

Register example:

```json
{
  "identityName": "dealer",
  "enrollmentId": "dealer1",
  "org": "dealer",
  "role": "client"
}
```

Enroll example:

```json
{
  "identityName": "dealer",
  "enrollmentId": "dealer1",
  "enrollmentSecret": "<secret returned by register>",
  "org": "dealer"
}
```

### Vehicle

```http
POST /api/vehicles/register
GET  /api/vehicles/:vehicleId
POST /api/vehicles/:vehicleId/inspect
POST /api/vehicles/:vehicleId/verify
POST /api/vehicles/:vehicleId/transfer
GET  /api/vehicles/:vehicleId/history
```

Example registration:

```json
{
  "vehicleId": "CAR001",
  "manufacturer": "Tata",
  "model": "Nexon EV",
  "year": 2025,
  "vin": "ABC123"
}
```

Inspector call:

```http
X-Fabric-Identity: inspector
```

```json
{
  "result": "PASSED"
}
```

Transfer:

```json
{
  "newOwnerMSP": "Org2MSP"
}
```

### Private Deal

```http
POST /api/deals
GET  /api/deals/:vehicleId
```

Example:

```json
{
  "vehicleId": "CAR001",
  "originalPrice": 1250000,
  "discount": 50000
}
```

The API calculates `finalPrice` and the chaincode independently verifies the arithmetic.

### Token

```http
POST /api/tokens/initialize
POST /api/tokens/mint
GET  /api/tokens/balance/:account
POST /api/tokens/transfer
POST /api/tokens/approve
GET  /api/tokens/allowance/:owner/:spender
POST /api/tokens/transfer-from
POST /api/tokens/burn
GET  /api/tokens/total-supply
```

The extra approval/delegated-transfer/burn endpoints expose the complete ERC-20-style contract rather than only the minimum REST subset listed in the training material.

## 9. Complete Demonstration Flow

After identities are enrolled:

```bash
# Dealer
curl -X POST http://localhost:4000/api/vehicles/register \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"vehicleId":"CAR001","manufacturer":"Tata","model":"Nexon EV","year":2025,"vin":"ABC123"}'

# Inspector
curl -X POST http://localhost:4000/api/vehicles/CAR001/inspect \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: inspector' \
  -d '{"result":"PASSED"}'

# Dealer verifies
curl -X POST http://localhost:4000/api/vehicles/CAR001/verify \
  -H 'X-Fabric-Identity: dealer'

# Dealer creates the private commercial deal
curl -X POST http://localhost:4000/api/deals \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"vehicleId":"CAR001","originalPrice":1250000,"discount":50000}'

# Dealer initializes AutoCoin once
curl -X POST http://localhost:4000/api/tokens/initialize \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"name":"AutoCoin","symbol":"AUTO"}'

# Dealer mints buyer's demo balance
curl -X POST http://localhost:4000/api/tokens/mint \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"account":"Org2MSP","amount":1500000}'

# Buyer pays Dealer 1,200,000 AUTO
curl -X POST http://localhost:4000/api/tokens/transfer \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: buyer' \
  -d '{"from":"Org2MSP","to":"Org1MSP","amount":1200000}'

# Dealer transfers ownership after payment
curl -X POST http://localhost:4000/api/vehicles/CAR001/transfer \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"newOwnerMSP":"Org2MSP"}'
```

The training material uses the same example amounts: ₹12,50,000 original, ₹50,000 discount, ₹12,00,000 final and 1 AUTO = ₹1, resulting in a 12,00,000 AUTO payment. fileciteturn1file3

## 10. Fabric Network Deployment

The repository does not fake an Org3 network. You must run a Fabric network containing:

```text
Org1MSP — Dealer
Org2MSP — Buyer
Org3MSP — Vehicle Inspector
```

All three organizations must join:

```text
cartrade-channel
```

See [`docs/FABRIC_NETWORK.md`](docs/FABRIC_NETWORK.md) for the network-side checklist and chaincode lifecycle commands.

Important: the collection configuration is supplied when deploying **vehicle**, not `erc20`.

Correct commands:

```bash
./network.sh deployCC \
  -ccn vehicle \
  -ccp ../cartrade-fabric/chaincode/vehicle \
  -ccl javascript \
  -c cartrade-channel \
  -cccg ../cartrade-fabric/collections/collections_config.json

./network.sh deployCC \
  -ccn erc20 \
  -ccp ../cartrade-fabric/chaincode/erc20 \
  -ccl javascript \
  -c cartrade-channel
```

## 11. Local SDK Setup

```bash
cd sdk
cp .env.example .env
npm install
```

Place/mount the Fabric network crypto material so the paths in `.env` resolve correctly.

Then enroll the three wallet identities using the REST identity endpoints, or populate the wallet from your existing Fabric credentials.

Start:

```bash
npm start
```

Check:

```bash
curl http://localhost:4000/health
```

## 12. Docker

The Docker image packages **only the Node.js SDK**. Fabric peers/orderers/CAs remain part of the Fabric network deployment.

Build:

```bash
docker build -t cartrade-sdk:1.0 .
```

Run with an environment file and mounted Fabric crypto material:

```bash
docker run --rm \
  --name cartrade-sdk \
  --network host \
  --env-file sdk/.env \
  -v "$PWD/sdk/wallet:/app/sdk/wallet" \
  -v "$PWD/fabric-network:/fabric-network:ro" \
  cartrade-sdk:1.0
```

For Linux, `--network host` is convenient when the Fabric network publishes peer/CA ports on the host. For a remote Fabric network, use normal container networking and put the reachable peer/CA endpoints in `.env` instead.

A Compose file is included for the Linux/local deployment case:

```bash
cp sdk/.env.example sdk/.env
# edit sdk/.env
export FABRIC_NETWORK_PATH=/absolute/path/to/fabric-network

docker compose up -d --build
```

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for production notes, wallet persistence, permissions, reverse proxy placement, logs, health checks and the Docker flow.

## 13. Security Notes

This is an assignment/reference implementation, not a production banking/payment system.

Before production use:

- do not expose Fabric CA registration endpoints publicly;
- do not trust `X-Fabric-Identity` from arbitrary clients;
- put authentication/authorization in front of the REST API;
- keep private keys outside Git;
- use a secrets manager rather than plaintext `.env` for production secrets;
- use TLS for the REST API behind a reverse proxy;
- restrict wallet volume permissions;
- use separate application identities instead of sharing administrator keys;
- define endorsement policies for the production business model;
- use a database/audit system for application-level logs if required;
- consider integer/decimal financial semantics carefully before handling real money.

## 14. Validation Performed

All JavaScript source files in the repository are intended to pass `node --check`. The SDK also exposes:

```bash
npm run check
```

The code was structured so chaincode business rules remain on-chain and the Node.js layer only orchestrates identities, Gateway sessions and REST requests.
