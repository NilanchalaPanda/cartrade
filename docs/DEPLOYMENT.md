# CarTrade SDK Deployment Guide

## Option A — Run Node.js directly

```bash
cd cartrade-fabric/sdk
cp .env.example .env
npm install
npm start
```

The API listens on `PORT` (default `4000`).

## Option B — Docker on the same Linux host as Fabric

### 1. Prepare paths

The container needs:

```text
/app/sdk/wallet        persistent enrolled identities
/fabric-network        read-only Fabric certificates/crypto material
```

The host should therefore have something like:

```text
cartrade-fabric/
├── sdk/
│   ├── .env
│   └── wallet/
└── fabric-network/
    └── organizations/
```

### 2. Configure `.env`

```bash
cp sdk/.env.example sdk/.env
```

Set the certificate paths **as seen from inside the container**, for example:

```text
/fabric-network/organizations/peerOrganizations/...
```

Do not put the host path `/home/you/...` into those variables if the files are mounted at `/fabric-network` in Docker.

### 3. Build

```bash
docker build -t cartrade-sdk:1.0 .
```

### 4. Run

```bash
docker run -d \
  --name cartrade-sdk \
  --restart unless-stopped \
  --network host \
  --env-file sdk/.env \
  -v "$PWD/sdk/wallet:/app/sdk/wallet" \
  -v "$PWD/fabric-network:/fabric-network:ro" \
  cartrade-sdk:1.0
```

### 5. Check

```bash
curl http://localhost:4000/health
docker logs -f cartrade-sdk
```

## Option C — Docker Compose

```bash
cp sdk/.env.example sdk/.env
export FABRIC_NETWORK_PATH=/absolute/path/to/fabric-network
docker compose up -d --build
```

Stop:

```bash
docker compose down
```

Logs:

```bash
docker compose logs -f cartrade-sdk
```

## Production layout

A sensible deployment is:

```text
Internet
   │
   ▼
Nginx / Load Balancer
   │ HTTPS
   ▼
CarTrade REST SDK container
   │ gRPC/TLS
   ▼
Fabric peer(s)
   │
   ▼
Orderer / Channel / Chaincode
```

Do not expose the Fabric peer, orderer or CA directly to the public Internet just because the REST API is public.

## Wallet persistence

The SDK wallet contains enrolled certificates and private keys. Mount it as a persistent volume:

```text
./sdk/wallet:/app/sdk/wallet
```

Back it up securely if the identities are important. Never put wallet contents into Git.

## Reverse proxy

If Nginx is used, proxy only the REST API:

```nginx
server {
    listen 443 ssl;
    server_name cartrade.example.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Terminate public HTTPS at Nginx/load balancer. Keep Fabric's own TLS configuration separate.

## Environment variables

The complete list is in `sdk/.env.example`.

### Application

```text
NODE_ENV
PORT
HOST
CHANNEL_NAME
VEHICLE_CHAINCODE
ERC20_CHAINCODE
WALLET_PATH
DEFAULT_FABRIC_IDENTITY
```

### Org-specific network variables

For each of `ORG1`, `ORG2`, `ORG3`:

```text
*_MSP_ID
*_CA_NAME
*_CA_URL
*_CA_TLS_CERT_PATH
*_ADMIN_CERT_PATH
*_ADMIN_KEY_PATH
*_AFFILIATION
*_PEER_ENDPOINT
*_PEER_HOST_ALIAS
*_PEER_TLS_CERT_PATH
```

### Gateway timeouts

```text
FABRIC_GATEWAY_EVALUATE_TIMEOUT_MS
FABRIC_GATEWAY_ENDORSE_TIMEOUT_MS
FABRIC_GATEWAY_SUBMIT_TIMEOUT_MS
FABRIC_GATEWAY_COMMIT_TIMEOUT_MS
```

## Production security checklist

Before production:

- replace demo identity selection with real application authentication;
- protect `/api/identity/register` and `/api/identity/enroll` with administrator authorization;
- move CA admin private keys to a secret store;
- use read-only mounts for Fabric CA/peer crypto material;
- run the container as a non-root user;
- restrict the wallet volume to the container user;
- use HTTPS for REST;
- configure rate limiting at the reverse proxy/API gateway;
- avoid logging certificates, private keys, enrollment secrets or private deal values;
- configure monitoring and backups;
- use an explicit Fabric endorsement policy for production.
