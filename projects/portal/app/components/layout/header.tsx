import { Link, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { cn } from '~/lib/utils'

const navItems = [
  { label: 'Manage Account', to: '/app' as const },
  { label: 'Docs', to: '/docs' as const },
]

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const routerState = useRouterState()
  const isLanding = routerState.location.pathname === '/'

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm',
        isLanding && 'border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-primary">Algorand</span>
          <span className="text-[#CCD0D3]">x</span>
          <span style={{ color: '#8a92b2' }}>EVM</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: 'text-foreground' }}
            >
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/tasosbit/liquid-accounts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            GitHub
          </a>
        </nav>

        {/* Mobile toggle */}
        <button
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="border-t px-4 pb-4 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="block py-2 text-sm font-medium text-muted-foreground"
              activeProps={{ className: 'text-foreground' }}
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/tasosbit/liquid-accounts"
            target="_blank"
            rel="noopener noreferrer"
            className="block py-2 text-sm font-medium text-muted-foreground"
          >
            GitHub
          </a>
        </nav>
      )}
    </header>
  )
}
