import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import algosdk from 'algosdk'
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AbelGhostSDK } from 'abel-ghost-sdk'
import { AssetCache, type CachedAsset } from '@d13co/algo-x-evm-ui'
import type { TransactionStatusValue } from '@d13co/algo-x-evm-ui'
import type { AssetHoldingDisplay } from '@d13co/algo-x-evm-ui'

export interface SwapAsset {
  id: number // 0 for ALGO
  name: string
  unitName: string
  decimals: number
}

export const ALGO_ASSET: SwapAsset = {
  id: 0,
  name: 'Algorand',
  unitName: 'ALGO',
  decimals: 6,
}

interface WalletAdapter {
  activeAddress: string | null
  algodClient: any | null
  signTransactions: (txnGroup: Uint8Array[], indexesToSign?: number[]) => Promise<(Uint8Array | null)[]>
  onTransactionSuccess?: () => void
}

export interface UseSwapPanelResult {
  fromAsset: SwapAsset
  setFromAsset: (asset: SwapAsset) => void
  toAsset: SwapAsset | null
  setToAsset: (asset: SwapAsset | null) => void
  fromAmount: string
  setFromAmount: (v: string) => void
  toSearchQuery: string
  setToSearchQuery: (v: string) => void
  toSearchResults: SearchResult[]
  toSearchLoading: boolean
  toLookupLoading: boolean
  toLookupError: string | null
  flipAssets: () => void
  fromAssets: SwapAsset[]
  fromBalance: string | null
  status: TransactionStatusValue
  error: string | null
  handleSwap: () => void
  reset: () => void
  retry: () => void
}

export interface SearchResult {
  id: number
  name: string
  unitName: string
  decimals: number
  source: 'registry' | 'ghost'
}

