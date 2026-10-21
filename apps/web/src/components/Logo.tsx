import { useId } from 'react'
import { Link } from 'react-router'

export function Mark({ size = 28, className = '' }: { size?: number; className?: string }) {
  const id = useId()
  return (
    <svg width={(size * 44) / 56} height={size} viewBox="-2 -2 44 60" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdfdff" />
          <stop offset=".45" stopColor="#c9cad3" />
          <stop offset=".52" stopColor="#7d7f8c" />
          <stop offset=".62" stopColor="#e4e5ec" />
          <stop offset="1" stopColor="#a4a6b2" />
        </linearGradient>
      </defs>
      <rect x="2" y="1.5" width="26" height="16" rx="3" fill="none" stroke="#131317" strokeWidth="2.6" />
      <rect x="12" y="20" width="26" height="16" rx="3" fill={`url(#${id}c)`} stroke="#131317" strokeWidth="2.6" />
      <rect x="6" y="38.5" width="26" height="16" rx="3" fill="none" stroke="#131317" strokeWidth="2.6" />
    </svg>
  )
}

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Groupshot home">
      <Mark />
      <span>groupshot</span>
    </Link>
  )
}
