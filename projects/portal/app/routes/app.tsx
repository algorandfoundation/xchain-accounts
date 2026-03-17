import { createFileRoute } from '@tanstack/react-router'
import { Header } from '~/components/layout/header'
import { Footer } from '~/components/layout/footer'
import { Button } from '~/components/ui/button'
import { Badge } from '~/components/ui/badge'
import { MockWalletDashboard } from '~/components/app/mock-wallet'

export const Route = createFileRoute('/app')({
  component: AppPage,
  head: () => ({
    meta: [{ title: 'App — Algorand x EVM' }],
  }),
})

function AppPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Wallet Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Manage your Algorand x EVM account
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline">TestNet</Badge>
            <Button disabled>
              Connect Wallet
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground mb-8">
          <strong className="text-foreground">Mock UI - not ready for review</strong> &mdash; This is a
          preview of the wallet management interface. Wallet connection and
          transactions are not functional yet. The production app will integrate
          use-wallet, use-wallet-ui, and algo-x-evm-ui components.
        </div>

        <MockWalletDashboard />
      </main>
      <Footer />
    </div>
  )
}
