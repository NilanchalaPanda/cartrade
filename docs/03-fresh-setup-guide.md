# CarTrade Hyperledger Fabric --- Fresh Setup Guide

> Target: a third party setting up the CarTrade repository on a Linux
> machine, using Docker, Fabric 2.5.16, Fabric CA 1.5.17, the Fabric
> samples test network as a base, and the CarTrade SDK on port 4000.
>
> **Critical limitation:** the stock `fabric-samples/test-network` has
> Org1 and Org2 only. This CarTrade implementation requires Org3MSP, an
> Org3 CA/peer, and Org3 joined to `cartrade-channel`. You must
> obtain/use the three-organization network configuration from the
> project environment or add the corresponding Org3 network
> configuration before expecting the inspector tests to work. This guide
> does not pretend that the stock two-org network creates Org3
> automatically.

## 1. Prerequisites

- Linux environment (the recorded setup used Fedora).
- Docker Engine and Docker Compose plugin.
- Git, curl, OpenSSL, Node.js/npm if running the SDK on the host.
- Sufficient memory/disk for Fabric peer, orderer, CA, and chaincode
  containers.
- Network access for downloading Fabric samples/images and installing
  npm dependencies.

Check what is already installed before installing anything again:

```bash
docker --version
docker compose version
docker info
git --version
node --version
npm --version
```

If Docker Engine is installed but stopped:

```bash
sudo systemctl enable --now docker
sudo docker ps
```

Optional: add your user to the Docker group, then log out and back in:

```bash
sudo usermod -aG docker "$USER"
```

Until the new group membership is active, use `sudo docker ...` where
necessary. Do not install a second container runtime without first
checking the existing setup.

## 2. Get Fabric binaries, samples, and images

The recorded version was Fabric 2.5.16. Keep peer/orderer and sample
versions aligned.

```bash
cd ~
curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
chmod +x install-fabric.sh
./install-fabric.sh --fabric-version 2.5.16 binary samples docker

cd ~/fabric-samples/test-network
```

Confirm that the files exist:

```bash
ls
./network.sh --help
```

Fabric CA in the recorded environment was v1.5.17. Check the versions
actually running in your environment rather than assuming a `latest`
image tag always means the same build.

## 3. Start the base network

**Only do this on a fresh environment or when intentionally resetting
the test ledger.** Do not repeatedly run `network.sh down` against a
network with data you need to preserve.

```bash
cd ~/fabric-samples/test-network
./network.sh up createChannel -c cartrade-channel -ca
```

Inspect services:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

This base network creates Org1 and Org2 only. Before proceeding with the
full assignment, configure or start the three-org network that includes:

---

Organization MSP Expected local peer Expected CA endpoint
endpoint

---

Dealer `Org1MSP` `localhost:7051` Environment-specific;
recorded CA port `7054`

Buyer `Org2MSP` `localhost:9051` Environment-specific;
verify actual Compose
config

Inspector `Org3MSP` `localhost:11051` `https://localhost:11054`
-----------------------------------------------------------------------------------

The recorded Org3 TLS certificate path inside the SDK container was
`/fabric-network/addOrg3/fabric-ca/org3/tls-cert.pem`. Org1 CA TLS path
used during troubleshooting was
`/fabric-network/addOrg1/fabric-ca/org1/ca-cert.pem`. These paths are
specific to the crypto layout used in this environment. Confirm the
files exist in the actual checkout and mounts before copying them.

