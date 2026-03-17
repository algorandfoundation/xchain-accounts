---
title: What is Algorand x EVM?
description: An overview of how Algorand x EVM lets you use your Ethereum wallet on Algorand.
order: 1
category: Overview
---

# What is Algorand x EVM?

Algorand x EVM lets you use your existing Ethereum wallet to control an Algorand account. No new wallet, no new seed phrase, no new app to install.

Algorand x EVM **derives an Algorand address from your EVM address** and uses an on-chain Smart Account to verify your EVM signatures.

- **One wallet** - your EVM wallet works on both Ethereum and Algorand
- **One identity** - your EVM address maps to exactly one Algorand address
- **Full self-custody** - only your wallet signature can authorize Algorand x EVM transactions

## How It Works (High Level)

1. Your EVM address (20 bytes) is used to deterministically generate an Algorand [Smart Signature Account](https://dev.algorand.co/concepts/accounts/overview/#smart-signature-accounts-contract-accounts)
2. When you want to transact on Algorand, the app builds the transaction and asks your wallet to sign an [EIP-712 typed data](https://eips.ethereum.org/EIPS/eip-712) message
3. The signature is attached to the Smart Account, which verifies the ECDSA signature on-chain using Algorand's [`ecdsa_pk_recover`](https://dev.algorand.co/reference/algorand-teal/opcodes/#ecdsa_pk_recover) opcode
4. If valid, the transaction executes on Algorand

Your private key **never leaves your wallet**. The Smart Account only checks that the signature matches the expected EVM address - it cannot move funds on its own.

## What Can You Do?

- Send and receive ALGO
- Opt into and transfer Algorand Standard Assets (ASAs)
- Bridge assets between EVM chains and Algorand
- Interact with Algorand dApps (public beta coming soon)
