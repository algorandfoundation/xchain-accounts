export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

/**
 * secp256k1 curve order and half order for lower-S normalization
 */
const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141")
const SECP256K1_HALF_N = SECP256K1_N / 2n

/**
 * Normalize an ECDSA signature to lower-S form to prevent signature malleability.
 * If s > n/2, convert to n - s. This is a standard security practice.
 *
 * @param sigBytes - 65-byte signature (R || S || V)
 * @returns normalized signature with s in lower half
 */
function normalizeLowerS(sigBytes: Uint8Array): Uint8Array {
  if (sigBytes.length !== 65) {
    throw new Error("Invalid signature length")
  }

  // Extract s (bytes 32-63)
  const sBytes = sigBytes.slice(32, 64)
  let s = 0n
  for (let i = 0; i < 32; i++) {
    s = (s << 8n) | BigInt(sBytes[i])
  }

  // If s is in upper half, normalize to lower half
  if (s > SECP256K1_HALF_N) {
    s = SECP256K1_N - s

    // Convert back to bytes
    const normalized = new Uint8Array(65)
    normalized.set(sigBytes.slice(0, 32), 0) // Copy r

    // Write normalized s
    for (let i = 31; i >= 0; i--) {
      normalized[32 + i] = Number(s & 0xffn)
      s >>= 8n
    }

    // Flip v (27 <-> 28)
    const v = sigBytes[64]
    normalized[64] = v === 27 ? 28 : 27

    return normalized
  }

  return sigBytes
}

/**
 * Parse 0x-prefixed 65-byte EVM signature hex into R(32) || S(32) || V(1).
 * Automatically normalizes to lower-S form to prevent signature malleability.
 */
export function parseEvmSignature(sigHex: string): Uint8Array {
  const hex = sigHex.startsWith("0x") ? sigHex.slice(2) : sigHex
  const result = new Uint8Array(65)
  for (let i = 0; i < 65; i++) {
    result[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return normalizeLowerS(result)
}

/**
 * EIP-712 Domain for Liquid Accounts
 * chainId 4160 is the Algorand constant used across all networks (mainnet/testnet/localnet)
 */
export const ALGORAND_CHAIN_ID = 4160
export const ALGORAND_CHAIN_ID_HEX = "0x" + ALGORAND_CHAIN_ID.toString(16)

/**
 * EVM chain configuration for Algorand (Liquid Accounts).
 * Use with `wallet_addEthereumChain` to register the Algorand chain in EVM wallets.
 */
export const ALGORAND_EVM_CHAIN_CONFIG = {
  chainId: ALGORAND_CHAIN_ID_HEX,
  chainName: "Algorand (Liquid Accounts)",
  nativeCurrency: {
    name: "ALGO",
    symbol: "ALGO",
    decimals: 18, // MetaMask requires 18 (even though ALGO is 6)
  },
  rpcUrls: ["https://rpc-server.tasos-bitsios.workers.dev"],
  blockExplorerUrls: ["https://allo.info", "https://explorer.perawallet.app/", "https://lora.algokit.io"],
}

export const EIP712_DOMAIN = {
  name: "Liquid Accounts",
  version: "1",
  chainId: ALGORAND_CHAIN_ID,
}

/**
 * EIP-712 Types for Algorand transaction signing
 */
export const EIP712_TYPES = {
  AlgorandTransaction: [{ name: "Transaction ID", type: "bytes32" }],
}

/**
 * Format a transaction payload (transaction ID or group ID) as EIP-712 typed data message.
 * Helper function for use with wallet signing callbacks.
 *
 * @param payload - The 32-byte transaction ID or group ID
 * @returns EIP-712 message object
 */
export function formatEIP712Message(payload: Uint8Array): { "Transaction ID": string } {
  return { "Transaction ID": "0x" + Buffer.from(payload).toString("hex") }
}

/**
 * Parameters passed to signMessage callbacks containing all EIP-712 typed data
 * needed to sign with any EVM wallet.
 */
export interface SignTypedDataParams {
  domain: typeof EIP712_DOMAIN
  types: {
    EIP712Domain: Array<{ name: string; type: string }>
    AlgorandTransaction: Array<{ name: string; type: string }>
  }
  primaryType: "AlgorandTransaction"
  message: { "Transaction ID": string }
}

/**
 * Build a complete EIP-712 typed data object from a raw transaction/group ID payload.
 * Used internally by the SDK to construct the signMessage callback parameter.
 *
 * @param payload - The 32-byte transaction ID or group ID
 * @returns EIP-712 typed data ready for signing
 */
export function buildTypedData(payload: Uint8Array): SignTypedDataParams {
  return {
    domain: EIP712_DOMAIN,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
      ],
      ...EIP712_TYPES,
    },
    primaryType: "AlgorandTransaction",
    message: formatEIP712Message(payload),
  }
}
