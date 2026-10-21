import { timingSafeEqual } from './billplz'

export interface SociabuzzConfig {
  urlKey: string
  token?: string
  tokenHeader: string
  pageUrl: string
}

export interface SociabuzzTip {
  id: string | null
  amount: number
  currency: string
  message: string
  supporter: string
  orderCode: string | null
}

export const ORDER_CODE = /\bGS-[A-HJ-NP-Z2-9]{6}\b/i

function pick(o: Record<string, unknown>, names: string[]): unknown {
  for (const n of names) {
    if (o[n] !== undefined && o[n] !== null && o[n] !== '') return o[n]
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const found = pick(v as Record<string, unknown>, names)
      if (found !== undefined) return found
    }
  }
  return undefined
}

function strings(o: unknown, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o)
  else if (o && typeof o === 'object') for (const v of Object.values(o)) strings(v, out)
  return out
}

export function parseAmount(raw: unknown) {
  if (typeof raw === 'number') return raw
  const text = String(raw ?? '').replace(/[^\d.,]/g, '')
  const n = /^\d{1,3}([.,]\d{3})+$/.test(text) ? Number(text.replace(/[.,]/g, '')) : Number(text.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export function parseTip(body: Record<string, unknown>): SociabuzzTip {
  const amountRaw = pick(body, ['amount_settled', 'amount', 'total', 'price', 'nominal'])
  const message = String(pick(body, ['message', 'supporter_message', 'note', 'description']) ?? '')
  const code = (message.match(ORDER_CODE) ?? strings(body).join(' ').match(ORDER_CODE))?.[0]?.toUpperCase() ?? null
  const id = pick(body, ['id', 'transaction_id', 'order_id', 'invoice_id'])
  return {
    id: id === undefined ? null : String(id),
    amount: parseAmount(amountRaw),
    currency: String(pick(body, ['currency', 'currency_code']) ?? 'IDR').toUpperCase(),
    message: message.slice(0, 500),
    supporter: String(pick(body, ['supporter', 'supporter_name', 'name']) ?? '').slice(0, 80),
    orderCode: code,
  }
}

export function authorize(
  config: SociabuzzConfig,
  req: { query: string | undefined; header: (n: string) => string | undefined },
  body: Record<string, unknown>,
) {
  if (!config.urlKey || !timingSafeEqual(req.query ?? '', config.urlKey)) return 'bad url key'
  if (config.token) {
    const sent = req.header(config.tokenHeader) ?? (typeof body.token === 'string' ? body.token : undefined)
    if (sent !== undefined && !timingSafeEqual(sent, config.token)) return 'bad token'
  }
  return null
}
