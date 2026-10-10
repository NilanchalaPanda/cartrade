"use strict";
const fs = require("fs");
const crypto = require("crypto");
const grpc = require("@grpc/grpc-js");
const { connect, signers } = require("@hyperledger/fabric-gateway");
const {
  getOrgForIdentity,
  CHANNEL_NAME,
  VEHICLE_CHAINCODE,
  ERC20_CHAINCODE,
} = require("../config/network.config");
const { IdentityService } = require("./identity.service");
function readFile(filePath, label) {
  if (!filePath) throw new Error(`Missing ${label}`);
  if (!fs.existsSync(filePath))
    throw new Error(`${label} not found: ${filePath}`);
  return fs.readFileSync(filePath);
}
function deadline(name, fallback) {
  return Date.now() + Number(process.env[name] || fallback);
}
class FabricService {
  constructor() {
    this.identityService = new IdentityService();
    this.sessions = new Map();
  }
  async getSession(identityName) {
    if (this.sessions.has(identityName)) return this.sessions.get(identityName);
    const promise = this.createSession(identityName);
    this.sessions.set(identityName, promise);
    try {
      return await promise;
    } catch (e) {
      this.sessions.delete(identityName);
      throw e;
    }
  }
  async createSession(identityName) {
    const identity = await this.identityService.getIdentity(identityName);
    const org = getOrgForIdentity(identityName);
    const client = new grpc.Client(
      org.peerEndpoint,
      grpc.credentials.createSsl(
        readFile(org.peerTlsCertPath, "peer TLS certificate"),
      ),
      { "grpc.ssl_target_name_override": org.peerHostAlias },
    );
    const gateway = connect({
      client,
      identity: {
        mspId: identity.mspId,
        credentials: Buffer.from(identity.credentials.certificate),
      },
      signer: signers.newPrivateKeySigner(
        crypto.createPrivateKey(identity.credentials.privateKey),
      ),
      evaluateOptions: () => ({
        deadline: deadline("FABRIC_GATEWAY_EVALUATE_TIMEOUT_MS", 5000),
      }),
      endorseOptions: () => ({
        deadline: deadline("FABRIC_GATEWAY_ENDORSE_TIMEOUT_MS", 15000),
      }),
      submitOptions: () => ({
        deadline: deadline("FABRIC_GATEWAY_SUBMIT_TIMEOUT_MS", 15000),
      }),
      commitStatusOptions: () => ({
        deadline: deadline("FABRIC_GATEWAY_COMMIT_TIMEOUT_MS", 60000),
      }),
    });
    return { client, gateway };
  }
  async contract(identityName, chaincodeName) {
    const { gateway } = await this.getSession(identityName);
    return gateway.getNetwork(CHANNEL_NAME).getContract(chaincodeName);
  }
  async evaluate(identityName, chaincodeName, transactionName, ...args) {
    return parseResult(
      await (
        await this.contract(identityName, chaincodeName)
      ).evaluateTransaction(transactionName, ...args),
    );
  }
  async submit(identityName, chaincodeName, transactionName, ...args) {
    return parseResult(
      await (
        await this.contract(identityName, chaincodeName)
      ).submitTransaction(transactionName, ...args),
    );
  }
  vehicle(identityName) {
    return {
      get: (id) =>
        this.evaluate(identityName, VEHICLE_CHAINCODE, "GetVehicle", id),
      register: (...a) =>
        this.submit(identityName, VEHICLE_CHAINCODE, "RegisterVehicle", ...a),
      inspect: (...a) =>
        this.submit(identityName, VEHICLE_CHAINCODE, "InspectVehicle", ...a),
      verify: (id) =>
        this.submit(identityName, VEHICLE_CHAINCODE, "VerifyVehicle", id),
      transfer: (...a) =>
        this.submit(identityName, VEHICLE_CHAINCODE, "TransferOwnership", ...a),
      history: (id) =>
        this.evaluate(identityName, VEHICLE_CHAINCODE, "GetVehicleHistory", id),
    };
  }
  deal(identityName) {
    return {
      create: (...a) =>
        this.submit(identityName, VEHICLE_CHAINCODE, "CreatePrivateDeal", ...a),
      get: (id) =>
        this.evaluate(identityName, VEHICLE_CHAINCODE, "GetPrivateDeal", id),
    };
  }
  token(identityName) {
    return {
      initialize: (...a) =>
        this.submit(identityName, ERC20_CHAINCODE, "Initialize", ...a),
      mint: (...a) => this.submit(identityName, ERC20_CHAINCODE, "Mint", ...a),
      balance: (a) =>
        this.evaluate(identityName, ERC20_CHAINCODE, "BalanceOf", a),
      transfer: (...a) =>
        this.submit(identityName, ERC20_CHAINCODE, "Transfer", ...a),
      approve: (...a) =>
        this.submit(identityName, ERC20_CHAINCODE, "Approve", ...a),
      allowance: (...a) =>
        this.evaluate(identityName, ERC20_CHAINCODE, "Allowance", ...a),
      transferFrom: (...a) =>
        this.submit(identityName, ERC20_CHAINCODE, "TransferFrom", ...a),
      burn: (...a) => this.submit(identityName, ERC20_CHAINCODE, "Burn", ...a),
      totalSupply: () =>
        this.evaluate(identityName, ERC20_CHAINCODE, "TotalSupply"),
    };
  }
  async close() {
    for (const p of this.sessions.values()) {
      try {
        const { gateway, client } = await p;
        gateway.close();
        client.close();
      } catch {}
    }
    this.sessions.clear();
  }
}
function parseResult(result) {
  const value = Buffer.from(result).toString();
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
module.exports = { FabricService };
