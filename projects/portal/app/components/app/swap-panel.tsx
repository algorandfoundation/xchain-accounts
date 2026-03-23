import { useState } from 'react'
import { Spinner, TransactionStatus, AlgoSymbol } from '@d13co/algo-x-evm-ui'
import type { TransactionStatusValue } from '@d13co/algo-x-evm-ui'
import type { AssetHoldingDisplay } from '@d13co/algo-x-evm-ui'
import type { SwapAsset, SearchResult } from './use-swap-panel'
import { ALGO_ASSET } from './use-swap-panel'

export interface SwapPanelProps {
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
  accountAssets?: AssetHoldingDisplay[]
  availableBalance?: number | null
  status: TransactionStatusValue
  error: string | null
  handleSwap: () => void
  reset: () => void
  retry: () => void
  onBack: () => void
  txId?: string | null
  explorerUrl?: string | null
}

export function SwapPanel({
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
  accountAssets,
  availableBalance,
  status,
  error,
  handleSwap,
  reset: _reset,
  retry,
  onBack,
  txId,
  explorerUrl,
}: SwapPanelProps) {
  const [toDropdownOpen, setToDropdownOpen] = useState(false)

  const handleFromChange = (value: string) => {
    if (value === '0') {
      setFromAsset(ALGO_ASSET)
    } else {
      const asset = fromAssets.find((a) => String(a.id) === value)
      if (asset) setFromAsset(asset)
    }
    setFromAmount('')
  }

  const handleMax = () => {
    if (fromAsset.id === 0 && availableBalance != null) {
      const max = Math.max(0, availableBalance - 0.1)
      setFromAmount(max.toFixed(6).replace(/\.?0+$/, '') || '0')
    } else {
      const held = accountAssets?.find((a) => a.assetId === fromAsset.id)
      if (held) setFromAmount(held.amount)
    }
  }

  const handleSelectToAsset = (result: SearchResult) => {
    setToAsset({
      id: result.id,
      name: result.name,
      unitName: result.unitName,
      decimals: result.decimals,
    })
    setToSearchQuery('')
    setToDropdownOpen(false)
  }

  const handleClearTo = () => {
    setToAsset(null)
    setToSearchQuery('')
    setToDropdownOpen(false)
  }

  // Overspend check
  const parsedAmount = fromAmount !== '' ? parseFloat(fromAmount) : NaN
  const isOverspend = (() => {
    if (isNaN(parsedAmount) || parsedAmount <= 0) return false
    if (fromAsset.id === 0) {
      return availableBalance != null && parsedAmount > availableBalance
    }
    const held = accountAssets?.find((a) => a.assetId === fromAsset.id)
    return held != null && parsedAmount > parseFloat(held.amount)
  })()

  // Same asset check
  const isSameAsset = toAsset != null && fromAsset.id === toAsset.id

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={onBack}
          className="-ml-1 p-1 rounded-lg hover:bg-[var(--wui-color-bg-secondary)] transition-colors text-[var(--wui-color-text-secondary)] flex items-center justify-center"
          title="Back"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h3 className="text-lg font-bold leading-none text-[var(--wui-color-text)] wallet-custom-font">Swap</h3>
      </div>

      {/* Swap controls (hidden during/after transaction) */}
      {status === 'idle' && (
        <>
          <p className="text-xs text-[var(--wui-color-text-secondary)] mb-3">
            Swap between ALGO and Algorand Standard Assets
          </p>

          {/* FROM section */}
          <div className="bg-[var(--wui-color-bg-secondary)] rounded-xl p-3 mb-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--wui-color-text-tertiary)] uppercase tracking-wide">From</span>
              {fromBalance && (
                <span className="text-xs text-[var(--wui-color-text-tertiary)]">
                  Balance: {fromBalance}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <div className="flex-1 min-w-0 relative">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  autoFocus
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  className="w-full rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg)] py-2.5 px-3 pr-12 text-sm text-[var(--wui-color-text)] placeholder:text-[var(--wui-color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--wui-color-primary)] focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={handleMax}
                  className="absolute right-2 inset-y-0 my-auto h-fit text-[10px] font-medium text-[var(--wui-color-primary)] bg-[var(--wui-color-bg-tertiary)] rounded px-1.5 py-0.5 hover:brightness-90 transition-all"
                >
                  max
                </button>
              </div>
              <select
                value={String(fromAsset.id)}
                onChange={(e) => handleFromChange(e.target.value)}
                className="w-[130px] shrink-0 rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg)] py-2.5 px-2 text-sm text-[var(--wui-color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--wui-color-primary)] focus:border-transparent"
              >
                <option value="0">ALGO</option>
                {accountAssets?.map((asset) => (
                  <option key={asset.assetId} value={String(asset.assetId)}>
                    {asset.unitName || asset.name}
                  </option>
                ))}
              </select>
            </div>

            {isOverspend && (
              <p className="mt-1.5 text-xs text-[var(--wui-color-danger-text)]">Amount exceeds available balance</p>
            )}
          </div>

          {/* Flip button */}
          <div className="flex justify-center -my-1.5 relative z-10">
            <button
              type="button"
              onClick={flipAssets}
              disabled={!toAsset}
              className="p-1.5 rounded-lg bg-[var(--wui-color-bg-tertiary)] border border-[var(--wui-color-border)] text-[var(--wui-color-text-secondary)] hover:text-[var(--wui-color-text)] hover:brightness-90 transition-all disabled:opacity-40 disabled:pointer-events-none"
              title="Swap direction"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m7 15 5 5 5-5" />
                <path d="m7 9 5-5 5 5" />
              </svg>
            </button>
          </div>

          {/* TO section */}
          <div className="bg-[var(--wui-color-bg-secondary)] rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--wui-color-text-tertiary)] uppercase tracking-wide">To</span>
            </div>

            {toAsset ? (
              /* Selected "to" asset display */
              <div className="flex items-center justify-between rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg)] py-2.5 px-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-[var(--wui-color-text)]">
                      {toAsset.unitName || toAsset.name}
                    </span>
                    {toAsset.id > 0 && (
                      <span className="ml-1.5 text-xs text-[var(--wui-color-text-tertiary)]">ID: {toAsset.id}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearTo}
                  className="p-0.5 rounded text-[var(--wui-color-text-tertiary)] hover:text-[var(--wui-color-text-secondary)] transition-colors"
                  title="Change asset"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              /* "To" asset search */
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name or asset ID"
                  value={toSearchQuery}
                  onChange={(e) => {
                    setToSearchQuery(e.target.value)
                    setToDropdownOpen(true)
                  }}
                  onFocus={() => setToDropdownOpen(true)}
                  className="w-full rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg)] py-2.5 px-3 text-sm text-[var(--wui-color-text)] placeholder:text-[var(--wui-color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--wui-color-primary)] focus:border-transparent"
                />

                {/* Quick pick: ALGO option when not searching */}
                {!toSearchQuery && toDropdownOpen && (
                  <div className="mt-1 rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleSelectToAsset({ id: 0, name: 'Algorand', unitName: 'ALGO', decimals: 6, source: 'registry' })}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--wui-color-bg-secondary)] transition-colors text-sm text-[var(--wui-color-text)]"
                    >
                      <AlgoSymbol />
                      ALGO
                    </button>
                  </div>
                )}

                {/* Loading indicators */}
                {(toSearchLoading || toLookupLoading) && toDropdownOpen && (
                  <div className="mt-1 flex items-center justify-center py-3 text-xs text-[var(--wui-color-text-secondary)]">
                    <Spinner className="h-3 w-3 mr-1.5" />
                    {toLookupLoading ? 'Looking up asset' : 'Searching'}
                  </div>
                )}

                {/* Lookup error */}
                {toLookupError && toDropdownOpen && (
                  <p className="mt-1 text-xs text-[var(--wui-color-danger-text)]">{toLookupError}</p>
                )}

                {/* Search results dropdown */}
                {toSearchResults.length > 0 && toDropdownOpen && !toSearchLoading && !toLookupLoading && (
                  <div className="mt-1 max-h-[200px] overflow-y-auto rounded-lg border border-[var(--wui-color-border)] bg-[var(--wui-color-bg)]">
                    {toSearchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => handleSelectToAsset(result)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--wui-color-bg-secondary)] transition-colors border-b border-[var(--wui-color-border)] last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--wui-color-text)] truncate">
                            {result.name}
                            {result.source === 'ghost' && (
                              <span className="ml-1 text-[10px] text-[var(--wui-color-text-tertiary)] font-normal">(lookup)</span>
                            )}
                          </p>
                          {result.unitName && (
                            <p className="text-xs text-[var(--wui-color-text-secondary)]">{result.unitName}</p>
                          )}
                        </div>
                        <span className="text-xs text-[var(--wui-color-text-tertiary)] shrink-0 ml-2">
                          {result.id === 0 ? '' : `ID: ${result.id}`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* No results */}
                {toSearchQuery.trim().length > 0 &&
                  toSearchResults.length === 0 &&
                  !toSearchLoading &&
                  !toLookupLoading &&
                  !toLookupError &&
                  toDropdownOpen && (
                    <p className="mt-1 text-xs text-[var(--wui-color-text-secondary)] text-center py-2">No assets found</p>
                  )}
              </div>
            )}
          </div>

          {/* Same asset warning */}
          {isSameAsset && (
            <p className="mb-3 text-xs text-[var(--wui-color-danger-text)]">Cannot swap an asset to itself</p>
          )}

          {/* Swap button */}
          <button
            onClick={handleSwap}
            disabled={
              !fromAmount ||
              !toAsset ||
              isOverspend ||
              isSameAsset ||
              isNaN(parsedAmount) ||
              parsedAmount <= 0
            }
            className="w-full py-2.5 px-4 bg-[var(--wui-color-primary)] text-[var(--wui-color-primary-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Swap {fromAsset.unitName || fromAsset.name}
            {toAsset ? ` → ${toAsset.unitName || toAsset.name}` : ''}
          </button>
        </>
      )}

      <TransactionStatus
        status={status}
        error={error}
        successMessage="Swap submitted!"
        onRetry={retry}
        txId={txId}
        explorerUrl={explorerUrl}
      />

      {status === 'success' && (
        <button
          onClick={onBack}
          className="mt-3 w-full py-2.5 px-4 bg-[var(--wui-color-primary)] text-[var(--wui-color-primary-text)] font-medium rounded-xl hover:brightness-90 transition-all text-sm"
        >
          Back
        </button>
      )}
    </>
  )
}
