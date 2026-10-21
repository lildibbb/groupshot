import { useCallback, useEffect, useRef, useState } from 'react'
import { BarList, Columns, compact, LineChart, nf, rm, StatTile } from '@/components/admin/charts'
import {
  type AdminKiosk,
  type AdminLicense,
  type AdminOrder,
  type AdminRoom,
  type AdminWebhook,
  AuthError,
  adminFetch,
  type Breakdown,
  type Flags,
  isSignedIn,
  type Overview,
  type Series,
  signIn,
  signOut,
} from '@/lib/admin-api'
import { useSeo } from '@/lib/seo'
import '@/admin.css'

type View = 'overview' | 'rooms' | 'orders' | 'licenses' | 'kiosks' | 'webhooks' | 'controls'
const VIEWS: { id: View; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'rooms', label: 'Live rooms' },
  { id: 'orders', label: 'Orders' },
  { id: 'licenses', label: 'Licenses' },
  { id: 'kiosks', label: 'Kiosks' },
  { id: 'webhooks', label: 'Payment log' },
  { id: 'controls', label: 'Controls' },
]

const THEME_KEY = 'groupshot.admin.theme'
const readTheme = () => {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

interface Loaded<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

function useAdmin<T>(path: string | null, onAuth: () => void, every = 0): Loaded<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (path === null) return
    let live = true
    setLoading(true)
    adminFetch<T>(path)
      .then((d) => {
        if (!live) return
        setData(d)
        setError(null)
      })
      .catch((e: Error) => {
        if (!live) return
        if (e instanceof AuthError) onAuth()
        else setError(e.message)
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [path, tick])
  useEffect(() => {
    if (!every || path === null) return
    const t = setInterval(() => document.visibilityState === 'visible' && setTick((n) => n + 1), every)
    return () => clearInterval(t)
  }, [every, path])
  return { data, error, loading, reload: useCallback(() => setTick((n) => n + 1), []) }
}

function State({ q, children }: { q: Loaded<unknown>; children: React.ReactNode }) {
  if (q.error && !q.data) {
    return (
      <p className="a-banner error" role="alert">
        {q.error}{' '}
        <button type="button" className="a-link" onClick={q.reload}>
          Try again
        </button>
      </p>
    )
  }
  if (!q.data) return <p className="skeleton-note">Loading…</p>
  return <div className={q.loading ? 'refetch' : undefined}>{children}</div>
}

const when = (t: number) =>
  new Date(t).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const ago = (t: number) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}
const bytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)
const uptime = (ms: number) => {
  const m = Math.floor(ms / 60000)
  return m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export default function Admin() {
  useSeo({ title: 'Admin', path: '/admin', noindex: true })
  const [signed, setSigned] = useState(isSignedIn)
  const [theme, setTheme] = useState<'light' | 'dark' | null>(readTheme)
  const [view, setView] = useState<View>('overview')
  const [days, setDays] = useState(7)
  const lost = useCallback(() => setSigned(false), [])

  function flip() {
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    const next = dark ? 'light' : 'dark'
    setTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {}
  }

  const orders = useAdmin<{ orders: AdminOrder[] }>(signed ? '/orders?status=review' : null, lost, 30_000)
  const waiting = signed ? (orders.data?.orders?.length ?? 0) : 0

  if (!signed) {
    return (
      <div className="admin" data-theme={theme ?? undefined}>
        <SignIn onDone={() => setSigned(true)} />
      </div>
    )
  }

  return (
    <div className="admin" data-theme={theme ?? undefined}>
      <div className="a-shell">
        <aside className="a-side">
          <div className="a-brand">
            Groupshot <small>admin</small>
          </div>
          <nav className="a-nav" aria-label="Sections">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-current={view === v.id ? 'page' : undefined}
                onClick={() => setView(v.id)}
              >
                {v.label}
                {v.id === 'orders' && waiting > 0 && (
                  <span className="a-count">
                    {waiting}
                    <span className="sr-only"> to review</span>
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="a-side-foot">
            <button
              type="button"
              className="a-btn sm"
              onClick={() => {
                signOut()
                setSigned(false)
              }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <main className="a-main">
          <div className="a-top">
            <h1>{VIEWS.find((v) => v.id === view)?.label}</h1>
            <div className="a-filters">
              {view === 'overview' && (
                <fieldset className="seg">
                  <legend className="sr-only">Date range</legend>
                  {[7, 30, 90].map((d) => (
                    <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
                      {d} days
                    </button>
                  ))}
                </fieldset>
              )}
              <button type="button" className="a-btn sm" onClick={flip}>
                Switch theme
              </button>
            </div>
          </div>
          {view === 'overview' && <OverviewView days={days} lost={lost} />}
          {view === 'rooms' && <RoomsView lost={lost} />}
          {view === 'orders' && <OrdersView lost={lost} onChange={orders.reload} />}
          {view === 'licenses' && <LicensesView lost={lost} />}
          {view === 'kiosks' && <KiosksView lost={lost} />}
          {view === 'webhooks' && <WebhooksView lost={lost} onChange={orders.reload} />}
          {view === 'controls' && <ControlsView lost={lost} />}
        </main>
      </div>
    </div>
  )
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="a-login">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError('')
          try {
            await signIn(token)
            onDone()
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        <h1>Groupshot admin</h1>
        <div className="a-field">
          <label htmlFor="admin-token">Admin token</label>
          <input
            id="admin-token"
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
          />
          <span className="a-hint">
            The ADMIN_TOKEN set on the server. The browser keeps a 12 hour session, not the token.
          </span>
        </div>
        {error && (
          <p className="a-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="a-btn primary" disabled={busy || !token}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

function OverviewView({ days, lost }: { days: number; lost: () => void }) {
  const overview = useAdmin<Overview>(`/overview?days=${days}`, lost, 15_000)
  const series = useAdmin<Series>(`/series?days=${days}&metrics=rooms,frames,shared`, lost, 60_000)
  const breakdown = useAdmin<Breakdown>(`/breakdown?days=${days}`, lost, 60_000)
  const hourly = useAdmin<{ joins: { hour: string; value: number }[] }>('/hourly', lost, 60_000)
  const o = overview.data
  const checkouts = o?.metrics.checkouts?.current ?? 0
  const paid = o?.metrics.paid?.current ?? 0

  return (
    <State q={overview}>
      {o && (
        <>
          <div className="tiles">
            <StatTile
              hero
              label="People in booths now"
              value={nf.format(o.live.people)}
              hint={`${o.live.rooms} ${o.live.rooms === 1 ? 'room' : 'rooms'} open`}
            />
            <StatTile label="Strips made" value={compact(o.metrics.frames?.current ?? 0)} delta={o.metrics.frames} />
            <StatTile label="Rooms opened" value={compact(o.metrics.rooms?.current ?? 0)} delta={o.metrics.rooms} />
            <StatTile label="Links shared" value={compact(o.metrics.shared?.current ?? 0)} delta={o.metrics.shared} />
            <StatTile
              label="Revenue"
              value={rm(o.revenueSen.current)}
              delta={o.revenueSen}
              hint={
                checkouts
                  ? `${paid} paid of ${checkouts} checkouts (${Math.round((paid / checkouts) * 100)}%)`
                  : 'No checkouts yet'
              }
            />
          </div>

          <div className="a-grid lead">
            <div className="panel">
              <State q={series}>
                {series.data && (
                  <LineChart
                    title="Activity per day"
                    series={[
                      { name: 'Strips made', color: 'var(--series-1)', points: series.data.series.frames ?? [] },
                      { name: 'Rooms opened', color: 'var(--series-2)', points: series.data.series.rooms ?? [] },
                      { name: 'Links shared', color: 'var(--series-3)', points: series.data.series.shared ?? [] },
                    ]}
                  />
                )}
              </State>
            </div>
            <div className="panel">
              <State q={series}>
                {series.data && (
                  <LineChart
                    title="Revenue per day"
                    series={[{ name: 'Revenue', color: 'var(--series-1)', points: series.data.revenue }]}
                    format={(n) => rm(n)}
                    tick={(n) => `RM${compact(n / 100)}`}
                  />
                )}
              </State>
            </div>
          </div>

          <div className="a-grid cols-3" style={{ marginTop: 14 }}>
            <div className="panel">
              <State q={breakdown}>
                {breakdown.data && (
                  <BarList title="Frames people picked" rows={breakdown.data.templates} color="var(--series-1)" />
                )}
              </State>
            </div>
            <div className="panel">
              <State q={breakdown}>
                {breakdown.data && (
                  <BarList title="Where people join from" rows={breakdown.data.devices} color="var(--series-1)" />
                )}
              </State>
            </div>
            <div className="panel">
              <State q={breakdown}>
                {breakdown.data && (
                  <BarList
                    title="Countries opening rooms"
                    rows={breakdown.data.countries}
                    color="var(--series-1)"
                    empty="Needs Cloudflare in front of the server."
                  />
                )}
              </State>
            </div>
          </div>

          <div className="a-grid cols-2" style={{ marginTop: 14 }}>
            <div className="panel">
              <State q={hourly}>
                {hourly.data && (
                  <Columns title="People joining, last 24 hours" points={hourly.data.joins} color="var(--series-1)" />
                )}
              </State>
            </div>
            <div className="panel">
              <h2>Server</h2>
              <table className="a-table">
                <tbody>
                  {[
                    ['Version', o.server.version],
                    ['Uptime', uptime(o.server.uptimeMs)],
                    ['Memory in use', bytes(o.server.rssBytes)],
                    ['Rooms in memory', nf.format(o.server.roomsInMemory)],
                    ['Orders waiting for review', nf.format(o.orders.review ?? 0)],
                    ['All-time strips', compact(o.totals.strips ?? 0)],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      <td className="num">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </State>
  )
}

function RoomsView({ lost }: { lost: () => void }) {
  const q = useAdmin<{ rooms: AdminRoom[] }>('/rooms', lost, 5_000)
  const [error, setError] = useState('')
  async function close(code: string) {
    if (!confirm(`Close ${code}? Everyone in it is disconnected and its photos are deleted.`)) return
    try {
      await adminFetch(`/rooms/${code}`, { method: 'DELETE' })
      q.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <State q={q}>
      {error && (
        <p className="a-error" role="alert">
          {error}
        </p>
      )}
      <div className="panel">
        {q.data?.rooms.length ? (
          <div className="table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th scope="col">Room</th>
                  <th scope="col">Who</th>
                  <th scope="col">Frame</th>
                  <th scope="col">State</th>
                  <th scope="col" className="num">
                    Uploaded
                  </th>
                  <th scope="col">Last active</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.data.rooms.map((r) => (
                  <tr key={r.code}>
                    <th scope="row">
                      <code>{r.code}</code>
                    </th>
                    <td>
                      {r.people ? r.names.join(', ') : <span className="muted">Empty</span>}
                      {r.away ? <span className="muted"> (+{r.away} away)</span> : null}
                    </td>
                    <td>{r.template}</td>
                    <td>
                      <span className={`badge ${r.people ? 'ok' : 'pending'}`}>
                        {r.shooting
                          ? 'Shooting'
                          : r.activity
                            ? `Playing ${r.activity}`
                            : r.people
                              ? 'In lobby'
                              : 'Idle'}
                      </span>
                    </td>
                    <td className="num">{bytes(r.uploadedBytes)}</td>
                    <td>{ago(r.touchedAt)}</td>
                    <td>
                      <button type="button" className="a-btn sm danger" onClick={() => close(r.code)}>
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No rooms are open. New ones show up here within seconds.</p>
        )}
      </div>
    </State>
  )
}

const PLAN_NAME: Record<string, string> = { event: 'Event Pass', studio: 'Studio' }
const PROVIDER_NAME: Record<string, string> = {
  billplz: 'Billplz (FPX / TNG)',
  sociabuzz: 'SociaBuzz',
  manual: 'DuitNow / TNG QR',
}

function OrdersView({ lost, onChange }: { lost: () => void; onChange: () => void }) {
  const [status, setStatus] = useState('')
  const q = useAdmin<{ orders: AdminOrder[] }>(`/orders${status ? `?status=${status}` : ''}`, lost, 20_000)
  const [error, setError] = useState('')
  async function act(id: string, action: 'approve' | 'reject') {
    const note = action === 'reject' ? (prompt('Reason (kept in the order note):') ?? '') : ''
    if (
      action === 'approve' &&
      !confirm('Mark as paid and issue the license key? Only do this after the money is in your account.')
    )
      return
    try {
      await adminFetch(`/orders/${id}/${action}`, { method: 'POST', body: { note } })
      setError('')
      q.reload()
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <>
      <div className="a-filters" style={{ marginBottom: 12 }}>
        <fieldset className="seg">
          <legend className="sr-only">Order status</legend>
          {[
            ['', 'All'],
            ['review', 'To review'],
            ['pending', 'Pending'],
            ['paid', 'Paid'],
          ].map(([v, label]) => (
            <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v!)}>
              {label}
            </button>
          ))}
        </fieldset>
      </div>
      {error && (
        <p className="a-error" role="alert">
          {error}
        </p>
      )}
      <State q={q}>
        <div className="panel">
          {q.data?.orders.length ? (
            <div className="table-wrap">
              <table className="a-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Buyer</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Method</th>
                    <th scope="col" className="num">
                      Amount
                    </th>
                    <th scope="col">Reference</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.orders.map((o) => (
                    <tr key={o.id}>
                      <th scope="row">{when(o.created_at)}</th>
                      <td>
                        {o.name}
                        <div className="muted">
                          {o.email}
                          {o.label ? ` · ${o.label}` : ''}
                        </div>
                      </td>
                      <td>{PLAN_NAME[o.plan] ?? o.plan}</td>
                      <td>{PROVIDER_NAME[o.provider] ?? o.provider}</td>
                      <td className="num">{rm(o.amount_sen)}</td>
                      <td>
                        <code>{o.code}</code>
                        {o.claim_ref && <div className="muted">Receipt: {o.claim_ref}</div>}
                        {o.note && <div className="muted">{o.note}</div>}
                      </td>
                      <td>
                        <span className={`badge ${o.status}`}>
                          {o.status === 'review' ? 'To review' : o.status[0]!.toUpperCase() + o.status.slice(1)}
                        </span>
                      </td>
                      <td>
                        {o.status !== 'paid' && (
                          <div className="row-actions">
                            <button type="button" className="a-btn sm primary" onClick={() => act(o.id, 'approve')}>
                              Mark paid
                            </button>
                            {o.status !== 'rejected' && (
                              <button type="button" className="a-btn sm" onClick={() => act(o.id, 'reject')}>
                                Reject
                              </button>
                            )}
                          </div>
                        )}
                        {o.license_key && <code>{o.license_key}</code>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No orders here yet. Transfers waiting on you appear under “To review”.</p>
          )}
        </div>
      </State>
    </>
  )
}

function LicensesView({ lost }: { lost: () => void }) {
  const q = useAdmin<{ licenses: AdminLicense[] }>('/licenses', lost)
  const [form, setForm] = useState({ plan: 'event', email: '', label: '', days: '' })
  const [error, setError] = useState('')
  async function run(path: string, body: unknown) {
    try {
      await adminFetch(path, { method: 'POST', body })
      setError('')
      q.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <>
      <form
        className="panel"
        style={{ marginBottom: 14 }}
        onSubmit={async (e) => {
          e.preventDefault()
          await run('/licenses', { ...form, days: form.days ? Number(form.days) : undefined })
          setForm({ ...form, email: '', label: '', days: '' })
        }}
      >
        <h2>Give a free key</h2>
        <div className="form-row">
          <div className="a-field">
            <label htmlFor="l-plan">Plan</label>
            <select id="l-plan" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>
              <option value="event">Event Pass</option>
              <option value="studio">Studio</option>
            </select>
          </div>
          <div className="a-field">
            <label htmlFor="l-email">Email</label>
            <input
              id="l-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="a-field">
            <label htmlFor="l-label">Event or kiosk name</label>
            <input id="l-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="a-field" style={{ flex: '0 1 110px' }}>
            <label htmlFor="l-days">Days</label>
            <input
              id="l-days"
              inputMode="numeric"
              placeholder="Plan default"
              value={form.days}
              onChange={(e) => setForm({ ...form, days: e.target.value.replace(/\D/g, '') })}
            />
          </div>
          <button type="submit" className="a-btn primary">
            Create key
          </button>
        </div>
      </form>
      {error && (
        <p className="a-error" role="alert">
          {error}
        </p>
      )}
      <State q={q}>
        <div className="panel">
          {q.data?.licenses.length ? (
            <div className="table-wrap">
              <table className="a-table">
                <thead>
                  <tr>
                    <th scope="col">Key</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Holder</th>
                    <th scope="col">Expires</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.licenses.map((l) => {
                    const expired = l.expires_at < Date.now()
                    return (
                      <tr key={l.key}>
                        <th scope="row">
                          <code>{l.key}</code>
                        </th>
                        <td>{PLAN_NAME[l.plan] ?? l.plan}</td>
                        <td>
                          {l.label || '—'}
                          <div className="muted">{l.email}</div>
                        </td>
                        <td>{when(l.expires_at)}</td>
                        <td>
                          <span className={`badge ${l.revoked ? 'revoked' : expired ? 'expired' : 'ok'}`}>
                            {l.revoked ? 'Revoked' : expired ? 'Expired' : 'Active'}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="a-btn sm"
                              onClick={() => run(`/licenses/${l.key}/extend`, { days: 7 })}
                            >
                              +7 days
                            </button>
                            <button
                              type="button"
                              className="a-btn sm"
                              onClick={() => run(`/licenses/${l.key}/revoke`, { revoked: !l.revoked })}
                            >
                              {l.revoked ? 'Restore' : 'Revoke'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty">No keys issued yet. Paid orders and keys you create appear here.</p>
          )}
        </div>
      </State>
    </>
  )
}

function KiosksView({ lost }: { lost: () => void }) {
  const q = useAdmin<{ kiosks: AdminKiosk[] }>('/kiosks', lost, 15_000)
  return (
    <State q={q}>
      <div className="panel">
        {q.data?.kiosks.length ? (
          <div className="table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th scope="col">Kiosk</th>
                  <th scope="col">Key</th>
                  <th scope="col">Version</th>
                  <th scope="col" className="num">
                    Sessions
                  </th>
                  <th scope="col">Last seen</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.kiosks.map((k) => {
                  const online = Date.now() - k.last_seen < 90_000
                  return (
                    <tr key={k.id}>
                      <th scope="row">
                        {k.name}
                        <div className="muted">
                          <code>{k.id.slice(0, 8)}</code>
                        </div>
                      </th>
                      <td>
                        {k.license_key ? <code>{k.license_key}</code> : <span className="muted">Unlicensed</span>}
                      </td>
                      <td>{k.version || '—'}</td>
                      <td className="num">{nf.format(k.sessions)}</td>
                      <td>{ago(k.last_seen)}</td>
                      <td>
                        <span className={`badge ${online ? 'ok' : 'bad'}`}>{online ? 'Online' : 'Offline'}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No kiosk has checked in. Open /kiosk on a tablet to start one.</p>
        )}
      </div>
    </State>
  )
}

function WebhooksView({ lost, onChange }: { lost: () => void; onChange: () => void }) {
  const q = useAdmin<{ webhooks: AdminWebhook[] }>('/webhooks', lost, 20_000)
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState('')
  async function attach(id: number) {
    const orderId = prompt('Order code (GS-…) or order id to mark paid:')
    if (!orderId) return
    try {
      await adminFetch(`/webhooks/${id}/attach`, { method: 'POST', body: { orderId: orderId.trim() } })
      setError('')
      q.reload()
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <State q={q}>
      <p className="muted" style={{ marginBottom: 12 }}>
        Every call to a payment webhook, accepted or not. A tip without a readable order code lands here so you can
        match it by hand.
      </p>
      {error && (
        <p className="a-error" role="alert">
          {error}
        </p>
      )}
      <div className="panel">
        {q.data?.webhooks.length ? (
          <div className="table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Result</th>
                  <th scope="col">Detail</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {q.data.webhooks.map((w) => (
                  <tr key={w.id}>
                    <th scope="row">{when(w.received_at)}</th>
                    <td>{w.provider}</td>
                    <td>
                      <span className={`badge ${w.ok ? 'ok' : 'bad'}`}>{w.ok ? 'Applied' : 'Ignored'}</span>
                    </td>
                    <td>
                      {w.outcome}
                      {open === w.id && <pre className="pre">{w.body}</pre>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="a-btn sm"
                          aria-expanded={open === w.id}
                          onClick={() => setOpen(open === w.id ? null : w.id)}
                        >
                          {open === w.id ? 'Hide body' : 'Body'}
                        </button>
                        {!w.ok && w.provider === 'sociabuzz' && !w.order_id && (
                          <button type="button" className="a-btn sm" onClick={() => attach(w.id)}>
                            Match to order
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No payment callbacks yet. Use “Test Notification” in SociaBuzz to see one arrive.</p>
        )}
      </div>
    </State>
  )
}

function ControlsView({ lost }: { lost: () => void }) {
  const q = useAdmin<Flags>('/flags', lost)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState('')
  const draft = note ?? q.data?.announcement ?? ''
  const saved = useRef(false)
  async function save(patch: Partial<Flags>) {
    try {
      await adminFetch('/flags', { method: 'PUT', body: patch })
      setError('')
      saved.current = true
      q.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <State q={q}>
      {error && (
        <p className="a-error" role="alert">
          {error}
        </p>
      )}
      {q.data && (
        <div className="panel">
          <div className="switch-row">
            <div>
              <strong>Pause shared rooms</strong>
              <p>
                New rooms are refused with a friendly message; people already inside carry on and solo still works. Use
                it before a deploy.
              </p>
            </div>
            <button
              type="button"
              className="a-btn"
              aria-pressed={q.data.roomsPaused}
              onClick={() => save({ roomsPaused: !q.data!.roomsPaused })}
            >
              {q.data.roomsPaused ? 'Resume rooms' : 'Pause rooms'}
            </button>
          </div>
          <div className="switch-row">
            <div>
              <strong>Pause checkout</strong>
              <p>Hides payment on the Business page while you sort out a gateway problem.</p>
            </div>
            <button
              type="button"
              className="a-btn"
              aria-pressed={q.data.checkoutPaused}
              onClick={() => save({ checkoutPaused: !q.data!.checkoutPaused })}
            >
              {q.data.checkoutPaused ? 'Resume checkout' : 'Pause checkout'}
            </button>
          </div>
          <div className="switch-row" style={{ display: 'block' }}>
            <strong>Announcement banner</strong>
            <p>One line shown at the top of the site. Leave empty to hide it.</p>
            <div className="form-row" style={{ marginTop: 10 }}>
              <div className="a-field">
                <label htmlFor="ann">Message</label>
                <input id="ann" maxLength={200} value={draft} onChange={(e) => setNote(e.target.value)} />
              </div>
              <button type="button" className="a-btn primary" onClick={() => save({ announcement: draft })}>
                Save message
              </button>
            </div>
          </div>
        </div>
      )}
    </State>
  )
}
