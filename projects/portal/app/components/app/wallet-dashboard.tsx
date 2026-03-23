import { useMemo, useState, useCallback } from 'react'
import { useWallet, useNetwork } from '@txnlab/use-wallet-react'
import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useAccountInfo, useBridgeDialog } from '@txnlab/use-wallet-ui-react'
import { getOpenInEntries } from '@d13co/open-in'
import {
  ManagePanel,
  useSendPanel,
  useReceivePanel,
  useAssetRegistry,
  useAssets,
  type WalletAdapter,
  type AssetHoldingDisplay,
} from '@d13co/algo-x-evm-ui'
import { SwapPanel } from './swap-panel'
import { useSwapPanel } from './use-swap-panel'

export function WalletDashboard() {
  const { activeAddress, activeWallet, algodClient, signTransactions } = useWallet()
  const { activeNetwork } = useNetwork()
  const queryClient = useQueryClient()
  const isFetching = useIsFetching()
  const { bridge, openBridge } = useBridgeDialog()

  const [viewMode, setViewMode] = useState<'manage' | 'swap'>('manage')

  const [showAvailable, setShowAvailable] = useState(() => {
    try {
      return localStorage.getItem('portal:balance-pref') === 'available'
    } catch {
      return false
    }
  })

  const { data: accountInfo } = useAccountInfo({ enabled: !!activeAddress })

  const totalBalance = useMemo(() => {
    if (!accountInfo || accountInfo.amount === undefined) return null
    return Number(accountInfo.amount) / 1_000_000
  }, [accountInfo])

  const availableBalance = useMemo(() => {
    if (!accountInfo || accountInfo.amount === undefined || accountInfo.minBalance === undefined) return null
    return Math.max(0, (Number(accountInfo.amount) - Number(accountInfo.minBalance)) / 1_000_000)
  }, [accountInfo])

  const displayBalance = showAvailable ? availableBalance : totalBalance

  const allHoldings = useMemo(() => accountInfo?.assets ?? [], [accountInfo])
  const assetIds = useMemo(() => allHoldings.map((a) => String(a.assetId)), [allHoldings])
  const optedInAssetIds = useMemo(() => new Set(allHoldings.map((a) => Number(a.assetId))), [allHoldings])

  const registry = useAssetRegistry(algodClient, activeNetwork)

  const onTransactionSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['account-info'] })
  }, [queryClient])

  const wallet: WalletAdapter = useMemo(
    () => ({
      activeAddress: activeAddress ?? null,
      algodClient: algodClient ?? null,
      signTransactions,
      onTransactionSuccess,
    }),
    [activeAddress, algodClient, signTransactions, onTransactionSuccess],
  )

  const send = useSendPanel(wallet)
  const optIn = useReceivePanel(wallet, optedInAssetIds, registry)

  const { assets: assetInfoMap } = useAssets(assetIds, algodClient as any, activeNetwork)

  const assetHoldings = useMemo((): AssetHoldingDisplay[] => {
    return allHoldings
      .map((holding) => {
        const info = assetInfoMap[String(holding.assetId)]
        if (!info) return null
        const raw = BigInt(holding.amount)
        let amount: string
        if (info.decimals === 0) {
          amount = raw.toString()
        } else {
          const divisor = 10n ** BigInt(info.decimals)
          const whole = raw / divisor
          const remainder = raw % divisor
          if (remainder === 0n) {
            amount = whole.toString()
          } else {
            const frac = remainder.toString().padStart(info.decimals, '0').replace(/0+$/, '')
            amount = `${whole}.${frac}`
          }
        }
        return {
          assetId: Number(holding.assetId),
          name: info.name || `ASA#${holding.assetId}`,
          unitName: info.unitName,
          amount,
          decimals: info.decimals,
        }
      })
      .filter((a): a is AssetHoldingDisplay => a !== null)
  }, [allHoldings, assetInfoMap])

  const evmAddress = useMemo(
    () => (activeWallet?.activeAccount?.metadata?.evmAddress as string) ?? null,
    [activeWallet],
  )

  // Swap panel hook
  const swap = useSwapPanel(wallet, assetHoldings.length > 0 ? assetHoldings : undefined, availableBalance, activeNetwork)

  // Transaction explorer URL helper
  const getTxExplorerUrl = useCallback(
    (txId: string | null) => {
      if (!txId || !activeNetwork) return null
      const entries = getOpenInEntries(activeNetwork as any, 'transaction')
      const first = entries[0]
      if (!first) return null
      return first.getUrl(activeNetwork as any, 'transaction', txId)
    },
    [activeNetwork],
  )

  // Explore account in block explorer
  const handleExplore = useMemo(() => {
    if (!activeAddress || !activeNetwork) return undefined
    const entries = getOpenInEntries(activeNetwork as any, 'account')
    const first = entries[0]
    if (!first) return undefined
    const url = first.getUrl(activeNetwork as any, 'account', activeAddress)
    if (!url) return undefined
    return () => window.open(url, '_blank', 'noopener,noreferrer')
  }, [activeAddress, activeNetwork])

  const toggleBalance = useCallback(() => {
    setShowAvailable((v) => {
      const next = !v
      try { localStorage.setItem('portal:balance-pref', next ? 'available' : 'total') } catch {}
      return next
    })
  }, [])

  if (!activeAddress) return null

  return (
    <div data-wallet-theme className="max-w-md mx-auto">
      {viewMode === 'swap' ? (
        <SwapPanel
          {...swap}
          accountAssets={assetHoldings.length > 0 ? assetHoldings : undefined}
          availableBalance={availableBalance}
          onBack={() => {
            swap.reset()
            setViewMode('manage')
          }}
        />
      ) : (
        <>
          <ManagePanel
            displayBalance={displayBalance}
            showAvailableBalance={showAvailable}
            onToggleBalance={toggleBalance}
            onBack={() => {}}
            send={{ ...send, explorerUrl: getTxExplorerUrl(send.txId) }}
            optIn={{ ...optIn, evmAddress, explorerUrl: getTxExplorerUrl(optIn.txId) }}
            onBridgeClick={bridge.isAvailable ? openBridge : undefined}
            assets={assetHoldings.length > 0 ? assetHoldings : undefined}
            totalBalance={totalBalance}
            availableBalance={availableBalance}
            onRefresh={() => queryClient.invalidateQueries()}
            isRefreshing={isFetching > 0}
            onExplore={handleExplore}
          />
          {/* Swap action button below ManagePanel */}
          <div className="mt-2">
            <button
              onClick={() => setViewMode('swap')}
              className="w-full py-2.5 px-4 bg-[var(--wui-color-bg-tertiary)] text-[var(--wui-color-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm flex items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m16 3 4 4-4 4" />
                <path d="M20 7H4" />
                <path d="m8 21-4-4 4-4" />
                <path d="M4 17h16" />
              </svg>
              Swap
            </button>
          </div>
        </>
      )}
    </div>
  )
}
