export interface BillplzConfig {
  apiKey: string
  collectionId: string
  xSignatureKey: string
  sandbox?: boolean
}

export interface Bill {
  id: string
  url: string
  paid: boolean
  state: string
  amount: number
  paid_amount?: number
  reference_1?: string
}

const baseUrl = (c: BillplzConfig) =>
  c.sandbox ? 'https://www.billplz-sandbox.com/api/v3' : 'https://www.billplz.com/api/v3'

async function hmacHex(key: string, text: string) {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function signatureSource(fields: Record<string, string>) {
  return Object.entries(fields)
    .filter(([k]) => k !== 'x_signature' && k !== 'billplz[x_signature]')
    .map(([k, v]) => `${k.replace(/\[|\]/g, '')}${v}`)
    .sort((a, b) => {
      const x = a.toLowerCase()
      const y = b.toLowerCase()
      return x < y ? -1 : x > y ? 1 : 0
    })
    .join('|')
}

export async function verifySignature(fields: Record<string, string>, key: string) {
  const given = (fields.x_signature ?? fields['billplz[x_signature]'] ?? '').toLowerCase()
  if (!given || !key) return false
  return timingSafeEqual(await hmacHex(key, signatureSource(fields)), given)
}

export class Billplz {
  constructor(
    private config: BillplzConfig,
    private fetcher: typeof fetch = fetch,
  ) {}

  private auth() {
    return `Basic ${btoa(`${this.config.apiKey}:`)}`
  }

  async createBill(input: {
    email: string
    name: string
    amountSen: number
    description: string
    callbackUrl: string
    redirectUrl: string
    reference: string
  }): Promise<Bill> {
    const body = new URLSearchParams({
      collection_id: this.config.collectionId,
      email: input.email,
      name: input.name.slice(0, 255),
      amount: String(input.amountSen),
      description: input.description.slice(0, 200),
      callback_url: input.callbackUrl,
      redirect_url: input.redirectUrl,
      reference_1_label: 'Order',
      reference_1: input.reference,
    })
    const res = await this.fetcher(`${baseUrl(this.config)}/bills`, {
      method: 'POST',
      headers: { authorization: this.auth(), 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) throw new Error(`Billplz create bill failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    return (await res.json()) as Bill
  }

  async getBill(id: string): Promise<Bill> {
    const res = await this.fetcher(`${baseUrl(this.config)}/bills/${encodeURIComponent(id)}`, {
      headers: { authorization: this.auth() },
    })
    if (!res.ok) throw new Error(`Billplz get bill failed (${res.status})`)
    return (await res.json()) as Bill
  }

  verify(fields: Record<string, string>) {
    return verifySignature(fields, this.config.xSignatureKey)
  }
}
