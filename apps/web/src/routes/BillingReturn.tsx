import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { OrderPanel } from '@/components/business/OrderPanel'
import { Shell } from '@/components/Shell'
import { confirmBillplzReturn, type PublicOrder, savedOrder } from '@/lib/business'
import { useSeo } from '@/lib/seo'
import '@/business.css'

export default function BillingReturn() {
  useSeo({ title: 'Payment status', path: '/billing/return', noindex: true })
  const [params] = useSearchParams()
  const saved = savedOrder()
  const id = params.get('order')
  const [settled, setSettled] = useState<PublicOrder | null>(null)
  const [error, setError] = useState('')
  const usable = saved && saved.id === id

  useEffect(() => {
    if (!usable || !params.get('billplz[id]')) return
    const fields: Record<string, string> = {}
    for (const [k, v] of params) if (k.startsWith('billplz[')) fields[k] = v
    confirmBillplzReturn(saved.id, saved.token, fields)
      .then(setSettled)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <Shell right={<Link to="/business">Business</Link>}>
      <div className="biz-narrow">
        <h1 className="display biz-h1">Payment</h1>
        {!usable ? (
          <p className="note" role="alert">
            This browser does not hold that order. Open the page on the device where you started the payment, or check
            your email for the key.
          </p>
        ) : (
          <>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <OrderPanel
              key={settled?.status ?? 'initial'}
              checkout={{
                order:
                  settled ??
                  ({
                    id: saved.id,
                    status: 'pending',
                    provider: 'billplz',
                    amountLabel: '',
                    code: '',
                    licenseKey: null,
                  } as PublicOrder),
                token: saved.token,
              }}
            />
          </>
        )}
        <p>
          <Link className="link-plain" to="/business">
            Back to Business
          </Link>
        </p>
      </div>
    </Shell>
  )
}