export function useSwapPanel(
  wallet: WalletAdapter,
  accountAssets: AssetHoldingDisplay[] | undefined,
  availableBalance: number | null,
  activeNetwork: string,
): UseSwapPanelResult {
  const [fromAsset, setFromAsset] = useState<SwapAsset>(ALGO_ASSET)
  const [toAsset, setToAsset] = useState<SwapAsset | null>(null)
  const [fromAmount, setFromAmount] = useState('')
  const [toSearchQuery, setToSearchQuery] = useState('')
  const [toSearchResults, setToSearchResults] = useState<SearchResult[]>([])
  const [toSearchLoading, setToSearchLoading] = useState(false)
  const [toLookupLoading, setTolookupLoading] = useState(false)
  const [toLookupError, setToLookupError] = useState<string | null>(null)
  const [status, setStatus] = useState<TransactionStatusValue>('idle')
  const [error, setError] = useState<string | null>(null)

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>()
  const ghostSdkRef = useRef<AbelGhostSDK | null>(null)

  // Build available "from" assets: ALGO + held ASAs
  const fromAssets = useMemo((): SwapAsset[] => {
    const held: SwapAsset[] = (accountAssets ?? []).map((a) => ({
      id: a.assetId,
      name: a.name,
      unitName: a.unitName,
      decimals: a.decimals,
    }))
    return [ALGO_ASSET, ...held]
  }, [accountAssets])

  // From balance display
  const fromBalance = useMemo((): string | null => {
    if (fromAsset.id === 0) {
      if (availableBalance == null) return null
      return `${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ALGO`
    }
    const held = accountAssets?.find((a) => a.assetId === fromAsset.id)
    if (!held) return null
    return `${held.amount} ${held.unitName || held.name}`
  }, [fromAsset, availableBalance, accountAssets])

  // Lazily create ghost SDK
  const getGhostSdk = useCallback(() => {
    if (ghostSdkRef.current) return ghostSdkRef.current
    if (!wallet.algodClient) return null
    try {
      const algorand = AlgorandClient.fromClients({ algod: wallet.algodClient })
      ghostSdkRef.current = new AbelGhostSDK({ algorand })
      return ghostSdkRef.current
    } catch {
      return null
    }
  }, [wallet.algodClient])

  // Reset ghost SDK when network changes
  useEffect(() => {
    ghostSdkRef.current = null
  }, [activeNetwork])

  // Look up asset by ID: registry first, ghost SDK fallback
  const lookupAssetById = useCallback(
    async (assetId: number): Promise<SearchResult | null> => {
      // 1. Check registry
      try {
        const cached = await AssetCache.getById(assetId)
        if (cached) {
          return {
            id: cached.index,
            name: cached.name,
            unitName: cached.unitName,
            decimals: cached.decimals ?? 0,
            source: 'registry',
          }
        }
      } catch {
        // registry lookup failed, continue
      }

      // 2. Ghost SDK fallback (do NOT add to registry)
      const ghost = getGhostSdk()
      if (ghost) {
        try {
          const labels = await ghost.getAssetsTinyLabels([assetId])
          const info = labels.get(BigInt(assetId))
          if (info) {
            return {
              id: assetId,
              name: info.name,
              unitName: info.unitName,
              decimals: info.decimals,
              source: 'ghost',
            }
          }
        } catch {
          // ghost lookup failed
        }
      }

      // 3. Fallback to algod direct lookup
      if (wallet.algodClient) {
        try {
          const result = await wallet.algodClient.getAssetByID(assetId).do()
          return {
            id: assetId,
            name: result.params.name || `ASA#${assetId}`,
            unitName: result.params.unitName || '',
            decimals: result.params.decimals ?? 0,
            source: 'ghost',
          }
        } catch {
          // asset not found
        }
      }

      return null
    },
    [getGhostSdk, wallet.algodClient],
  )

  // Search assets by name: registry first, ghost SDK batch for held-but-unlabeled
  const searchAssetsByName = useCallback(
    async (query: string): Promise<SearchResult[]> => {
      const results: SearchResult[] = []
      const seenIds = new Set<number>()

      // 1. Search the local registry (AssetCache)
      try {
        const cached = await AssetCache.searchByName(query, 20)
        for (const asset of cached) {
          if (!seenIds.has(asset.index)) {
            seenIds.add(asset.index)
            results.push({
              id: asset.index,
              name: asset.name,
              unitName: asset.unitName,
              decimals: asset.decimals ?? 0,
              source: 'registry',
            })
          }
        }
      } catch {
        // registry search failed
      }

      // 2. Also check user's held assets that might match
      if (accountAssets) {
        const q = query.toLowerCase()
        for (const asset of accountAssets) {
          if (!seenIds.has(asset.assetId)) {
            if (
              asset.name.toLowerCase().includes(q) ||
              asset.unitName.toLowerCase().includes(q)
            ) {
              seenIds.add(asset.assetId)
              results.push({
                id: asset.assetId,
                name: asset.name,
                unitName: asset.unitName,
                decimals: asset.decimals,
                source: 'registry',
              })
            }
          }
        }
      }

      return results
    },
    [accountAssets],
  )

  // Handle "to" search query changes with debounce
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    const query = toSearchQuery.trim()
    if (!query) {
      setToSearchResults([])
      setToSearchLoading(false)
      setTolookupLoading(false)
      setToLookupError(null)
      return
    }

    const isNumeric = /^\d+$/.test(query)

    if (isNumeric) {
      // Asset ID lookup
      setToSearchResults([])
      setToSearchLoading(false)
      searchDebounceRef.current = setTimeout(async () => {
        setTolookupLoading(true)
        setToLookupError(null)
        try {
          const result = await lookupAssetById(Number(query))
          if (result) {
            setToSearchResults([result])
          } else {
            setToLookupError(`Asset ${query} not found`)
          }
        } catch {
          setToLookupError('Failed to look up asset')
        } finally {
          setTolookupLoading(false)
        }
      }, 300)
    } else {
      // Name search
      setTolookupLoading(false)
      setToLookupError(null)
      searchDebounceRef.current = setTimeout(async () => {
        setToSearchLoading(true)
        try {
          const results = await searchAssetsByName(query)
          setToSearchResults(results)
        } catch {
          setToSearchResults([])
        } finally {
          setToSearchLoading(false)
        }
      }, 300)
    }

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [toSearchQuery, lookupAssetById, searchAssetsByName])

  // Flip from/to assets
  const flipAssets = useCallback(() => {
    if (!toAsset) return
    const prevFrom = fromAsset
    const prevTo = toAsset
    setFromAsset(prevTo)
    setToAsset(prevFrom)
    setFromAmount('')
    setToSearchQuery('')
    setToSearchResults([])
  }, [fromAsset, toAsset])

  const handleSwap = useCallback(async () => {
    if (!wallet.activeAddress || !wallet.algodClient || !toAsset || !fromAmount) return

    const parsedAmount = parseFloat(fromAmount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    setStatus('signing')
    setError(null)

    try {
      const suggestedParams = await wallet.algodClient.getTransactionParams().do()
      const sender = wallet.activeAddress

      // Build the "from" side of the swap as a transaction group.
      // TODO: Route through a DEX (Tinyman, Folks Router, etc.) for real price discovery.
      // Currently this builds a self-transfer that demonstrates the signing flow.
      const txns: algosdk.Transaction[] = []

      if (fromAsset.id === 0) {
        const rawAmount = BigInt(Math.round(parsedAmount * 10 ** 6))
        txns.push(
          algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            sender,
            receiver: sender,
            amount: rawAmount,
            suggestedParams,
          }),
        )
      } else {
        const rawAmount = BigInt(Math.round(parsedAmount * 10 ** fromAsset.decimals))
        txns.push(
          algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
            sender,
            receiver: sender,
            amount: rawAmount,
            assetIndex: fromAsset.id,
            suggestedParams,
          }),
        )
      }

      const encodedTxns = txns.map((txn) => txn.toByte())
      const signedTxns = await wallet.signTransactions(encodedTxns)

      setStatus('sending')

      const validSigned = signedTxns.filter((s): s is Uint8Array => s != null)
      if (validSigned.length === 0) throw new Error('No signed transactions')

      await wallet.algodClient.sendRawTransaction(validSigned).do()
      setStatus('success')
      wallet.onTransactionSuccess?.()
    } catch (err: any) {
      const message = err?.message || 'Swap failed'
      if (message.includes('cancelled') || message.includes('rejected') || message.includes('denied')) {
        setStatus('idle')
      } else {
        setError(message)
        setStatus('error')
      }
    }
  }, [wallet, fromAsset, toAsset, fromAmount])

  const reset = useCallback(() => {
    setFromAsset(ALGO_ASSET)
    setToAsset(null)
    setFromAmount('')
    setToSearchQuery('')
    setToSearchResults([])
    setStatus('idle')
    setError(null)
    setToLookupError(null)
  }, [])

  const retry = useCallback(() => {
    setStatus('idle')
    setError(null)
  }, [])

  return {
    fromAsset,
    setFromAsset,
    toAsset,
    setToAsset,
    fromAmount,
    setFromAmount,
    toSearchQuery,
    setToSearchQuery,
    toSearchResults,
    toSearchLoading,
    toLookupLoading,
    toLookupError,
    flipAssets,
    fromAssets,
    fromBalance,
    status,
    error,
    handleSwap,
    reset,
    retry,
  }
}
