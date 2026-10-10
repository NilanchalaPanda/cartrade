"use strict";

const express = require("express");
const { asyncHandler } = require("../middleware/async-handler");

function createDealRoutes(controller) {
  const router = express.Router();

  router.post("/", asyncHandler(controller.create));
  router.get("/:vehicleId", asyncHandler(controller.get));

  return router;
}

module.exports = { createDealRoutes };
