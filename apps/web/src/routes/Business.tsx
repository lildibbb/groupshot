import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { OrderPanel } from '@/components/business/OrderPanel'
import { Shell } from '@/components/Shell'
import { apiUrl } from '@/lib/api'
import {
  type Checkout,
  galleryCsvUrl,
  getGallery,
  getLicense,
  getPlans,
  type LicenseInfo,
  type Plan,
  type ProviderId,
  savedLicense,
  saveLicense,
  saveOrder,
  checkout as startCheckout,
} from '@/lib/business'
import { useSeo } from '@/lib/seo'
import '@/business.css'

const METHODS: Record<ProviderId, { name: string; detail: string }> = {
  billplz: {
    name: 'FPX or Touch ’n Go eWallet',
    detail: 'Pay on the Billplz page with online banking, TNG eWallet or Boost.',
  },
  manual: { name: 'DuitNow QR transfer', detail: 'Scan a QR from any banking app or TNG. We confirm it by hand.' },
  sociabuzz: { name: 'SociaBuzz tip', detail: 'Tip our SociaBuzz page and write your order code in the message.' },
}

const FREE = [
  'The solo booth and live rooms for up to six people',
  'All frames, GIF and strip downloads',
  'Share links that last 24 hours',
  'Games and the print animation',
]

export default function Business() {
  useSeo({
    title: 'Groupshot for events and kiosks',
    description:
      'Run Groupshot on a tablet at a wedding, launch or cafe. Kiosk lock, auto-reset, an event gallery and share links that last 30 days. Pay with FPX, Touch ’n Go or DuitNow.',
    path: '/business',
  })
  const [plans, setPlans] = useState<{ plans: Plan[]; providers: ProviderId[]; checkoutPaused: boolean } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [picked, setPicked] = useState<Plan | null>(null)
  const [placed, setPlaced] = useState<Checkout | null>(null)

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch(() => setLoadError('Prices could not be loaded. Check your connection and reload.'))
  }, [])

  return (
    <Shell right={<Link to="/">Photo booth</Link>}>
      <div className="biz">
        <header className="biz-hero">
          <h1 className="display biz-h1">A photo booth on a tablet, with your event on it</h1>
          <p className="biz-lede">
            Stand a tablet at the entrance. Guests walk up, take a strip, scan the QR and leave. The screen resets
            itself for the next person and nobody can wander out of it.
          </p>
          <a className="btn-secondary" href="/kiosk">
            Try the kiosk screen
          </a>
        </header>

        <section className="biz-free" aria-labelledby="free-h">
          <h2 id="free-h" className="display biz-h2">
            Already free, stays free
          </h2>
          <ul>
            {FREE.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="caption">Business only adds the things a host needs to run it for other people.</p>
        </section>

        <section aria-labelledby="plans-h">
          <h2 id="plans-h" className="display biz-h2">
            Plans
          </h2>
          {loadError && (
            <p className="form-error" role="alert">
              {loadError}
            </p>
          )}
          {!plans && !loadError && <p className="caption">Loading prices…</p>}
          {plans && (
            <div className="plans">
              {plans.plans.map((p) => (
                <article key={p.id} className={`plan ${p.id}`} aria-labelledby={`plan-${p.id}`}>
                  <div className="plan-head">
                    <h3 id={`plan-${p.id}`} className="display">
                      {p.name}
                    </h3>
                    <p className="price">
                      {p.priceLabel}
                      <span> for {p.days} days</span>
                    </p>
                  </div>
                  <ul>
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={p.id === 'event' ? 'btn-primary' : 'btn-secondary'}
                    disabled={plans.checkoutPaused || plans.providers.length === 0}
                    onClick={() => {
                      setPicked(p)
                      setPlaced(null)
                      requestAnimationFrame(() =>
                        document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                      )
                    }}
                  >
                    {p.id === 'event' ? 'Buy an Event Pass' : 'Buy Studio'}
                  </button>
                </article>
              ))}
            </div>
          )}
          {plans?.checkoutPaused && <p className="note">Checkout is paused for a moment. Check back soon.</p>}
          {plans && !plans.checkoutPaused && plans.providers.length === 0 && (
            <p className="note">Payments are not switched on for this site yet.</p>
          )}
        </section>

        {picked && plans && (
          <section id="checkout" className="checkout" aria-labelledby="co-h">
            <h2 id="co-h" className="display biz-h2">
              {picked.name}, {picked.priceLabel}
            </h2>
            {placed ? (
              <OrderPanel
                checkout={placed}
                onDone={() => {
                  setPlaced(null)
                  setPicked(null)
                }}
              />
            ) : (
              <CheckoutForm
                plan={picked}
                providers={plans.providers}
                onPlaced={(c) => {
                  saveOrder({ id: c.order.id, token: c.token })
                  if (c.redirectUrl) {
                    setPlaced(c)
                    window.location.assign(c.redirectUrl)
                    return
                  }
                  setPlaced(c)
                }}
              />
            )}
          </section>
        )}

        <License />
      </div>
    </Shell>
  )
}

