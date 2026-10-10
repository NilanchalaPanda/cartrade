"use strict";
require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const { IdentityService } = require("./services/identity.service");
const { FabricService } = require("./services/fabric.service");
const { IdentityController } = require("./controllers/identity.controller");
const { VehicleController } = require("./controllers/vehicle.controller");
const { DealController } = require("./controllers/deal.controller");
const { TokenController } = require("./controllers/token.controller");
const { createIdentityRoutes } = require("./routes/identity.routes");
const { createVehicleRoutes } = require("./routes/vehicle.routes");
const { createDealRoutes } = require("./routes/deal.routes");
const { createTokenRoutes } = require("./routes/token.routes");
const { identityMiddleware } = require("./middleware/identity.middleware");
const { errorMiddleware } = require("./middleware/error.middleware");

const app = express();
const fabricService = new FabricService();
const identityService = new IdentityService();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(identityMiddleware);

app.get("/health", (req, res) =>
  res.json({
    success: true,
    service: "cartrade-node-sdk",
    channel: process.env.CHANNEL_NAME || "cartrade-channel",
  }),
);
app.get("/api", (req, res) =>
  res.json({
    success: true,
    service: "CarTrade Fabric REST API",
    identityHeader: "X-Fabric-Identity",
    identities: ["dealer", "buyer", "inspector"],
    routes: {
      identity: "/api/identity",
      vehicles: "/api/vehicles",
      deals: "/api/deals",
      tokens: "/api/tokens",
    },
  }),
);

app.use(
  "/api/identity",
  createIdentityRoutes(new IdentityController(identityService)),
);
app.use(
  "/api/vehicles",
  createVehicleRoutes(new VehicleController(fabricService)),
);
app.use("/api/deals", createDealRoutes(new DealController(fabricService)));
app.use("/api/tokens", createTokenRoutes(new TokenController(fabricService)));
app.use((req, res) =>
  res
    .status(404)
    .json({ success: false, error: "Route not found", path: req.originalUrl }),
);
app.use(errorMiddleware);

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "0.0.0.0";
const server = app.listen(port, host, () =>
  console.log(`CarTrade SDK listening on http://${host}:${port}`),
);
async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => {
    await fabricService.close();
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
