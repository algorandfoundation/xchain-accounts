import { AlgorandClient, Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import algosdk from 'algosdk'
import { ethers } from 'ethers'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'

// @ts-ignore
const __dirname = dirname(fileURLToPath(import.meta.url))
const tealProgram = readFileSync(join(__dirname, '../artifacts/liquidevm/AlgolandFundingLsig.teal'), 'utf8')

// Fixed EVM test wallet (DO NOT use in production)
const EVM_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const evmWallet = new ethers.Wallet(EVM_PRIVATE_KEY)
const CORRECT_ETH_ACCOUNT = evmWallet.address.slice(2).toLowerCase() // 20-byte hex (no 0x)
const WRONG_ETH_ACCOUNT = '0000000000000000000000000000000000000000'

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

/** Parse ethers signature hex into R || S || V (65 bytes) for the logic sig arg */
function parseEvmSignature(sigHex: string): Uint8Array {
  const sig = ethers.Signature.from(sigHex)
  const r = hexToBytes(sig.r.slice(2))
  const s = hexToBytes(sig.s.slice(2))
  const v = new Uint8Array([sig.v])
  const result = new Uint8Array(65)
  result.set(r, 0)
  result.set(s, 32)
  result.set(v, 64)
  return result
}

/** Cache compiled programs by eth account */
const compiledCache = new Map<string, Uint8Array>()

async function getCompiledProgram(ethAccount: string, algorand: AlgorandClient): Promise<Uint8Array> {
  if (!compiledCache.has(ethAccount)) {
    const result = await algorand.app.compileTealTemplate(tealProgram, {
      TMPL_OWNER: hexToBytes(ethAccount),
    })
    compiledCache.set(ethAccount, result.compiledBase64ToBytes)
  }
  return compiledCache.get(ethAccount)!
}

describe('LogicSig EVM signature validation', () => {
  const localnet = algorandFixture()
  beforeAll(() => {
    Config.configure({ debug: true })
    registerDebugEventHandlers()
  })
  beforeEach(localnet.newScope)

  describe('standalone transaction (TxID)', () => {
    test('approves when signature matches the templated EVM account', async () => {
      const { algorand } = localnet
      const compiled = await getCompiledProgram(CORRECT_ETH_ACCOUNT, algorand)

      // Create lsig without args to get the address and fund it
      const lsigForAddr = algorand.account.logicsig(compiled, [])
      await algorand.account.ensureFundedFromEnvironment(lsigForAddr, (1).algos())

      // Build the transaction to get its ID
      const txn = await algorand.createTransaction.payment({
        sender: lsigForAddr.addr,
        receiver: lsigForAddr.addr,
        amount: (0).algos(),
        validityWindow: 100,
      })

      // Sign the raw 32-byte txn ID with the EVM wallet (personal_sign)
      const evmSig = await evmWallet.signMessage(txn.rawTxID())
      const sigBytes = parseEvmSignature(evmSig)

      // Create lsig with the signature as arg0 and sign the transaction
      const lsig = new algosdk.LogicSigAccount(compiled, [sigBytes])
      const signed = algosdk.signLogicSigTransactionObject(txn, lsig)

      await algorand.client.algod.sendRawTransaction(signed.blob).do()
    })

    test('rejects when templated EVM account does not match signer', async () => {
      const { algorand } = localnet
      const compiled = await getCompiledProgram(WRONG_ETH_ACCOUNT, algorand)

      const lsigForAddr = algorand.account.logicsig(compiled, [])
      await algorand.account.ensureFundedFromEnvironment(lsigForAddr, (1).algos())

      const txn = await algorand.createTransaction.payment({
        sender: lsigForAddr.addr,
        receiver: lsigForAddr.addr,
        amount: (0).algos(),
        validityWindow: 100,
      })

      // Sign with the correct EVM key, but the lsig is templated with the wrong account
      const evmSig = await evmWallet.signMessage(txn.rawTxID())
      const sigBytes = parseEvmSignature(evmSig)

      const lsig = new algosdk.LogicSigAccount(compiled, [sigBytes])
      const signed = algosdk.signLogicSigTransactionObject(txn, lsig)

      await expect(algorand.client.algod.sendRawTransaction(signed.blob).do()).rejects.toThrow()
    })
  })

  describe('grouped transactions (Group ID)', () => {
    test('approves when signature matches the templated EVM account', async () => {
      const { algorand, testAccount } = localnet.context
      const compiled = await getCompiledProgram(CORRECT_ETH_ACCOUNT, algorand)

      const lsigForAddr = algorand.account.logicsig(compiled, [])
      await algorand.account.ensureFundedFromEnvironment(lsigForAddr, (1).algos())

      // Build two individual transactions
      const txn1 = await algorand.createTransaction.payment({
        sender: lsigForAddr.addr,
        receiver: lsigForAddr.addr,
        amount: (0).algos(),
        validityWindow: 100,
      })
      const txn2 = await algorand.createTransaction.payment({
        sender: testAccount.addr,
        receiver: testAccount.addr,
        amount: (0).algos(),
        validityWindow: 100,
      })

      // Compute group ID and assign it to the transactions
      const groupId = algosdk.computeGroupID([txn1, txn2])
      const [gtxn1, gtxn2] = algosdk.assignGroupID([txn1, txn2])

      // Sign the raw 32-byte group ID with the EVM wallet
      const evmSig = await evmWallet.signMessage(groupId)
      const sigBytes = parseEvmSignature(evmSig)

      // Sign lsig transaction with the EVM signature
      const lsig = new algosdk.LogicSigAccount(compiled, [sigBytes])
      const signedLsigTxn = algosdk.signLogicSigTransactionObject(gtxn1, lsig)

      // Sign the second transaction with the test account
      const signedTestTxn = gtxn2.signTxn(testAccount.sk)

      await algorand.client.algod.sendRawTransaction([signedLsigTxn.blob, signedTestTxn]).do()
    })

    test('rejects when templated EVM account does not match signer', async () => {
      const { algorand, testAccount } = localnet.context
      const compiled = await getCompiledProgram(WRONG_ETH_ACCOUNT, algorand)

      const lsigForAddr = algorand.account.logicsig(compiled, [])
      await algorand.account.ensureFundedFromEnvironment(lsigForAddr, (1).algos())

      const txn1 = await algorand.createTransaction.payment({
        sender: lsigForAddr.addr,
        receiver: lsigForAddr.addr,
        amount: (0).algos(),
        validityWindow: 100,
      })
      const txn2 = await algorand.createTransaction.payment({
        sender: testAccount.addr,
        receiver: testAccount.addr,
        amount: (0).algos(),
        validityWindow: 100,
      })

      const groupId = algosdk.computeGroupID([txn1, txn2])
      const [gtxn1, gtxn2] = algosdk.assignGroupID([txn1, txn2])

      const evmSig = await evmWallet.signMessage(groupId)
      const sigBytes = parseEvmSignature(evmSig)

      const lsig = new algosdk.LogicSigAccount(compiled, [sigBytes])
      const signedLsigTxn = algosdk.signLogicSigTransactionObject(gtxn1, lsig)
      const signedTestTxn = gtxn2.signTxn(testAccount.sk)

      await expect(
        algorand.client.algod.sendRawTransaction([signedLsigTxn.blob, signedTestTxn]).do(),
      ).rejects.toThrow()
    })
  })
})
