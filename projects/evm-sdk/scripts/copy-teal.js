const fs = require("fs")
const path = require("path")

const src = path.resolve(__dirname, "../../evm-logicsig/smart_contracts/artifacts/algo-x-evm/AlgoXEvmLsig.teal")
const tealTs = path.resolve(__dirname, "../src/teal.ts")

const teal = fs.readFileSync(src, "utf8")
fs.writeFileSync(tealTs, "export const ALGO_X_EVM_LSIG_TEAL = " + JSON.stringify(teal) + ";\n")