### Confirm all required services

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker compose -f compose/compose-ca.yaml ps
```

For an individual CA:

```bash
docker logs --tail 80 ca_org1
docker logs --tail 80 ca_org3
```

If a CA is defined by `compose/compose-ca.yaml` and stopped, start only
that service:

```bash
docker compose -f compose/compose-ca.yaml up -d ca_org1
```

Use the actual service name for the CA you need. Do not use
`--remove-orphans` as a generic cleanup command; the same project may
have containers defined by other Compose files.

## 4. Configure the three-organization network and channel

The stock sample's `network.sh` does not add Org3 by itself. Use the
project's supplied three-org network configuration, if available, and
ensure:

1.  Org1, Org2, and Org3 each have an MSP and peer.
2.  Each CA endpoint and peer endpoint is reachable.
3.  The correct TLS certificate is available for every CA and peer.
4.  Org3's peer joins `cartrade-channel`.
5.  The relevant chaincode definitions are approved and committed with
    the intended policies.

Verify the committed definitions after deployment:

```bash
peer lifecycle chaincode querycommitted -C cartrade-channel
```

The command requires the Fabric peer environment variables/binaries set
by the relevant network scripts or environment. A host shell that lacks
`CORE_PEER_*` and TLS variables may fail even when the network itself is
healthy.

## 5. Deploy the chaincodes

Set the project path to the actual checkout. From the directory
containing `network.sh`, deploy the vehicle chaincode with the private
collection config:

```bash
./network.sh deployCC \
  -ccn vehicle \
  -ccp /ABS/PATH/cartrade-fabric/chaincode/vehicle \
  -ccl javascript \
  -c cartrade-channel \
  -cccg /ABS/PATH/cartrade-fabric/collections/collections_config.json
```

Deploy the token chaincode without a private collection config:

```bash
./network.sh deployCC \
  -ccn erc20 \
  -ccp /ABS/PATH/cartrade-fabric/chaincode/erc20 \
  -ccl javascript \
  -c cartrade-channel
```

For a custom three-org network, chaincode approvals and commit must
follow that network's endorsement policy. Do not assume the stock
two-org helper has approved Org3 or that Org3 is required to approve
`vehicle`; the observed vehicle definition intentionally had Org1 and
Org2 approvals, while Org3 was not an approver because the private
collection excludes it.

Verify:

```bash
peer lifecycle chaincode querycommitted -C cartrade-channel
peer lifecycle chaincode queryinstalled
```

If a chaincode container exits, inspect it rather than treating a
successful lifecycle command as proof of execution:

```bash
docker ps -a --filter 'name=dev-peer0.org1.example.com'
docker logs --tail 150 <exact-chaincode-container-name>
```

## 6. Configure the SDK environment

From the repository:

```bash
cd /ABS/PATH/cartrade-fabric
cp sdk/.env.example sdk/.env
```

Edit `sdk/.env` to match the network. Verify each organization-specific
value:

- CA URL and CA name.
- CA TLS certificate path.
- Registrar/admin certificate and private key used for registration.
- Peer endpoint.
- Peer TLS root certificate.
- TLS host alias that matches the endpoint certificate.
- Channel name: `cartrade-channel`.
- Chaincode names: `vehicle` and `erc20`.
- Any wallet/path configuration expected by the SDK.

### Critical: host paths vs container paths

The SDK Compose configuration mounts `FABRIC_NETWORK_PATH` read-only at
`/fabric-network`. Set the host environment variable to the directory
containing the required network crypto material:

```bash
export FABRIC_NETWORK_PATH=/ABS/PATH/TO/THE/NETWORK-CRYPTO-MATERIAL
```

Inside the container, paths should use the mounted prefix
`/fabric-network/...`, not a host-only `/home/...` path. Verify each
file from the same filesystem namespace in which the SDK runs.

Example checks on the host (adapt paths to your network):

```bash
test -r /ABS/PATH/TO/NETWORK/addOrg1/fabric-ca/org1/ca-cert.pem \
  && echo "Org1 CA TLS certificate exists"

test -r /ABS/PATH/TO/NETWORK/addOrg3/fabric-ca/org3/tls-cert.pem \
  && echo "Org3 CA TLS certificate exists"
```

Inspect certificate identity and validity:

```bash
openssl x509 -in /ABS/PATH/TO/CERT.pem -noout -subject -issuer -dates
```

Verify a CA server certificate against its candidate CA root:

```bash
openssl verify \
  -CAfile /ABS/PATH/TO/CA-ROOT.pem \
  /ABS/PATH/TO/CA-SERVER-CERT.pem
