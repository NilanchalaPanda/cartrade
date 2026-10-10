'use strict';
require('dotenv').config();
const { FabricService } = require('./src/services/fabric.service');
const DEFAULT_IDENTITY = process.env.FABRIC_IDENTITY || 'dealer';

async function main() {
    const [command, ...args] = process.argv.slice(2);
    const fabric = new FabricService();
    try {
        switch (command) {
            case 'vehicle:register': return print(await fabric.vehicle(DEFAULT_IDENTITY).register(...requireArgs(args, 5)));
            case 'vehicle:get': return print(await fabric.vehicle(DEFAULT_IDENTITY).get(...requireArgs(args, 1)));
            case 'vehicle:inspect': return print(await fabric.vehicle(DEFAULT_IDENTITY).inspect(...requireArgs(args, 2)));
            case 'vehicle:verify': return print(await fabric.vehicle(DEFAULT_IDENTITY).verify(...requireArgs(args, 1)));
            case 'vehicle:transfer': return print(await fabric.vehicle(DEFAULT_IDENTITY).transfer(...requireArgs(args, 2)));
            case 'vehicle:history': return print(await fabric.vehicle(DEFAULT_IDENTITY).history(...requireArgs(args, 1)));
            case 'deal:create': { const [id, original, discount] = requireArgs(args, 3); return print(await fabric.deal(DEFAULT_IDENTITY).create(id, original, discount, String(Number(original) - Number(discount)))); }
            case 'deal:get': return print(await fabric.deal(DEFAULT_IDENTITY).get(...requireArgs(args, 1)));
            case 'token:init': return print(await fabric.token(DEFAULT_IDENTITY).initialize(...requireArgs(args, 2)));
            case 'token:mint': return print(await fabric.token(DEFAULT_IDENTITY).mint(...requireArgs(args, 2)));
            case 'token:balance': return print(await fabric.token(DEFAULT_IDENTITY).balance(...requireArgs(args, 1)));
            case 'token:transfer': return print(await fabric.token(DEFAULT_IDENTITY).transfer(...requireArgs(args, 3)));
            case 'token:approve': return print(await fabric.token(DEFAULT_IDENTITY).approve(...requireArgs(args, 3)));
            case 'token:allowance': return print(await fabric.token(DEFAULT_IDENTITY).allowance(...requireArgs(args, 2)));
            case 'token:transfer-from': return print(await fabric.token(DEFAULT_IDENTITY).transferFrom(...requireArgs(args, 4)));
            case 'token:burn': return print(await fabric.token(DEFAULT_IDENTITY).burn(...requireArgs(args, 2)));
            case 'token:total': return print(await fabric.token(DEFAULT_IDENTITY).totalSupply());
            default: printHelp();
        }
    } finally { await fabric.close(); }
}
function requireArgs(args, count) { if (args.length < count) throw new Error(`Expected at least ${count} argument(s)`); return args; }
function print(value) { console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2)); }
function printHelp() { console.log(`CarTrade CLI\nSet FABRIC_IDENTITY=dealer|buyer|inspector\n\nExamples:\n  npm run cli -- vehicle:get CAR001\n  FABRIC_IDENTITY=dealer npm run cli -- vehicle:register CAR001 Tata "Nexon EV" 2025 ABC123\n  FABRIC_IDENTITY=inspector npm run cli -- vehicle:inspect CAR001 PASSED\n  FABRIC_IDENTITY=dealer npm run cli -- vehicle:verify CAR001\n  FABRIC_IDENTITY=dealer npm run cli -- vehicle:transfer CAR001 Org2MSP\n  FABRIC_IDENTITY=dealer npm run cli -- deal:create CAR001 1250000 50000\n  FABRIC_IDENTITY=dealer npm run cli -- token:init AutoCoin AUTO\n  FABRIC_IDENTITY=dealer npm run cli -- token:mint Org2MSP 1500000\n`); }
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
