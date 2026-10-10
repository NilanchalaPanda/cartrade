"use strict";

const express = require("express");
const { asyncHandler } = require("../middleware/async-handler");

function createTokenRoutes(controller) {
  const router = express.Router();

  router.post("/initialize", asyncHandler(controller.initialize));
  router.post("/mint", asyncHandler(controller.mint));
  router.get("/balance/:account", asyncHandler(controller.balance));
  router.post("/transfer", asyncHandler(controller.transfer));
  router.post("/approve", asyncHandler(controller.approve));
  router.get("/allowance/:owner/:spender", asyncHandler(controller.allowance));
  router.post("/transfer-from", asyncHandler(controller.transferFrom));
  router.post("/burn", asyncHandler(controller.burn));
  router.get("/total-supply", asyncHandler(controller.totalSupply));

  return router;
}

module.exports = { createTokenRoutes };
