"use strict";

const express = require("express");
const { asyncHandler } = require("../middleware/async-handler");

function createIdentityRoutes(controller) {
  const router = express.Router();

  router.post("/register", asyncHandler(controller.register));
  router.post("/enroll", asyncHandler(controller.enroll));
  router.get("/", asyncHandler(controller.list));

  return router;
}

module.exports = { createIdentityRoutes };
