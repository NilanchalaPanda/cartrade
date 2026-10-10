# Vehicle Chaincode

Fabric chaincode for the CarTrade vehicle lifecycle.

## Transactions

- `RegisterVehicle` — Org1 only.
- `GetVehicle` — reads public vehicle state.
- `InspectVehicle` — Org3 only; result must be `PASSED` or `FAILED`.
- `VerifyVehicle` — Org1 only; requires `PASSED` inspection.
- `TransferOwnership` — Org1 only; transfers to Org2 and marks the vehicle `SOLD`.
- `CreatePrivateDeal` — Org1/Org2 only; writes commercial pricing to `DealerBuyerPrivateCollection`.
- `GetPrivateDeal` — Org1/Org2 only.
- `GetVehicleHistory` — returns ledger history for the vehicle key.

The private collection is deployed with this chaincode, not the ERC20 chaincode.
