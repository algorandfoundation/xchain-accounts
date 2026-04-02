import { useWallet } from '@txnlab/use-wallet-react'
import { WalletButton } from '@txnlab/use-wallet-ui-react'
import { WalletProviders } from './wallet-providers'
import { WalletDashboard } from './wallet-dashboard'

function WalletAppContent() {
  const { activeAddress } = useWallet()

  return (
    <>
      {!activeAddress && (
        <div data-wallet-ui className="flex justify-center mb-8">
          <WalletButton size="lg" />
        </div>
      )}
      <WalletDashboard />
    </>
  )
}

export default function WalletApp() {
  return (
    <WalletProviders>
      <WalletAppContent />
    </WalletProviders>
  )
}
