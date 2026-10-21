import { useEffect, useState } from 'react'
import { type Checkout, claimTransfer, getOrder, type PublicOrder, saveLicense } from '@/lib/business'

export function useOrder(id: string | null, token: string | null, initial?: PublicOrder | null) {
  const [order, setOrder] = useState<PublicOrder | null>(initial ?? null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!id || !token) return
    let live = true
    const pull = () =>
      getOrder(id, token)
        .then((o) => {
          if (!live) return
          setOrder(o)
          setError('')
        })
        .catch((e: Error) => live && setError(e.message))
    void pull()
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (order && !['pending', 'review'].includes(order.status)) return
      void pull()
    }, 5000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [id, token, order?.status])
  return { order, setOrder, error }
}

function CopyKey({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="key-box">
      <code>{value}</code>
      <button
        type="button"
        className="btn-quiet btn-sm"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          })
        }}
      >
        {done ? 'Copied' : 'Copy key'}
      </button>
    </div>
  )
}

export function OrderPanel({
  checkout,
  onDone,
}: {
  checkout: Pick<Checkout, 'order' | 'token' | 'pay'>
  onDone?: () => void
}) {
  const { order, setOrder, error } = useOrder(checkout.order.id, checkout.token, checkout.order)
  const [ref, setRef] = useState('')
  const [claimError, setClaimError] = useState('')
  const [busy, setBusy] = useState(false)
  const current = order ?? checkout.order
  const pay = checkout.pay

  useEffect(() => {
    if (current.status === 'paid' && current.licenseKey) saveLicense(current.licenseKey)
  }, [current.status, current.licenseKey])

  if (current.status === 'paid' && current.licenseKey) {
    return (
      <section className="order-card" aria-live="polite">
        <h3 className="display">You're set</h3>
        <p>
          Your key is saved in this browser and was sent to the email on the order. Paste it into the kiosk start screen
          on a tablet.
        </p>
        <CopyKey value={current.licenseKey} />
        <a className="btn-primary" href="/kiosk">
          Open the kiosk
        </a>
        {onDone && (
          <button type="button" className="link-plain" onClick={onDone}>
            Done
          </button>
        )}
      </section>
    )
  }
  if (['failed', 'expired', 'rejected'].includes(current.status)) {
    return (
      <section className="order-card" role="alert">
        <h3 className="display">That order was not completed</h3>
        <p>
          Status: {current.status}. Nothing was charged for it. Start a new order below, or tell us the reference{' '}
          <code>{current.code}</code> if money left your account.
        </p>
        {onDone && (
          <button type="button" className="btn-secondary" onClick={onDone}>
            Start again
          </button>
        )}
      </section>
    )
  }

  return (
    <section className="order-card" aria-live="polite">
      <p className="stamp">Order {current.code}</p>
      {current.provider === 'manual' && pay && (
        <>
          <h3 className="display">Pay exactly {pay.amountLabel}</h3>
          <p>
            Scan with Touch 'n Go eWallet or any DuitNow banking app. The extra sen after the price is how we match your
            payment, so do not round it.
          </p>
          {pay.qrImageUrl && (
            <img
              className="qr-img"
              src={pay.qrImageUrl}
              alt={`DuitNow QR for ${pay.payee ?? 'Groupshot'}`}
              width={240}
              height={240}
            />
          )}
          {pay.payee && <p className="caption">Payee: {pay.payee}</p>}
          {current.status === 'review' ? (
            <p className="note">
              Thanks. We check the transfer by hand, usually within a few hours. This page updates when your key is
              ready.
            </p>
          ) : (
            <form
              className="claim"
              onSubmit={async (e) => {
                e.preventDefault()
                setBusy(true)
                setClaimError('')
                try {
                  setOrder(await claimTransfer(current.id, checkout.token, ref))
                } catch (err) {
                  setClaimError((err as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              <div className="field">
                <label htmlFor="ref">Reference from your receipt</label>
                <input
                  id="ref"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Transaction or reference number"
                />
              </div>
              <button type="submit" className="btn-primary" disabled={busy || !ref.trim()}>
                {busy ? 'Sending…' : 'I have paid'}
              </button>
              {claimError && (
                <p className="form-error" role="alert">
                  {claimError}
                </p>
              )}
            </form>
          )}
        </>
      )}
      {current.provider === 'sociabuzz' && pay && (
        <>
          <h3 className="display">Send a tip with your code</h3>
          <ol className="steps">
            <li>
              Open{' '}
              <a href={pay.url} target="_blank" rel="noreferrer" className="link-plain">
                our SociaBuzz page
              </a>
              .
            </li>
            <li>
              Tip at least{' '}
              <strong>
                {pay.min ? `${pay.min.currency} ${pay.min.amount.toLocaleString('en-MY')}` : 'the plan price'}
              </strong>
              .
            </li>
            <li>
              Write <code className="big-code">{pay.code}</code> in the message. Without it we cannot tell whose payment
              it is.
            </li>
          </ol>
          <p className="note">
            Waiting for your tip. This page updates by itself, and the key also goes to your email.
          </p>
        </>
      )}
      {current.provider === 'billplz' && (
        <>
          <h3 className="display">Waiting for the bank</h3>
          <p>
            If the payment page did not open, or you closed it, this page keeps checking. Your key shows here the moment{' '}
            {current.amountLabel} is confirmed.
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
