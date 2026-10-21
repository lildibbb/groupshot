import { useId } from 'react'
import type { StopId } from '@/lib/activities'

const o = { stroke: '#131317', strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } as const
const pebble = { fill: 'url(#gs-chrome)', ...o } as const
const white = { fill: '#fff', ...o } as const

const glyphs: Record<string, React.ReactNode> = {
  photobooth: (
    <>
      <rect x="12" y="5" width="24" height="38" rx="9" {...pebble} />
      <circle cx="24" cy="17" r="6.5" {...white} />
      <circle cx="24" cy="17" r="2.4" fill="#131317" />
      <rect x="17" y="27" width="14" height="9" rx="3" {...white} />
    </>
  ),
  'know-me': (
    <>
      <path d="M8 8h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H23l-9 8v-8H8a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" {...pebble} />
      <text
        x="24"
        y="29"
        textAnchor="middle"
        fontSize="20"
        fontWeight="800"
        fill="#fff"
        stroke="#131317"
        strokeWidth="1.2"
      >
        ?
      </text>
    </>
  ),
  'in-sync': (
    <>
      <circle cx="18" cy="24" r="13" {...white} />
      <circle cx="30" cy="24" r="13" {...pebble} fillOpacity=".85" />
      <path d="M24 13.5a13 13 0 0 1 0 21" fill="none" {...o} />
    </>
  ),
  'honest-cards': (
    <>
      <rect x="9" y="8" width="22" height="30" rx="4" transform="rotate(-10 20 23)" {...white} />
      <rect x="17" y="9" width="22" height="30" rx="4" transform="rotate(9 28 24)" {...pebble} />
      <path d="M23 20h10M23 26h7" stroke="#fff" strokeWidth="3" strokeLinecap="round" transform="rotate(9 28 24)" />
    </>
  ),
  'draw-together': (
    <>
      <path d="M9 39l2-10L32 8l8 8-21 21z" {...pebble} />
      <path d="M9 39l2-10 8 8z" {...white} />
      <path d="M28 12l8 8" stroke="#131317" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  'truth-or-dare': (
    <>
      <rect x="7" y="7" width="26" height="26" rx="7" transform="rotate(-10 20 20)" {...pebble} />
      <circle cx="14" cy="15" r="2.4" fill="#fff" />
      <circle cx="21" cy="19" r="2.4" fill="#fff" />
      <circle cx="28" cy="23" r="2.4" fill="#fff" />
      <rect x="23" y="22" width="19" height="19" rx="6" transform="rotate(12 32 31)" {...white} />
    </>
  ),
  'conversation-cards': (
    <>
      <path d="M8 8h32a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H23l-9 8v-8H8a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z" {...pebble} />
      <circle cx="14" cy="21" r="2.6" fill="#fff" />
      <circle cx="24" cy="21" r="2.6" fill="#fff" />
      <circle cx="34" cy="21" r="2.6" fill="#fff" />
    </>
  ),
  'riddle-night': (
    <>
      <path d="M24 5a13 13 0 0 0-7 24v4h14v-4a13 13 0 0 0-7-24z" {...pebble} />
      <rect x="17" y="36" width="14" height="6" rx="3" {...white} />
      <path d="M20 17a5 5 0 0 1 4-4" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),
  'iq-duel': <path d="M28 3L10 27h12l-3 18 19-26H26z" {...pebble} />,
  'color-match': (
    <>
      <path d="M24 4S9 21 9 30a15 15 0 0 0 30 0C39 21 24 4 24 4z" {...pebble} />
      <path d="M17 31a7 7 0 0 0 5 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
    </>
  ),
  'our-future': <path d="M24 3l5.5 14.5L44 24l-14.5 6.5L24 45l-5.5-14.5L4 24l14.5-6.5z" {...pebble} />,
  letters: (
    <>
      <rect x="5" y="10" width="38" height="28" rx="5" {...white} />
      <path d="M6 13l18 14 18-14" fill="none" {...o} />
      <circle cx="24" cy="30" r="5" {...pebble} />
    </>
  ),
  scrapbook: (
    <>
      <rect x="6" y="7" width="36" height="34" rx="5" {...white} />
      <path d="M10 35l9-11 7 8 5-5 7 8z" {...pebble} />
      <circle cx="32" cy="16" r="3.5" {...pebble} />
    </>
  ),
  lock: (
    <>
      <path d="M16 21v-6a8 8 0 0 1 16 0v6" fill="none" {...o} />
      <rect x="9" y="21" width="30" height="21" rx="6" {...pebble} />
      <circle cx="24" cy="30.5" r="3" fill="#fff" />
    </>
  ),
}

export function Coin({
  id,
  size = 88,
  locked = false,
  tried = false,
}: {
  id: StopId
  size?: number
  locked?: boolean
  tried?: boolean
}) {
  const ring = useId()
  const glyph = locked ? glyphs.lock : (glyphs[id] ?? glyphs['our-future'])
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" className="coin-art">
      <defs>
        <linearGradient id="gs-chrome" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdfdff" />
          <stop offset=".45" stopColor="#c9cad3" />
          <stop offset=".55" stopColor="#8d8f9c" />
          <stop offset=".66" stopColor="#e4e5ec" />
          <stop offset="1" stopColor="#a4a6b2" />
        </linearGradient>
        <linearGradient id={ring} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdfdff" />
          <stop offset=".4" stopColor="#c4c6d0" />
          <stop offset=".52" stopColor={tried ? '#131317' : '#6e7080'} />
          <stop offset=".64" stopColor="#d6d7df" />
          <stop offset="1" stopColor="#9a9ca9" />
        </linearGradient>
      </defs>
      <circle cx="48" cy="48" r="45" fill="#fffdfd" stroke={`url(#${ring})`} strokeWidth="6" />
      <circle cx="48" cy="48" r="37" fill="#f5f5f8" />
      <g transform="translate(24 24)" opacity={locked ? 0.9 : 1}>
        {glyph}
      </g>
      {!locked && (
        <>
          <path d="M16 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#a9a9b4" />
          <path d="M80 62l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" fill="#c4c6d0" />
        </>
      )}
      {tried && (
        <g transform="translate(62 6)">
          <circle cx="14" cy="14" r="13" fill="#131317" stroke="#fff" strokeWidth="3" />
          <path
            d="M8 14.5l4.2 4.2L20.5 10"
            fill="none"
            stroke="#fff"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  )
}
