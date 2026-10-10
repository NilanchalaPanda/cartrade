'use strict';

// Backwards-compatible low-level Gateway helpers. The REST SDK uses
// src/services/fabric.service.js, which adds wallet-based identity selection.
const fs = require('fs');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { connect, signers } = require('@hyperledger/fabric-gateway');

function loadFile(filePath, label) {
    if (!filePath || !fs.existsSync(filePath)) throw new Error(`${label} not found: ${filePath || '<unset>'}`);
    return fs.readFileSync(filePath);
}

function newGrpcConnection({ tlsCertPath, peerEndpoint, peerHostAlias }) {
    return new grpc.Client(peerEndpoint, grpc.credentials.createSsl(loadFile(tlsCertPath, 'TLS certificate')), { 'grpc.ssl_target_name_override': peerHostAlias });
}

function newGateway(grpcClient, { mspId, certPath, keyPath }) {
    const identity = { mspId, credentials: loadFile(certPath, 'certificate') };
    const signer = signers.newPrivateKeySigner(crypto.createPrivateKey(loadFile(keyPath, 'private key')));
    return connect({ client: grpcClient, identity, signer });
}

module.exports = { newGrpcConnection, newGateway };
