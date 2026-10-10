'use strict';
function bodyFields(body, fields) { const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === ''); if (missing.length) { const e = new Error(`Missing required field(s): ${missing.join(', ')}`); e.statusCode = 400; throw e; } }
class TokenController {
    constructor(fabricService) { this.fabricService = fabricService; }
    initialize = async (req, res) => { const { name = 'AutoCoin', symbol = 'AUTO' } = req.body; const data = await this.fabricService.token(req.fabricIdentity).initialize(name, symbol); res.status(201).json({ success: true, data }); };
    mint = async (req, res) => { bodyFields(req.body, ['account', 'amount']); const data = await this.fabricService.token(req.fabricIdentity).mint(req.body.account, String(req.body.amount)); res.json({ success: true, data }); };
    balance = async (req, res) => { const data = await this.fabricService.token(req.fabricIdentity).balance(req.params.account); res.json({ success: true, data }); };
    transfer = async (req, res) => { bodyFields(req.body, ['from', 'to', 'amount']); const data = await this.fabricService.token(req.fabricIdentity).transfer(req.body.from, req.body.to, String(req.body.amount)); res.json({ success: true, data }); };
    approve = async (req, res) => { bodyFields(req.body, ['owner', 'spender', 'amount']); const data = await this.fabricService.token(req.fabricIdentity).approve(req.body.owner, req.body.spender, String(req.body.amount)); res.json({ success: true, data }); };
    allowance = async (req, res) => { const data = await this.fabricService.token(req.fabricIdentity).allowance(req.params.owner, req.params.spender); res.json({ success: true, data }); };
    transferFrom = async (req, res) => { bodyFields(req.body, ['spender', 'from', 'to', 'amount']); const data = await this.fabricService.token(req.fabricIdentity).transferFrom(req.body.spender, req.body.from, req.body.to, String(req.body.amount)); res.json({ success: true, data }); };
    burn = async (req, res) => { bodyFields(req.body, ['account', 'amount']); const data = await this.fabricService.token(req.fabricIdentity).burn(req.body.account, String(req.body.amount)); res.json({ success: true, data }); };
    totalSupply = async (req, res) => { const data = await this.fabricService.token(req.fabricIdentity).totalSupply(); res.json({ success: true, data }); };
}
module.exports = { TokenController };
