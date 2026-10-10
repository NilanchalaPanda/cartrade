"use strict";

const express = require("express");
const { asyncHandler } = require("../middleware/async-handler");

function createVehicleRoutes(controller) {
  const router = express.Router();

  router.post("/register", asyncHandler(controller.register));
  router.get("/:vehicleId", asyncHandler(controller.get));
  router.post("/:vehicleId/inspect", asyncHandler(controller.inspect));
  router.post("/:vehicleId/verify", asyncHandler(controller.verify));
  router.post("/:vehicleId/transfer", asyncHandler(controller.transfer));
  router.get("/:vehicleId/history", asyncHandler(controller.history));

  return router;
}

module.exports = { createVehicleRoutes };
