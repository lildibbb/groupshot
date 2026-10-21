export interface Plan {
  id: 'event' | 'studio'
  name: string
  priceSen: number
  sociabuzzMin: { amount: number; currency: string }
  days: number
  kiosks: number
  keepDays: number
  features: string[]
}

export const DEFAULT_PLANS: Plan[] = [
  {
    id: 'event',
    name: 'Event Pass',
    priceSen: 4900,
    sociabuzzMin: { amount: 180_000, currency: 'IDR' },
    days: 7,
    kiosks: 2,
    keepDays: 30,
    features: [
      'Kiosk mode with exit PIN and auto-reset',
      'Your event name on the kiosk start screen',
      'Event gallery of every kept strip',
      'Share links kept for 30 days',
      'Up to 2 kiosks at once',
    ],
  },
  {
    id: 'studio',
    name: 'Studio',
    priceSen: 9900,
    sociabuzzMin: { amount: 360_000, currency: 'IDR' },
    days: 31,
    kiosks: 5,
    keepDays: 30,
    features: [
      'Everything in Event Pass, for a month',
      'Up to 5 kiosks at once',
      'Kiosk health in one list',
      'Gallery export',
    ],
  },
]

export function loadPlans(json = process.env.PLANS_JSON): Plan[] {
  if (!json) return DEFAULT_PLANS
  const overrides = JSON.parse(json) as Partial<Plan>[]
  return DEFAULT_PLANS.map((p) => ({ ...p, ...overrides.find((o) => o.id === p.id), id: p.id }))
}

export const formatRm = (sen: number) => `RM${(sen / 100).toFixed(2)}`
