"use strict";

class DealController {
  constructor(fabricService) {
    this.fabricService = fabricService;
  }
  create = async (req, res) => {
    const { vehicleId, originalPrice, discount, finalPrice } = req.body;
    if (!vehicleId || originalPrice === undefined || discount === undefined) {
      const error = new Error(
        "vehicleId, originalPrice and discount are required",
      );
      error.statusCode = 400;
      throw error;
    }
    const original = Number(originalPrice);
    const discountValue = Number(discount);
    const calculated = original - discountValue;
    const final = finalPrice === undefined ? calculated : Number(finalPrice);
    if (
      !Number.isSafeInteger(original) ||
      !Number.isSafeInteger(discountValue) ||
      !Number.isSafeInteger(final)
    ) {
      const error = new Error("Prices must be safe integers");
      error.statusCode = 400;
      throw error;
    }
    const data = await this.fabricService
      .deal(req.fabricIdentity)
      .create(
        vehicleId,
        String(original),
        String(discountValue),
        String(final),
      );
    res.status(201).json({ success: true, data });
  };
  get = async (req, res) => {
    const data = await this.fabricService
      .deal(req.fabricIdentity)
      .get(req.params.vehicleId);
    res.json({ success: true, data });
  };
}
module.exports = { DealController };
