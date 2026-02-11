import { Bytes, Global, LogicSig, op, TemplateVar, Txn, uint64 } from '@algorandfoundation/algorand-typescript'
import { StaticBytes } from '@algorandfoundation/algorand-typescript/arc4'

const owner = TemplateVar<StaticBytes<20>>('OWNER')
const ZeroBytes32 = Bytes.fromHex('0000000000000000000000000000000000000000000000000000000000000000')

export class AlgolandFundingLsig extends LogicSig {
  public program() {
    // payload to sign is the 32 byte raw group ID (if one exists) otherwise the transaction ID of the current transaction
    const txnIdPayload = Global.groupId === ZeroBytes32 ? Txn.txId : Global.groupId

    // Get concatenated signature from arg0: R (32) || S (32) || V (1)
    const sig = op.arg(0)
    const r = op.extract(sig, 0, 32)
    const s = op.extract(sig, 32, 32)
    const v = op.btoi(op.extract(sig, 64, 1))
    const recoveryId: uint64 = v - 27

    // Ethereum personal_sign: keccak256("\x19Ethereum Signed Message:\n" + len(32) + (group or txn) id)
    const digest = op.keccak256(Bytes('\x19Ethereum Signed Message:\n32').concat(txnIdPayload))

    // Recover the signer's public key from the signature
    const [pubkeyX, pubkeyY] = op.ecdsaPkRecover(op.Ecdsa.Secp256k1, digest, recoveryId, r, s)

    // Derive Ethereum address: last 20 bytes of keccak256(X || Y)
    const recoveredAddress = op.extract(op.keccak256(op.concat(pubkeyX, pubkeyY)), 12, 20)

    return recoveredAddress === owner.bytes
  }
}
