# CarTrade Hyperledger Fabric --- Challenges, Errors and Lessons Learned

> This is a troubleshooting and revision log. It follows the
> order supported by the conversation/log excerpts. Exact terminal
> output is included only where it was captured. Some issues were
> discussed over several turns; where exact chronology cannot be proven,
> the item is marked as a related follow-up rather than inventing a
> precise timestamp.

## 1. The debugging approach that emerged

The main lesson was to troubleshoot from the outside inward:

1.  Is Docker running and is the expected container `Up`?
2.  Is the correct Fabric CA service running?
3.  Does the SDK point to the right CA URL, CA name, and CA TLS
    certificate?
4.  Are the peer endpoints and peer TLS roots correct?
5.  Is the admin identity authorized to register identities with the CA?
6.  Is the SDK wallet populated with the intended alias and MSP?
7.  Is the chaincode installed, approved, committed, and running?
8.  Does chaincode reject the operation by design?
9.  Does the REST error middleware translate the Fabric error into an
    appropriate HTTP response?

A generic `500`, a gRPC endorsement error, and a CA TLS error are not
the same problem. Logs and a small verification command are needed to
identify the layer that failed.

## 2. Challenges in the order reconstructed from the available logs

### Challenge 1 --- Identity alias did not match the SDK's configured identity

**Symptom:** the API reported `Unknown Fabric identity`.

**Cause:** a request used an organization-like value such as `org1`
where the SDK expected a configured wallet alias. The configured aliases
were `dealer`, `buyer`, and `inspector`.

**Resolution:** use the alias that the SDK knows, and ensure the
corresponding wallet identity has been enrolled.

```bash
# Example request header
-H "X-Fabric-Identity: dealer"
```

**How to explain it for a KT:** an MSP ID and an
application-level wallet alias are different concepts. `Org1MSP`
identifies Fabric membership; `dealer` is the SDK's lookup key that
resolves to an identity certificate/private key plus MSP ID.

### Challenge 2 --- CA service was stopped or unavailable

**Symptoms:** connection failures during registration/enrollment; the
SDK could not complete CA operations. The local CA containers were not
all running at the same time. One captured status showed `ca_org1`
starting, while `ca_org2` and `ca_orderer` had exited with status 137;
Org3 services were also managed separately.

**Cause:** the SDK cannot register/enroll against a CA that is not
listening. `Exited (137)` commonly means the process was killed (often
due to an external kill or memory pressure); it does not by itself prove
the exact root cause.

**Commands used to inspect/start services:**

```bash
cd /home/nxl/Projects/hyperledger/fabric-samples/test-network

docker compose -f compose/compose-ca.yaml ps
docker compose -f compose/compose-ca.yaml up -d ca_org1
docker compose -f compose/compose-ca.yaml ps ca_org1
docker logs --tail 80 ca_org1

# The Org3 service was also inspected separately:
docker logs --tail 80 ca_org3
```

**Resolution principle:** start the correct service using the Compose
file that actually defines it, then confirm it is `Up` and inspect its
logs. A running peer does not imply its CA is running.

**Caution:** a Compose warning about "orphan containers" means
containers exist that are not represented in the particular Compose file
being used. It is not a reason to run `--remove-orphans` blindly; that
can remove services from the wider Fabric setup.

### Challenge 3 --- Org1 CA TLS trust certificate path was wrong

**Symptom:** the SDK's TLS connection to the Org1 CA failed before the
registration request could be authorized.

**Cause:** the CA TLS root path in the SDK environment did not point to
the certificate actually trusted by the running CA. The fix recorded in
the conversation was to use:

```text
/fabric-network/addOrg1/fabric-ca/org1/ca-cert.pem
```

The SDK environment variable was corrected to the actual mounted path,
recorded as `ORG1_CA_TLS_CERT_PATH`.

**How the right certificate was identified:**

- Inspect the running CA's mounted configuration/crypto material
  rather than choosing a certificate by filename alone.
- Match the path to the CA instance and the path visible **inside the
  SDK container**.
- Verify the candidate certificate cryptographically against the
  endpoint certificate/chain.
- Check the certificate subject/issuer and the CA endpoint host/port.

A recorded OpenSSL verification result was `Verify return code: 0 (ok)`,
which is evidence that OpenSSL trusted the certificate chain used in
that test. It does not prove that the CA registrar credentials are
authorized or that every SDK path is correct.

Useful checks:

