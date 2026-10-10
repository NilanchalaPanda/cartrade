"use strict";

function requiredBody(body, fields) {
  const missing = fields.filter(
    (field) =>
      body[field] === undefined || body[field] === null || body[field] === "",
  );
  if (missing.length) {
    const error = new Error(`Missing required field(s): ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }
}

class VehicleController {
  constructor(fabricService) {
    this.fabricService = fabricService;
  }
  register = async (req, res) => {
    requiredBody(req.body, [
      "vehicleId",
      "manufacturer",
      "model",
      "year",
      "vin",
    ]);
    const { vehicleId, manufacturer, model, year, vin } = req.body;
    const data = await this.fabricService
      .vehicle(req.fabricIdentity)
      .register(vehicleId, manufacturer, model, String(year), vin);
    res.status(201).json({ success: true, data });
  };
  get = async (req, res) => {
    const data = await this.fabricService
      .vehicle(req.fabricIdentity)
      .get(req.params.vehicleId);
    res.json({ success: true, data });
  };
  inspect = async (req, res) => {
    requiredBody(req.body, ["result"]);
    const data = await this.fabricService
      .vehicle(req.fabricIdentity)
      .inspect(req.params.vehicleId, req.body.result);
    res.json({ success: true, data });
  };
  verify = async (req, res) => {
    const data = await this.fabricService
      .vehicle(req.fabricIdentity)
      .verify(req.params.vehicleId);
    res.json({ success: true, data });
  };
  transfer = async (req, res) => {
    const data = await this.fabricService
      .vehicle(req.fabricIdentity)
      .transfer(req.params.vehicleId, req.body.newOwnerMSP || "Org2MSP");
    res.json({ success: true, data });
  };
  history = async (req, res) => {
    const data = await this.fabricService
      .vehicle(req.fabricIdentity)
      .history(req.params.vehicleId);
    res.json({ success: true, data });
  };
}
module.exports = { VehicleController };
