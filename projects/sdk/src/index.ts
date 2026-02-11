import type { AlgorandClient } from "@algorandfoundation/algokit-utils"
import algosdk from "algosdk"
import { ALGO_FUNDING_LSIG_TEAL } from "./teal"
import { hexToBytes } from "./utils"

export { hexToBytes, parseEvmSignature } from "./utils"

export class LiquidEvmSdk {
  private algorand: AlgorandClient
  private compiledCache = new Map<string, Uint8Array>()

  constructor({ algorand }: { algorand: AlgorandClient }) {
    this.algorand = algorand
  }

  private async getCompiled(evmAddress: string): Promise<Uint8Array> {
    if (!this.compiledCache.has(evmAddress)) {
      const result = await this.algorand.app.compileTealTemplate(ALGO_FUNDING_LSIG_TEAL, {
        TMPL_OWNER: hexToBytes(evmAddress),
      })
      this.compiledCache.set(evmAddress, result.compiledBase64ToBytes)
    }
    return this.compiledCache.get(evmAddress)!
  }

  /** Get Algorand address for a given EVM address (40-char hex, no 0x) */
  async getAddress({ evmAddress }: { evmAddress: string }): Promise<string> {
    const compiled = await this.getCompiled(evmAddress)
    const lsig = new algosdk.LogicSigAccount(compiled, [])
    return lsig.address().toString()
  }

  /** Get compiled program bytes + Algorand address for creating LogicSigAccount */
  async getSigner({ evmAddress }: { evmAddress: string }): Promise<{ compiled: Uint8Array; addr: string }> {
    const compiled = await this.getCompiled(evmAddress)
    const lsig = new algosdk.LogicSigAccount(compiled, [])
    return { compiled, addr: lsig.address().toString() }
  }
}
