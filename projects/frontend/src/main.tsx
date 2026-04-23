// buffer and tron stubs required for bridge SDK
import { Buffer } from "buffer";
(globalThis as unknown as Record<string, unknown>).Buffer = Buffer;
// TODO figure this out
// Stub TronWeb globals required by Allbridge SDK's bundled tronweb dependency
if (!(globalThis as any).TronWebProto) {
  (globalThis as any).TronWebProto = { Transaction: {} };
}

import { StrictMode, useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { LogLevel, WalletProvider, useWallet } from "@txnlab/use-wallet-react";
import { WalletUIProvider, type Theme, type UseSwapOptions } from "@txnlab/use-wallet-ui-react";
import "@txnlab/use-wallet-ui-react/dist/style.css";
import { WalletManager, WalletId } from "@txnlab/use-wallet-react";
import { getDefaultConfig } from "@txnlab/use-wallet-ui-react/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { algorandChain } from "algo-x-evm-sdk";
import { http } from "viem";
import { RouterClient } from "@txnlab/haystack-router";
import algosdk from "algosdk";
import "./index.css";
import App from "./App.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";

const haystackRouter = new RouterClient({
  apiKey: "bd650cf4-3d73-4e3f-ad37-1ada754bd659",
  autoOptIn: true,
});

type AlgorandNetwork = "localnet" | "testnet" | "mainnet";

const wagmiConfig = getDefaultConfig({
  appName: "Algo x EVM Demo",
  projectId: "3404862cca4501e4d84be405269d955c",
  chains: [algorandChain],
  // use-wallet-ui's getDefaultConfig only wires transports for its built-in
  // bridge chains, so any extra chain we pass in (here, algorandChain) must
  // supply its own transport — otherwise wagmi's extractRpcUrls blows up
  // inside the MetaMask connector's initProvider. http() with no args falls
  // back to chain.rpcUrls.default.http[0].
  transports: {
    [algorandChain.id]: http(),
  },
});

function makeWalletManager(network: AlgorandNetwork) {
  return new WalletManager({
    options: {
      debug: true,
      logLevel: LogLevel.DEBUG,
      resetNetwork: true,
    },
    wallets: [
      {
        id: WalletId.RAINBOWKIT,
        options: { wagmiConfig },
      },
      WalletId.LUTE,
      ...(network === "localnet" ? [WalletId.KMD] : []),
    ],
    defaultNetwork: network,
  });
}

function getInitialNetwork(): AlgorandNetwork {
  const stored = localStorage.getItem("algorand-network");
  if (stored === "localnet" || stored === "testnet" || stored === "mainnet") return stored;
  return "mainnet";
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Thin wrapper that constructs swap options from the connected wallet's signer
// and forwards them to WalletUIProvider. Needs to live inside <WalletProvider>
// so it can call useWallet().
function WalletUIWithSwap({ theme, children }: { theme: Theme; children: ReactNode }) {
  const { signTransactions } = useWallet();

  const swapSigner = useCallback(
    async (txnGroup: algosdk.Transaction[], indexesToSign: number[]): Promise<Uint8Array[]> => {
      const signed = await signTransactions(txnGroup, indexesToSign);
      return signed.filter((s): s is Uint8Array => s != null);
    },
    [signTransactions],
  );

  const swapOptions = useMemo<UseSwapOptions>(
    () => ({
      fetchQuote: (params) => haystackRouter.newQuote(params),
      executeSwap: async ({ onSigned, quote, address, slippage }) => {
        // Wrap the signer so we can fire `onSigned` the moment the wallet returns —
        // this transitions the UI from "awaiting signature" to "sending transaction"
        // before the SDK proceeds to submit + wait for confirmation.
        const wrappedSigner = async (txnGroup: algosdk.Transaction[], indexesToSign: number[]) => {
          const result = await swapSigner(txnGroup, indexesToSign);
          onSigned?.();
          return result;
        };
        const swap = await haystackRouter.newSwap({
          quote: quote as Parameters<typeof haystackRouter.newSwap>[0]["quote"],
          address,
          slippage,
          signer: wrappedSigner,
        });
        return swap.execute();
      },
    }),
    [swapSigner],
  );

  return (
    <WalletUIProvider theme={theme} wagmiConfig={wagmiConfig} swap={swapOptions}>
      {children}
    </WalletUIProvider>
  );
}

function Root() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("app-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [network, setNetworkState] = useState<AlgorandNetwork>(getInitialNetwork);

  const walletManager = useMemo(() => makeWalletManager(network), []);

  const setNetwork = useCallback((n: AlgorandNetwork) => {
    (async () => {
      localStorage.setItem("algorand-network", n);
      setNetworkState(n);
      // important! if multiple networks are supported, the wallet manager needs to be informed of network changes so it can update its internal state and reinitialize connections as needed
      walletManager.setActiveNetwork(n);
      // dirty temp workaround for a network sync bug
      await sleep(100);
      window.location.reload();
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem("app-theme", theme);
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.color = theme === "dark" ? "#e9e9fd" : "#001324";
    document.documentElement.style.backgroundColor = theme === "dark" ? "#001324" : "#ffffff";
  }, [theme]);

  return (
    <WalletProvider manager={walletManager}>
      <WalletUIWithSwap theme={theme}>
        <App theme={theme} setTheme={setTheme} network={network} setNetwork={setNetwork} />
      </WalletUIWithSwap>
    </WalletProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </StrictMode>,
);