```bash
# Confirm the file exists at the path the SDK process uses.
test -r /fabric-network/addOrg1/fabric-ca/org1/ca-cert.pem && echo "CA cert readable"

# Inspect certificate subject, issuer, and dates.
openssl x509 -in /fabric-network/addOrg1/fabric-ca/org1/ca-cert.pem \
  -noout -subject -issuer -dates

# Verify a server certificate against the intended CA root (use the actual server cert path).
openssl verify -CAfile /fabric-network/addOrg1/fabric-ca/org1/ca-cert.pem \
  /path/to/actual-ca-server-cert.pem
```

**Lesson:** a file existing is not enough. It must be the trust
certificate for the exact CA endpoint being contacted, and the path must
be valid from the SDK's execution environment.

### Challenge 4 --- Org1 registration failed with Fabric CA authorization code 71

**Symptom:** after the CA TLS issue was fixed, registration failed with
CA authorization code `71`.

**Cause:** TLS trust and registrar authorization are separate. The
certificate/key being used as the registrar was not authorized by the CA
server to register the requested identity. A peer MSP admin certificate
is not automatically a CA registrar identity with the required registrar
attributes/roles.

**Resolution principle:**

- Identify the bootstrap/registrar identity that the specific CA
  server configured as its registrar.
- Use the matching registrar certificate and private key (or the
  intended configured username/secret flow) for CA registration.
- Do not assume "admin of Org1 MSP" means "CA registrar allowed to
  register identities."
- If using the CA's CLI, verify the CA name, CA URL, CA TLS root, and
  registrar identity together.

The exact secret should not be placed in documentation or committed to
the repository. The conversation evidence establishes the root
distinction; it does not establish a safe reusable registrar password,
so this document intentionally does not invent one.

### Challenge 5 --- Org3 CA/peer required its own URL, port, and TLS material

**Symptoms:** Org3 identity enrollment or inspection setup failed while
Org3 services were being brought online.

**Cause:** Org3 was not simply Org1 or Org2 with a different MSP string.
It had its own CA and peer endpoints and its own TLS material. The
working Org3 settings recorded in the conversation were:

```text
Org3 CA URL:       https://localhost:11054
Org3 peer endpoint: localhost:11051
Org3 CA TLS cert:  /fabric-network/addOrg3/fabric-ca/org3/tls-cert.pem
```

The CA container was observed on port `11054`; the peer was published on
`11051`.

**Resolution:** configure the SDK's Org3 URL, peer endpoint, CA TLS
certificate path, and TLS host alias for the actual Org3 services. Then
check that the files exist and the CA/peer containers are `Up`.

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker logs --tail 80 ca_org3
```

**Lesson:** copy the configuration pattern, not another organization's
literal values. Org-specific ports, CA root certificates, peer TLS
roots, MSP IDs, and host aliases must all correspond to the same
organization/service.

### Challenge 6 --- SDK process crashed and curl returned `Empty reply from server`

**Symptom:** `curl: (52) Empty reply from server`, or requests ended
without a JSON response.

**Cause:** the Express SDK was crashing when asynchronous
controller/route work failed. Express 4 does not automatically forward
every rejected async handler promise to error middleware unless the
route wraps the promise or explicitly calls `next(error)`.

**Resolution:** introduce/use a shared async wrapper:

```javascript
"use strict";

