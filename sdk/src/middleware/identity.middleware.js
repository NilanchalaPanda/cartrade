'use strict';

function identityMiddleware(req, res, next) {
    req.fabricIdentity = req.header('X-Fabric-Identity') || process.env.DEFAULT_FABRIC_IDENTITY || 'dealer';
    next();
}

module.exports = { identityMiddleware };