function CheckoutForm({
  plan,
  providers,
  onPlaced,
}: {
  plan: Plan
  providers: ProviderId[]
  onPlaced: (c: Checkout) => void
}) {
  const [form, setForm] = useState({ name: '', email: '', label: '' })
  const [provider, setProvider] = useState<ProviderId>(providers[0]!)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <form
      className="co-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError('')
        try {
          onPlaced(await startCheckout({ plan: plan.id, provider, ...form }))
        } catch (err) {
          setError((err as Error).message)
          setBusy(false)
        }
      }}
    >
      <div className="field">
        <label htmlFor="co-name">Your name</label>
        <input
          id="co-name"
          required
          autoComplete="name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="co-email">Email for the key</label>
        <input
          id="co-email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="co-label">Event or shop name (shown on the kiosk)</label>
        <input
          id="co-label"
          maxLength={60}
          placeholder="Aina & Daniel's wedding"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
      </div>
      <fieldset className="methods">
        <legend className="stamp">Pay with</legend>
        {providers.map((p) => (
          <label key={p} className="method">
            <input type="radio" name="method" value={p} checked={provider === p} onChange={() => setProvider(p)} />
            <span>
              <strong>{METHODS[p].name}</strong>
              <small>{METHODS[p].detail}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={busy || !form.name.trim() || !form.email.trim()}>
        {busy
          ? 'Opening payment…'
          : provider === 'billplz'
            ? `Continue to pay ${plan.priceLabel}`
            : 'Get payment details'}
      </button>
    </form>
  )
}

function License() {
  const [key, setKey] = useState(() => savedLicense() ?? '')
  const [info, setInfo] = useState<LicenseInfo | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [gallery, setGallery] = useState<{ id: string; type: string; createdAt: number; url: string }[] | null>(null)

  async function check(k: string) {
    setBusy(true)
    setError('')
    setGallery(null)
    try {
      const l = await getLicense(k)
      setInfo(l)
      if (l.valid) {
        saveLicense(l.key)
        getGallery(l.key)
          .then((g) => setGallery(g.items))
          .catch(() => setGallery([]))
      }
    } catch (e) {
      setInfo(null)
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (key) void check(key)
  }, [])

  return (
    <section className="license" aria-labelledby="lic-h">
      <h2 id="lic-h" className="display biz-h2">
        Already have a key?
      </h2>
      <form
        className="license-form"
        onSubmit={(e) => {
          e.preventDefault()
          void check(key)
        }}
      >
        <div className="field">
          <label htmlFor="lic">License key</label>
          <input
            id="lic"
            className="code-input"
            placeholder="GSB-XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
          />
        </div>
        <button type="submit" className="btn-secondary" disabled={busy || key.trim().length < 6}>
          {busy ? 'Checking…' : 'Check key'}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {info && (
        <div className="license-card" aria-live="polite">
          <p>
            <strong>{info.planName}</strong>
            {info.label ? ` for ${info.label}` : ''}.{' '}
            {info.valid
              ? `Active until ${new Date(info.expiresAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })}.`
              : info.reason === 'revoked'
                ? 'This key was revoked.'
                : 'This key has expired.'}
          </p>
          {info.valid && (
            <>
              <p className="caption">
                Up to {info.kiosks} kiosks at once. Strips shared from this browser stay online for {info.keepDays}{' '}
                days.
              </p>
              <div className="row">
                <a className="btn-primary btn-sm" href="/kiosk">
                  Open the kiosk
                </a>
                <a className="btn-quiet btn-sm" href={galleryCsvUrl(info.key)}>
                  Download gallery list (CSV)
                </a>
              </div>
              <h3 className="stamp">Gallery</h3>
              {gallery === null ? (
                <p className="caption">Loading…</p>
              ) : gallery.length === 0 ? (
                <p className="caption">
                  Nothing shared yet. Strips guests share from a kiosk using this key appear here.
                </p>
              ) : (
                <ul className="gallery">
                  {gallery.map((g) => (
                    <li key={g.id}>
                      <a href={apiUrl(g.url)} target="_blank" rel="noreferrer">
                        {g.type.startsWith('image/') ? (
                          <img
                            src={apiUrl(g.url)}
                            alt={`Strip shared ${new Date(g.createdAt).toLocaleString('en-MY')}`}
                            loading="lazy"
                          />
                        ) : (
                          <span>Video clip</span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