```

Use the actual CA server certificate as the second argument.
`Verify return code: 0 (ok)` confirms the chain check for that pair; it
does not confirm registrar authorization, correct hostname, or that the
SDK can read the same path.

## 7. Install and run the SDK

Host mode:

```bash
cd /ABS/PATH/cartrade-fabric/sdk
npm install
npm run check
npm start
```

If `npm run check` is not defined in the checked-out `package.json`,
inspect available scripts with:

```bash
npm run
```

Docker Compose mode (from repository root):

```bash
cd /ABS/PATH/cartrade-fabric
export FABRIC_NETWORK_PATH=/ABS/PATH/TO/THE/NETWORK-CRYPTO-MATERIAL
docker compose up -d --build cartrade-sdk
docker compose ps
docker compose logs --tail=150 cartrade-sdk
```

After SDK code changes, recreate only that service:

```bash
docker compose up -d --build --force-recreate cartrade-sdk
```

Do not use `docker compose down -v` or reset the Fabric network unless
you intentionally want to remove persisted state. The wallet is stored
under `sdk/wallet`; protect it as credential material.

## 8. Identity enrollment

The REST identity endpoints are:

```text
POST /api/identity/register
POST /api/identity/enroll
GET  /api/identity
```

The SDK aliases must be:

Alias MSP

---

`dealer` `Org1MSP`
`buyer` `Org2MSP`
`inspector` `Org3MSP`

Registering identities requires a working CA connection and a registrar
identity authorized by that CA. Enrolling creates identity credentials
that the SDK stores in its wallet.

Do not assume a peer's MSP admin certificate is automatically a CA
registrar. If registration fails with CA authorization code 71, check
the registrar identity and CA policy; if TLS fails, first check the CA
URL and the CA TLS root certificate.

The `X-Fabric-Identity` header selects the local SDK alias:

```bash
-H 'X-Fabric-Identity: dealer'
```

This is a demonstration identity selector, not production-grade user
authentication.

## 9. Health check and end-to-end verification

Start with read-only/low-risk checks:

```bash
curl -i http://localhost:4000/health
curl -i http://localhost:4000/api/identity
```

Then test the vehicle state and history:

```bash
curl -s http://localhost:4000/api/vehicles/VEHICLE-002 \
  -H 'X-Fabric-Identity: dealer'

curl -s http://localhost:4000/api/vehicles/VEHICLE-002/history \
  -H 'X-Fabric-Identity: dealer'
```

Test private deal access:

```bash
curl -i http://localhost:4000/api/deals/VEHICLE-002 \
  -H 'X-Fabric-Identity: dealer'

curl -i http://localhost:4000/api/deals/VEHICLE-002 \
  -H 'X-Fabric-Identity: buyer'

curl -i http://localhost:4000/api/deals/VEHICLE-002 \
  -H 'X-Fabric-Identity: inspector'
```

Expected: dealer and buyer succeed; inspector receives `403 Forbidden`.

Test inspection authorization without changing state as an unauthorized
identity:

```bash
curl -i -X POST http://localhost:4000/api/vehicles/VEHICLE-002/inspect \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: dealer' \
  -d '{"result":"PASSED"}'
```

Expected: `403 Forbidden` and
`Only Org3 Inspector can inspect vehicles`.

If you choose to run the authorized inspector operation, it writes
another inspection state:

```bash
curl -i -X POST http://localhost:4000/api/vehicles/VEHICLE-002/inspect \
  -H 'Content-Type: application/json' \
  -H 'X-Fabric-Identity: inspector' \
  -d '{"result":"PASSED"}'
```

Expected: `200 OK`. Do not repeat state-changing calls unnecessarily.

### Token read checks

```bash
curl -s http://localhost:4000/api/tokens/balance/Org1MSP \
  -H 'X-Fabric-Identity: dealer'

curl -s http://localhost:4000/api/tokens/balance/Org2MSP \
  -H 'X-Fabric-Identity: buyer'

curl -s http://localhost:4000/api/tokens/allowance/Org1MSP/Org2MSP \
  -H 'X-Fabric-Identity: buyer'

curl -s http://localhost:4000/api/tokens/total-supply \
  -H 'X-Fabric-Identity: dealer'
