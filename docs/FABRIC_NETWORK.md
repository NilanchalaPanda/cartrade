# Fabric Network Setup

This document covers the network side required by the CarTrade application.

## Required topology

```text
Org1MSP  Dealer       peer0.org1.example.com
Org2MSP  Buyer        peer0.org2.example.com
Org3MSP  Inspector    peer0.org3.example.com

All three → cartrade-channel
```

The assignment's business model requires Org3 because the inspector is a separate organization. A stock two-organization Fabric test network is therefore not sufficient for the complete demonstration.

## 1. Start your Fabric network

Use your Fabric 2.5.x network implementation with CA support. Make sure the peers and CAs expose reachable TLS endpoints and that all three organizations join `cartrade-channel`.

The supplied training material uses the Fabric `test-network` workflow and `network.sh`, with CA-backed identities and Docker-based network components. fileciteturn1file8

## 2. Deploy Vehicle Chaincode

From the directory containing `network.sh`:

```bash
./network.sh deployCC \
  -ccn vehicle \
  -ccp /absolute/path/to/cartrade-fabric/chaincode/vehicle \
  -ccl javascript \
  -c cartrade-channel \
  -cccg /absolute/path/to/cartrade-fabric/collections/collections_config.json
```

The collection belongs to Vehicle Chaincode because `CreatePrivateDeal` and `GetPrivateDeal` call Fabric private-data APIs.

## 3. Deploy ERC20 Chaincode

```bash
./network.sh deployCC \
  -ccn erc20 \
  -ccp /absolute/path/to/cartrade-fabric/chaincode/erc20 \
  -ccl javascript \
  -c cartrade-channel
```

Do **not** attach `collections_config.json` to ERC20.

## 4. Verify the channel and chaincodes

Use your network's normal `peer lifecycle chaincode querycommitted` / `queryinstalled` commands to verify both definitions.

The expected logical chaincodes are:

```text
vehicle
erc20
```

and the expected collection is:

```text
DealerBuyerPrivateCollection
```

## 5. CA identities

The Node.js SDK can register and enroll client identities through Fabric CA.

For each organization, the `.env` file needs:

- CA URL;
- CA name;
- CA TLS certificate;
- registrar/admin certificate;
- registrar/admin private key;
- affiliation;
- peer endpoint;
- peer TLS certificate;
- peer TLS hostname.

The actual paths depend on your Fabric network directory. Do not copy the example paths blindly.

## 6. Important Docker networking point

If Fabric is running in Docker on the same Linux host and its ports are published to the host, the SDK container can use `network_mode: host` and continue using host-style endpoints such as:

```text
localhost:7051
localhost:9051
localhost:10051
```

If Fabric is on another server/network, replace these values with the real reachable endpoints and make sure firewall rules permit the connection.

If the SDK is attached to the same Docker network as Fabric, use Docker service/container DNS names instead of `localhost`, and set the TLS host alias to the hostname contained in the peer certificate.
