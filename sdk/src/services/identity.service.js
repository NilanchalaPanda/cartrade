"use strict";
const fs = require("fs");
const path = require("path");
const FabricCAServices = require("fabric-ca-client");
const { Wallets } = require("fabric-network");
const {
  getOrgForIdentity,
  getWalletPath,
} = require("../config/network.config");
function readFile(filePath, label) {
  if (!filePath) throw new Error(`Missing ${label}`);
  if (!fs.existsSync(filePath))
    throw new Error(`${label} not found: ${filePath}`);
  return fs.readFileSync(filePath);
}
function toTlsOptions(org) {
  return org.caTlsCertPath
    ? {
        trustedRoots: readFile(org.caTlsCertPath, "CA TLS certificate"),
        verify: true,
      }
    : { verify: false };
}

class IdentityService {
  constructor() {
    this.walletPromise = Wallets.newFileSystemWallet(getWalletPath());
  }

  async getCaRegistrar(orgConfig, org, ca) {
    const wallet = await this.wallet();
    const adminLabel = `__ca_admin_${org}`;

    const existingIdentity = await wallet.get(adminLabel);
    if (existingIdentity) {
      const provider = wallet
        .getProviderRegistry()
        .getProvider(existingIdentity.type);

      return provider.getUserContext(existingIdentity, adminLabel);
    }

    const enrollment = await ca.enroll({
      enrollmentID:
        process.env[
          `ORG${org === "dealer" ? 1 : org === "buyer" ? 2 : 3}_CA_BOOTSTRAP_ID`
        ] || "admin",
      enrollmentSecret:
        process.env[
          `ORG${org === "dealer" ? 1 : org === "buyer" ? 2 : 3}_CA_BOOTSTRAP_SECRET`
        ] || "adminpw",
    });

    const caAdminIdentity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: orgConfig.mspId,
      type: "X.509",
    };

    await wallet.put(adminLabel, caAdminIdentity);

    const provider = wallet
      .getProviderRegistry()
      .getProvider(caAdminIdentity.type);

    return provider.getUserContext(caAdminIdentity, adminLabel);
  }

  async wallet() {
    return this.walletPromise;
  }
  async hasIdentity(identityName) {
    return Boolean(await (await this.wallet()).get(identityName));
  }
  async listIdentities() {
    const walletPath = getWalletPath();
    await fs.promises.mkdir(walletPath, { recursive: true });
    const entries = await fs.promises.readdir(walletPath, {
      withFileTypes: true,
    });
    return entries
      .filter(
        (e) =>
          e.isFile() &&
          e.name.endsWith(".id") &&
          !e.name.startsWith("__admin_"),
      )
      .map((e) => path.basename(e.name, ".id"))
      .sort();
  }

  async registerUser({
    identityName,
    enrollmentId,
    org,
    role = "client",
    affiliation,
  }) {
    if (process.env.IDENTITY_REGISTRATION_ENABLED === "false") {
      throw new Error("Fabric CA identity registration is disabled");
    }

    const orgConfig = getOrgForIdentity(org);

    const ca = new FabricCAServices(
      orgConfig.caUrl,
      toTlsOptions(orgConfig),
      orgConfig.caName,
    );

    const adminUser = await this.getCaRegistrar(orgConfig, org, ca);

    const secret = await ca.register(
      {
        enrollmentID: enrollmentId,
        affiliation: affiliation || orgConfig.affiliation,
        role,
      },
      adminUser,
    );

    return {
      identityName,
      enrollmentId,
      org,
      mspId: orgConfig.mspId,
      secret,
    };
  }

  async enrollUser({ identityName, enrollmentId, enrollmentSecret, org }) {
    const orgConfig = getOrgForIdentity(org);
    const ca = new FabricCAServices(
      orgConfig.caUrl,
      toTlsOptions(orgConfig),
      orgConfig.caName,
    );
    const enrollment = await ca.enroll({
      enrollmentID: enrollmentId,
      enrollmentSecret,
    });
    const wallet = await this.wallet();
    await wallet.put(identityName, {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: orgConfig.mspId,
      type: "X.509",
    });
    return { identityName, enrollmentId, org, mspId: orgConfig.mspId };
  }
  async getIdentity(identityName) {
    const identity = await (await this.wallet()).get(identityName);
    if (!identity)
      throw new Error(
        `Identity '${identityName}' is not enrolled in the wallet`,
      );
    return identity;
  }
}
module.exports = { IdentityService };
