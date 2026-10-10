"use strict";

function errorMiddleware(error, req, res, next) {
  const details = Array.isArray(error.details) ? error.details : [];

  const messages = [
    error.message,
    ...details.map((detail) => detail.message),
  ].filter(Boolean);

  const chaincodeMessage = messages
    .map((message) =>
      message.replace(/^chaincode response \d+,\s*/, ""),
    )
    .find((message) =>
      /^(Only .+ can |Only .+ and .+ can |Only .+ can read)/i.test(message),
    );

  const isAuthorizationError = Boolean(chaincodeMessage);

  const status = isAuthorizationError
    ? 403
    : Number(error.statusCode || error.status || 500);

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    success: false,
    error: chaincodeMessage || error.message || "Internal server error",
    path: req.originalUrl,
  });
}

module.exports = { errorMiddleware };