function asyncHandler(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

module.exports = { asyncHandler };
```

Routes then wrap their controllers with `asyncHandler(...)`. The
identity, deal, token, and vehicle route handling was aligned to this
approach during the work.

**Diagnostic commands:**

```bash
docker compose ps
docker compose logs --tail=150 cartrade-sdk
curl -i http://localhost:4000/health
```

**Lesson:** `Empty reply` often means the process or connection
disappeared before a valid HTTP response was written. Inspect the server
logs and route error flow instead of assuming the endpoint path or JSON
body is wrong.

### Challenge 7 --- Chaincode containers exited with status 127 after deployment

**Symptom:** lifecycle commands showed the chaincode definition
committed, but `dev-peer...` chaincode containers were `Exited (127)`.

A captured status included containers for `erc20_1.1` and `vehicle_1.1`
exiting with code 127.

**What this proves:** the chaincode container's process did not
launch/execute successfully. Exit 127 often means a command was not
found, but the exit code alone does not prove which command was missing.

**How to investigate:**

```bash
docker ps -a --filter 'name=dev-peer0.org1.example.com'
docker ps -a --filter 'name=dev-peer0.org2.example.com'

# Then inspect the exact container name returned above:
docker logs --tail 150 <exact-chaincode-container-name>
```

Also check that the chaincode package contains the correct
`package.json`, entry point, and dependencies, and that the Fabric peer
can build/run the JavaScript chaincode using the configured external
builder/runtime. Do not confuse "definition committed" with "successful
transaction invocation."

**Evidence limitation:** the available log excerpt proves exit 127, but
does not preserve a definitive final root cause for that particular
container exit.

### Challenge 8 --- Chaincode deployment/version/sequence had to be tracked carefully

**Symptom:** repeated deployment attempts and changing package
labels/sequences made it easy to confuse an installed package with the
committed chaincode definition.

**Concepts used:**

- Install package on peer.
- Approve definition for the channel per required organization.
- Check readiness.
- Commit definition.
- Query the committed definition and verify
  version/sequence/approvals.

Captured lifecycle output showed `erc20` version `1.1`, sequence `2`,
approved by Org1MSP and Org2MSP. The final state recorded later in the
project summary is `erc20` v1.2 sequence 3, and `vehicle` v1.3 sequence 4. These are different points in the iteration history, not
contradictory if later upgrades were committed.

**Useful commands (run with the appropriate peer environment
configured):**

```bash
peer lifecycle chaincode queryinstalled
peer lifecycle chaincode querycommitted -C cartrade-channel
```

**Important:** do not run a broad custom deployment script blindly if it
redeploys both chaincodes or reuses the wrong sequence. Check the
current committed definition first and update only the intended
chaincode.

### Challenge 9 --- Collection configuration belongs to `vehicle`, not `erc20`

**Issue to remember:** the deal record uses Fabric private-data APIs.
Its collection policy must be attached to the chaincode that
reads/writes the private data.

Correct deployment pattern:

```bash
./network.sh deployCC \
  -ccn vehicle \
  -ccp /ABS/PATH/cartrade-fabric/chaincode/vehicle \
  -ccl javascript \
  -c cartrade-channel \
  -cccg /ABS/PATH/cartrade-fabric/collections/collections_config.json

./network.sh deployCC \
  -ccn erc20 \
  -ccp /ABS/PATH/cartrade-fabric/chaincode/erc20 \
  -ccl javascript \
  -c cartrade-channel
```

The collection config should not be passed to `erc20`. Also, the stock
Fabric sample network is Org1 + Org2 only; this project needs a
three-organization network for the inspector flow.

### Challenge 10 --- Chaincode correctly rejected unauthorized requests, but API returned 500

**Symptom:** dealer tried to inspect a vehicle and got:

```text
10 ABORTED: failed to endorse transaction, see attached details for more info
chaincode response 500, Only Org3 Inspector can inspect vehicles
```

The inspector's private-deal read was also rejected by chaincode, but
initially the API surfaced the failure as HTTP 500.

**Cause:** the chaincode authorization was working. Fabric Gateway
returned an endorsement error with the business rejection nested in
`error.details[]`; the middleware only read `error.statusCode` or
`error.status`, so it fell back to 500.

**Fix:** update `sdk/src/middleware/error.middleware.js` to inspect
endorsement detail messages, recognize authorization rejections, and
return HTTP 403 while preserving the meaningful chaincode message. The
final tested response was:

```json
{
  "success": false,
  "error": "Only Org3 Inspector can inspect vehicles",
  "path": "/api/vehicles/VEHICLE-002/inspect"
}
```

with `HTTP/1.1 403 Forbidden`.

Rebuild only the SDK service after middleware changes:

```bash
cd /home/nxl/Projects/cartrade-fabric
docker compose up -d --build --force-recreate cartrade-sdk
```

**Validation performed:** - Dealer attempting inspection →
`403 Forbidden`. - Inspector inspecting `VEHICLE-002` → `200 OK`. -
Inspector reading private deal → `403 Forbidden`. - Dealer reading
private deal → `200 OK`. - Buyer reading private deal → `200 OK`.

**Lesson:** distinguish an expected business-rule rejection from an
infrastructure fault. Authorization should be enforced in chaincode and
translated cleanly at the HTTP boundary.

## 3. CA troubleshooting: how to identify the correct certificate

A doubt may occur: "There are multiple CA certificates. How did you
know which one to use?"

Answer with the process, not "I tried files until it worked":

1.  **Identify the endpoint first.** For example, Org1 CA at its
    configured host/port versus Org3 CA at `localhost:11054`.
2.  **Inspect the Compose service and volume mounts.** Establish which
    host directory is mounted into the CA container and which CA
    instance owns the certificate.
3.  **Use the certificate belonging to that CA instance.** Do not
    substitute the peer's TLS root or another organization's CA
    certificate.
4.  **Check subject, issuer, and validity.** Use
    `openssl x509 -noout -subject -issuer -dates`.
5.  **Verify the chain.** Use
    `openssl verify -CAfile <candidate-root.pem> <server-cert.pem>` with
    the actual CA server certificate.
6.  **Check hostname and endpoint.** A trusted root does not make a
    mismatched hostname valid; the URL/TLS host alias must align with
    certificate SANs.
7.  **Check from the SDK's filesystem namespace.** In Compose, host
    files may be mounted under `/fabric-network`; a host path like
    `/home/...` may not exist inside the SDK container.
8.  **Make a real CA request after TLS passes.** A subsequent CA
    authorization code 71 means the TLS stage was passed far enough for
    authorization to be evaluated, but registrar permissions still need
    fixing.

### CA TLS vs peer TLS vs enrollment identity

---

Material What it proves Where used

---

CA TLS root certificate Client trusts the CA CA register/enroll
HTTPS endpoint connection

Peer TLS root Client trusts peer's Fabric Gateway peer
certificate gRPC TLS endpoint connection

Enrollment Client identity signs Fabric Gateway /
certificate + private Fabric proposals transaction signing
key

CA registrar identity Permission to CA admin operations
register/enroll other  
identities
-----------------------------------------------------------------------

These are not interchangeable.

## 4. Frequently used commands and when to use them

```bash
# Runtime overview
docker ps
docker ps -a
docker compose ps

# SDK logs
docker compose logs --tail=150 cartrade-sdk
docker compose logs -f cartrade-sdk

# Logs for a particular CA service
docker logs --tail 80 ca_org1
docker logs --tail 80 ca_org3

# Start a CA defined in the CA Compose file
docker compose -f compose/compose-ca.yaml up -d ca_org1
docker compose -f compose/compose-ca.yaml ps ca_org1

# Rebuild/recreate only the SDK after SDK code changes
docker compose up -d --build --force-recreate cartrade-sdk

# Inspect TLS certificate identity and validity
openssl x509 -in /path/to/cert.pem -noout -subject -issuer -dates

# Verify a server certificate against the candidate CA root
openssl verify -CAfile /path/to/ca-root.pem /path/to/server-cert.pem

# Verify the SDK's health endpoint
curl -i http://localhost:4000/health

# Check committed chaincode definitions (with Fabric peer env configured)
peer lifecycle chaincode querycommitted -C cartrade-channel
peer lifecycle chaincode queryinstalled
```

Use `docker compose logs` for Compose-managed services; use
`docker logs` for a specific container. The first is scoped to the
Compose service; the second uses a container name or ID.

## 5. Final tested state after fixes

### Vehicle

`VEHICLE-002` current state: - Honda City, year 2025 -
`inspectionStatus: PASSED` - `verified: true` - `owner: Org1MSP` -
`status: AVAILABLE`

The history endpoint returned four states newest-first: 1. Latest
inspection: PASSED / verified true 2. Verified: PASSED / verified true 3. Inspection passed before verification: PASSED / verified false 4.
Registration: PENDING / verified false

### Private deal

- Dealer read: 200
- Buyer read: 200
- Inspector read: 403
- Values: ₹12,50,000 original, ₹50,000 discount, ₹12,00,000 final

### Token state

- Dealer balance: 1,249,790 AUTO
- Buyer balance: 200 AUTO
- Remaining Org1 → Org2 allowance: 400 AUTO
- Total supply: 1,249,990 AUTO

The arithmetic reconciles: 1,250,000 minted minus 10 burned equals
1,249,990 outstanding. The allowance is not part of supply or a separate
balance.

## 6. Important lessons

- **A peer MSP admin is not automatically a CA registrar.** MSP
  administration and CA registration authority are separate permission
  systems.
- **TLS and authorization are separate failure layers.** Fixing a CA
  trust certificate does not grant registrar permissions.
- **Every organization needs its own correct crypto material and
  endpoint configuration.** Do not reuse Org1 paths for Org2/Org3.
- **Container status is evidence, not diagnosis.** `Exited (127)`
  tells you a command/process failed to execute, but logs reveal why.
- **A committed chaincode definition does not prove the chaincode can
  execute.** Inspect the chaincode container and test an actual
  query/transaction.
- **The channel is a scope boundary.** Chaincode and organizations
  must be configured for the same channel.
- **PDC membership is not the same as channel membership.** Org3 can
  participate in the channel/inspection workflow and still be excluded
  from the deal collection.
- **Authorization should be checked in chaincode.** API checks are
  helpful, but cannot replace ledger-side enforcement.
- **HTTP status codes are part of API correctness.** Expected
  permission denials should be 403, not a generic 500.
- **Read-only checks should precede state-changing tests.** Re-running
  inspection, transfer, mint, or burn can alter ledger state and
  invalidate expected balances.
