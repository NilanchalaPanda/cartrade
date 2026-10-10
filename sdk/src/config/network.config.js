"use strict";
const path = require("path");
function optional(name, fallback) {
  return process.env[name] || fallback;
}
const ORGS = {
  dealer: {
    mspId: optional("ORG1_MSP_ID", "Org1MSP"),
    caName: optional("ORG1_CA_NAME", "ca-org1"),
    caUrl: optional("ORG1_CA_URL", "https://localhost:7054"),
    caTlsCertPath: process.env.ORG1_CA_TLS_CERT_PATH,
    adminCertPath: process.env.ORG1_ADMIN_CERT_PATH,
    adminKeyPath: process.env.ORG1_ADMIN_KEY_PATH,
    affiliation: optional("ORG1_AFFILIATION", "org1.department1"),
    peerEndpoint: optional("ORG1_PEER_ENDPOINT", "localhost:7051"),
    peerHostAlias: optional("ORG1_PEER_HOST_ALIAS", "peer0.org1.example.com"),
    peerTlsCertPath: process.env.ORG1_PEER_TLS_CERT_PATH,
  },
  buyer: {
    mspId: optional("ORG2_MSP_ID", "Org2MSP"),
    caName: optional("ORG2_CA_NAME", "ca-org2"),
    caUrl: optional("ORG2_CA_URL", "https://localhost:8054"),
    caTlsCertPath: process.env.ORG2_CA_TLS_CERT_PATH,
    adminCertPath: process.env.ORG2_ADMIN_CERT_PATH,
    adminKeyPath: process.env.ORG2_ADMIN_KEY_PATH,
    affiliation: optional("ORG2_AFFILIATION", "org2.department1"),
    peerEndpoint: optional("ORG2_PEER_ENDPOINT", "localhost:9051"),
    peerHostAlias: optional("ORG2_PEER_HOST_ALIAS", "peer0.org2.example.com"),
    peerTlsCertPath: process.env.ORG2_PEER_TLS_CERT_PATH,
  },
  inspector: {
    mspId: optional("ORG3_MSP_ID", "Org3MSP"),
    caName: optional("ORG3_CA_NAME", "ca-org3"),
    caUrl: optional("ORG3_CA_URL", "https://localhost:9054"),
    caTlsCertPath: process.env.ORG3_CA_TLS_CERT_PATH,
    adminCertPath: process.env.ORG3_ADMIN_CERT_PATH,
    adminKeyPath: process.env.ORG3_ADMIN_KEY_PATH,
    affiliation: optional("ORG3_AFFILIATION", "org3.department1"),
    peerEndpoint: optional("ORG3_PEER_ENDPOINT", "localhost:10051"),
    peerHostAlias: optional("ORG3_PEER_HOST_ALIAS", "peer0.org3.example.com"),
    peerTlsCertPath: process.env.ORG3_PEER_TLS_CERT_PATH,
  },
};
const IDENTITY_TO_ORG = {
  dealer: "dealer",
  buyer: "buyer",
  inspector: "inspector",
};
function getOrgForIdentity(identityName) {
  const orgKey = IDENTITY_TO_ORG[identityName];
  if (!orgKey)
    throw new Error(
      `Unknown Fabric identity: ${identityName}. Use dealer, buyer, or inspector.`,
    );
  return ORGS[orgKey];
}
function getWalletPath() {
  return path.resolve(
    optional("WALLET_PATH", path.join(__dirname, "../../wallet")),
  );
}
module.exports = {
  ORGS,
  IDENTITY_TO_ORG,
  getOrgForIdentity,
  getWalletPath,
  CHANNEL_NAME: optional("CHANNEL_NAME", "cartrade-channel"),
  VEHICLE_CHAINCODE: optional("VEHICLE_CHAINCODE", "vehicle"),
  ERC20_CHAINCODE: optional("ERC20_CHAINCODE", "erc20"),
};
