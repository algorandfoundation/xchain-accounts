# frontend

React demo application for **xChain Accounts** — sign Algorand transactions with an EVM wallet (MetaMask, etc.) via [`algo-x-evm-sdk`](../evm-sdk/) and the forked [`@txnlab/use-wallet`](../use-wallet/) / [`@txnlab/use-wallet-ui`](../use-wallet-ui/) packages.

## What it shows

- Connecting an EVM wallet through RainbowKit (MetaMask, WalletConnect, etc.) and deriving the corresponding Algorand lsig address
- Signing standalone Algorand transactions and atomic groups using EIP-712 typed data
- Switching between **mainnet**, **testnet**, and **localnet** (KMD wallet is exposed only on localnet)
- Light/dark theming via `@txnlab/use-wallet-ui-react`

## Stack

- React 19 + Vite
- `@txnlab/use-wallet-react` and `@txnlab/use-wallet-ui-react` (workspace forks with xChain EVM support)
- `algo-x-evm-sdk` (workspace) for lsig compilation and signing
- `wagmi` + `@rainbow-me/rainbowkit` for the EVM connection layer

## Run

From the repo root, install once and start LocalNet if you want to test there:

```bash
pnpm install
algokit localnet start    # only needed for "localnet" mode
```

Then in this directory:

```bash
pnpm dev
```

The app is served at <http://localhost:5173>. Default network is **mainnet**; the selection persists in `localStorage` under `algorand-network`.

## Funding the lsig address

Brand-new derived Algorand addresses need at least **0.1 ALGO** to exist on the network before they can send transactions:

- **localnet** — use the KMD-funded dispenser via `algokit goal clerk send` or the in-app KMD wallet.
- **testnet** — use the [Algorand TestNet dispenser](https://bank.testnet.algorand.network/).
- **mainnet** — bridge or transfer ALGO to the displayed lsig address.

## Build

```bash
pnpm build       # tsc -b && vite build
pnpm preview     # serve the production build locally
pnpm lint
```

## Notes

- The frontend depends on workspace packages — run `algokit project run build` (or at minimum build `evm-logicsig` and `evm-sdk`) at the repo root before `pnpm dev` if any of them changed.
- See the root [README](../../README.md) and [INTEGRATION.md](../../INTEGRATION.md) for protocol-level details.
