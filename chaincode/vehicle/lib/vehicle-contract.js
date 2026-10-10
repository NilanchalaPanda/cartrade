"use strict";

const { Contract } = require("fabric-contract-api");

const DEAL_COLLECTION = "DealerBuyerPrivateCollection";
const DEALER_MSP = "Org1MSP";
const BUYER_MSP = "Org2MSP";
const INSPECTOR_MSP = "Org3MSP";

class VehicleContract extends Contract {
  async RegisterVehicle(ctx, vehicleId, manufacturer, model, year, vin) {
    this._requireNonEmpty(vehicleId, "vehicleId");
    this._requireNonEmpty(manufacturer, "manufacturer");
    this._requireNonEmpty(model, "model");
    this._requireNonEmpty(vin, "vin");
    this._requireOrg(
      ctx,
      DEALER_MSP,
      "Only Org1 Dealer can register a vehicle",
    );

    const parsedYear = this._parseYear(year);
    const existing = await ctx.stub.getState(vehicleId);
    if (existing.length > 0)
      throw new Error(`Vehicle ${vehicleId} already exists`);

    const vehicle = {
      vehicleId,
      manufacturer,
      model,
      year: parsedYear,
      vin,
      inspectionStatus: "PENDING",
      verified: false,
      owner: DEALER_MSP,
      status: "AVAILABLE",
    };

    await ctx.stub.putState(vehicleId, Buffer.from(JSON.stringify(vehicle)));
    return JSON.stringify(vehicle);
  }

  async GetVehicle(ctx, vehicleId) {
    const data = await ctx.stub.getState(vehicleId);
    if (data.length === 0)
      throw new Error(`Vehicle ${vehicleId} does not exist`);
    return data.toString();
  }

  async InspectVehicle(ctx, vehicleId, result) {
    this._requireOrg(
      ctx,
      INSPECTOR_MSP,
      "Only Org3 Inspector can inspect vehicles",
    );
    const normalizedResult = String(result || "")
      .trim()
      .toUpperCase();
    if (!["PASSED", "FAILED"].includes(normalizedResult)) {
      throw new Error("Inspection result must be PASSED or FAILED");
    }

    const vehicle = await this._getVehicle(ctx, vehicleId);
    if (vehicle.status === "SOLD")
      throw new Error("Sold vehicles cannot be inspected");

    vehicle.inspectionStatus = normalizedResult;
    if (normalizedResult === "FAILED") vehicle.verified = false;
    await this._putVehicle(ctx, vehicle);
    return JSON.stringify(vehicle);
  }

  async VerifyVehicle(ctx, vehicleId) {
    this._requireOrg(
      ctx,
      DEALER_MSP,
      "Only Org1 Dealer can verify the vehicle",
    );
    const vehicle = await this._getVehicle(ctx, vehicleId);
    if (vehicle.inspectionStatus !== "PASSED")
      throw new Error("Vehicle must pass inspection first");
    if (vehicle.status === "SOLD")
      throw new Error("Sold vehicles cannot be verified again");

    vehicle.verified = true;
    await this._putVehicle(ctx, vehicle);
    return JSON.stringify(vehicle);
  }

  async TransferOwnership(ctx, vehicleId, newOwnerMSP) {
    this._requireOrg(
      ctx,
      DEALER_MSP,
      "Only Org1 Dealer can transfer ownership",
    );
    if (newOwnerMSP !== BUYER_MSP)
      throw new Error("This case study transfers ownership to Org2 Buyer");

    const vehicle = await this._getVehicle(ctx, vehicleId);
    if (vehicle.owner !== DEALER_MSP)
      throw new Error(
        "Only the current dealer owner can transfer this vehicle",
      );
    if (!vehicle.verified) throw new Error("Vehicle must be verified first");
    if (vehicle.status === "SOLD") throw new Error("Vehicle is already sold");

    vehicle.owner = newOwnerMSP;
    vehicle.status = "SOLD";
    await this._putVehicle(ctx, vehicle);
    return JSON.stringify(vehicle);
  }

  async CreatePrivateDeal(ctx, vehicleId, originalPrice, discount, finalPrice) {
    const mspId = ctx.clientIdentity.getMSPID();
    if (mspId !== DEALER_MSP && mspId !== BUYER_MSP) {
      throw new Error(
        "Only Org1 Dealer and Org2 Buyer can create a private deal",
      );
    }

    const vehicle = await this._getVehicle(ctx, vehicleId);
    if (!vehicle.verified)
      throw new Error("Vehicle must be verified before creating the deal");
    if (vehicle.status === "SOLD")
      throw new Error(
        "A private deal cannot be created after ownership transfer",
      );

    const original = this._parseMoney(originalPrice, "originalPrice");
    const discountValue = this._parseMoney(discount, "discount");
    const final = this._parseMoney(finalPrice, "finalPrice");

    if (discountValue > original)
      throw new Error("Discount cannot exceed original price");
    if (final !== original - discountValue)
      throw new Error("finalPrice must equal originalPrice - discount");

    const existing = await ctx.stub.getPrivateData(DEAL_COLLECTION, vehicleId);
    if (existing.length > 0)
      throw new Error(`Private deal for ${vehicleId} already exists`);

    const deal = {
      vehicleId,
      originalPrice: original,
      discount: discountValue,
      finalPrice: final,
      currency: "INR",
    };

    await ctx.stub.putPrivateData(
      DEAL_COLLECTION,
      vehicleId,
      Buffer.from(JSON.stringify(deal)),
    );
    return JSON.stringify(deal);
  }

  async GetPrivateDeal(ctx, vehicleId) {
    const mspId = ctx.clientIdentity.getMSPID();
    if (mspId !== DEALER_MSP && mspId !== BUYER_MSP) {
      throw new Error(
        "Only Org1 Dealer and Org2 Buyer can read the private deal",
      );
    }

    const data = await ctx.stub.getPrivateData(DEAL_COLLECTION, vehicleId);
    if (data.length === 0)
      throw new Error(`Private deal for ${vehicleId} does not exist`);
    return data.toString();
  }

  async GetVehicleHistory(ctx, vehicleId) {
    const iterator = await ctx.stub.getHistoryForKey(vehicleId);
    const results = [];

    try {
      while (true) {
        const response = await iterator.next();

        if (response.done) {
          break;
        }

        const item = response.value;

        results.push({
          txId: item.txId,
          timestamp: item.timestamp,
          isDelete: item.isDelete,
          value: item.value ? item.value.toString() : "",
        });
      }
    } finally {
      await iterator.close();
    }

    return JSON.stringify(results);
  }

  async _getVehicle(ctx, vehicleId) {
    const data = await ctx.stub.getState(vehicleId);
    if (data.length === 0)
      throw new Error(`Vehicle ${vehicleId} does not exist`);
    return JSON.parse(data.toString());
  }

  async _putVehicle(ctx, vehicle) {
    await ctx.stub.putState(
      vehicle.vehicleId,
      Buffer.from(JSON.stringify(vehicle)),
    );
  }

  _requireOrg(ctx, expectedMsp, message) {
    if (ctx.clientIdentity.getMSPID() !== expectedMsp) throw new Error(message);
  }

  _requireNonEmpty(value, field) {
    if (!String(value || "").trim()) throw new Error(`${field} is required`);
  }

  _parseYear(value) {
    const year = Number(value);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1886 || year > currentYear + 1) {
      throw new Error("year must be a valid integer vehicle year");
    }
    return year;
  }

  _parseMoney(value, field) {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new Error(`${field} must be a non-negative integer`);
    return amount;
  }
}

module.exports = VehicleContract;
