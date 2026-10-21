import { Logo } from './Logo'

export function Shell({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <header className="site-header">
        <Logo />
        <nav aria-label="Main">{right}</nav>
      </header>
      <main>{children}</main>
    </div>
  )
}
