'use strict';

const { Contract } = require('fabric-contract-api');
const DEALER_MSP = 'Org1MSP';

class ERC20Contract extends Contract {
    async Initialize(ctx, name, symbol) {
        this._requireOrg(ctx, DEALER_MSP, 'Only Org1 can initialize the token');
        this._requireNonEmpty(name, 'name');
        this._requireNonEmpty(symbol, 'symbol');

        const existing = await ctx.stub.getState('TOKEN_INFO');
        if (existing.length > 0) throw new Error('Token is already initialized');

        const token = { name, symbol, totalSupply: 0 };
        await ctx.stub.putState('TOKEN_INFO', Buffer.from(JSON.stringify(token)));
        return JSON.stringify(token);
    }

    async Mint(ctx, account, amount) {
        this._requireOrg(ctx, DEALER_MSP, 'Only Org1 can mint tokens');
        const value = this._parseAmount(amount);
        const token = await this._getToken(ctx);
        const balance = await this._getBalance(ctx, account);

        await this._putBalance(ctx, account, balance + value);
        token.totalSupply += value;
        await this._putToken(ctx, token);
        return String(balance + value);
    }

    async BalanceOf(ctx, account) {
        this._requireNonEmpty(account, 'account');
        return String(await this._getBalance(ctx, account));
    }

    async Transfer(ctx, from, to, amount) {
        const value = this._parseAmount(amount);
        this._requireOrgMatch(ctx, from, 'Caller must match the sender account');
        await this._getToken(ctx);

        const fromBalance = await this._getBalance(ctx, from);
        if (fromBalance < value) throw new Error('Insufficient balance');
        const toBalance = await this._getBalance(ctx, to);

        await this._putBalance(ctx, from, fromBalance - value);
        await this._putBalance(ctx, to, toBalance + value);
        return 'Transfer successful';
    }

    async Approve(ctx, owner, spender, amount) {
        const value = this._parseAmount(amount);
        this._requireOrgMatch(ctx, owner, 'Caller must match the owner account');
        await this._getToken(ctx);
        await ctx.stub.putState(this._allowanceKey(owner, spender), Buffer.from(String(value)));
        return String(value);
    }

    async Allowance(ctx, owner, spender) {
        const data = await ctx.stub.getState(this._allowanceKey(owner, spender));
        return data.length === 0 ? '0' : data.toString();
    }

    async TransferFrom(ctx, spender, from, to, amount) {
        const value = this._parseAmount(amount);
        this._requireOrgMatch(ctx, spender, 'Caller must match the spender account');
        await this._getToken(ctx);

        const allowance = Number(await this.Allowance(ctx, from, spender));
        if (allowance < value) throw new Error('Allowance is too low');
        const fromBalance = await this._getBalance(ctx, from);
        if (fromBalance < value) throw new Error('Insufficient balance');
        const toBalance = await this._getBalance(ctx, to);

        await this._putBalance(ctx, from, fromBalance - value);
        await this._putBalance(ctx, to, toBalance + value);
        await ctx.stub.putState(this._allowanceKey(from, spender), Buffer.from(String(allowance - value)));
        return 'TransferFrom successful';
    }

    async Burn(ctx, account, amount) {
        const value = this._parseAmount(amount);
        this._requireOrgMatch(ctx, account, 'Caller must match the account');
        const token = await this._getToken(ctx);
        const balance = await this._getBalance(ctx, account);
        if (balance < value) throw new Error('Insufficient balance');

        await this._putBalance(ctx, account, balance - value);
        token.totalSupply -= value;
        await this._putToken(ctx, token);
        return String(balance - value);
    }

    async TotalSupply(ctx) {
        const token = await this._getToken(ctx);
        return String(token.totalSupply);
    }

    async _getToken(ctx) {
        const data = await ctx.stub.getState('TOKEN_INFO');
        if (data.length === 0) throw new Error('Token is not initialized');
        return JSON.parse(data.toString());
    }

    async _putToken(ctx, token) {
        await ctx.stub.putState('TOKEN_INFO', Buffer.from(JSON.stringify(token)));
    }

    async _getBalance(ctx, account) {
        this._requireNonEmpty(account, 'account');
        const data = await ctx.stub.getState(`BALANCE_${account}`);
        return data.length === 0 ? 0 : Number(data.toString());
    }

    async _putBalance(ctx, account, amount) {
        await ctx.stub.putState(`BALANCE_${account}`, Buffer.from(String(amount)));
    }

    _allowanceKey(owner, spender) { return `ALLOWANCE_${owner}_${spender}`; }

    _parseAmount(value) {
        const amount = Number(value);
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer');
        return amount;
    }

    _requireOrg(ctx, expectedMsp, message) {
        if (ctx.clientIdentity.getMSPID() !== expectedMsp) throw new Error(message);
    }

    _requireOrgMatch(ctx, account, message) {
        if (ctx.clientIdentity.getMSPID() !== account) throw new Error(message);
    }

    _requireNonEmpty(value, field) {
        if (!String(value || '').trim()) throw new Error(`${field} is required`);
    }
}

module.exports = ERC20Contract;