```

The balances below are the **observed state from the completed demo**,
not universal initial values for a fresh ledger: - Org1MSP:
`1,249,790 AUTO` - Org2MSP: `200 AUTO` - Allowance Org1MSP → Org2MSP:
`400 AUTO` - Total supply: `1,249,990 AUTO`

A new clean ledger starts differently and must be initialized/minted
according to the demo flow.

## 10. Troubleshooting table

---

Symptom First diagnosis Commands / corrective direction

---

`Unknown Fabric identity` Alias not configured or Use `dealer`, `buyer`, or `inspector`; inspect `/api/identity`;
absent from wallet enroll the correct identity

CA connection refused / timeout CA container down, `docker ps`; `docker compose -f compose/compose-ca.yaml ps`;
wrong URL/port, wrong `docker logs --tail 80 ca_org1`
Compose service

CA TLS validation failure Wrong CA root Inspect CA endpoint, `openssl x509`, `openssl verify`, and
certificate, bad SDK-visible file path
mount/path, hostname  
mismatch

CA authorization code 71 Registrar identity Use the CA's configured registrar credentials/certificate and
lacks permission to required registrar attributes; don't substitute a peer MSP
register requested admin blindly
identity

Org3 enrollment/inspection fails Org3 service/config not Check `ca_org3`, peer `localhost:11051`, CA
present or `https://localhost:11054`, Org3 TLS path and channel membership
endpoint/cert mismatch

`curl: (52) Empty reply from server` SDK process crashed or `docker compose logs --tail=150 cartrade-sdk`; use async route
request failed outside wrapper and central error middleware
Express error flow

Chaincode container `Exited (127)` Chaincode `docker ps -a --filter ...`; `docker logs <container>`; check
command/process failed entry point/dependencies/runtime
to execute

Chaincode not found Wrong chaincode `peer lifecycle chaincode querycommitted -C cartrade-channel`
name/channel or  
definition not  
committed

Endorsement error with chaincode Chaincode rejected the Inspect `error.details[]`; distinguish business-rule denial
message transaction or from TLS/peer/runtime failure
endorsement failed

Unauthorized request returned HTTP 500 Middleware did not Fix `sdk/src/middleware/error.middleware.js`; expected
parse nested Fabric permission denials should return 403
error details

Private deal unreadable by inspector Expected behavior Org3 is excluded from `DealerBuyerPrivateCollection`; verify
dealer/buyer can read it

CA/peer certificate file exists but File may belong to Match endpoint → CA/peer → certificate; verify from SDK
still fails another org/service or container namespace
path may be host-only
------------------------------------------------------------------------------------------------------------------------------

## 11. Safe operational habits

- Do not run `./network.sh down` on an existing ledger unless you
  intend to reset/stop the sample network.
- Do not run `docker compose down -v` unless you deliberately want to
  remove named volumes and persistent data.
- Do not run `--remove-orphans` blindly in a multi-Compose Fabric
  setup.
- Do not run broad chaincode deployment scripts before querying the
  committed version/sequence.
- Avoid repeating `Mint`, `Burn`, `Transfer`, `TransferFrom`,
  ownership transfer, or inspection calls unless you intend to change
  state.
- Never commit `sdk/.env`, `sdk/wallet`, private keys, registrar
  secrets, or enrollment credentials.
- Keep CA/peer/orderer ports local to the development machine.
- A `/health` response proves that the REST process is reachable; it
  does not prove that the CA, Gateway, chaincode, channel, and private
  collection all work.
- A successful chaincode commit proves the definition is committed;
  test actual queries and transactions to prove runtime behavior.

## 12. Final checklist before calling setup complete

- [ ] Docker daemon works.
- [ ] Fabric peer/orderer/CA containers are healthy.
- [ ] Org1, Org2, and Org3 are configured and joined to
      `cartrade-channel`.
- [ ] CA URLs, CA TLS roots, registrar credentials, peer endpoints,
      and peer TLS roots are correct.
- [ ] `vehicle` and `erc20` definitions are committed at expected
      versions/sequences.
- [ ] `vehicle` has the `DealerBuyerPrivateCollection` configuration.
- [ ] SDK environment paths resolve from the SDK process/container.
- [ ] `dealer`, `buyer`, and `inspector` identities are enrolled in
      `sdk/wallet`.
- [ ] `/health` responds.
- [ ] Dealer and buyer can read the private deal; inspector cannot.
- [ ] Inspector can inspect; dealer cannot.
- [ ] Token balances, allowance, and total supply reconcile after demo
      transactions.
- [ ] Existing automated checks pass.
- [ ] The complete setup has been tested from a clean machine or clean
      environment without relying on hidden local state.
