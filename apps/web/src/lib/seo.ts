import { useEffect } from 'react'

const SITE = 'Groupshot'

function setMeta(selector: string, attr: string, value: string, create: () => HTMLElement) {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

export function useSeo({
  title,
  description,
  path,
  noindex = false,
}: {
  title: string
  description?: string
  path: string
  noindex?: boolean
}) {
  useEffect(() => {
    const full = `${title} · ${SITE}`
    document.title = full
    const origin = location.origin
    if (description) {
      setMeta('meta[name="description"]', 'content', description, () =>
        Object.assign(document.createElement('meta'), { name: 'description' }),
      )
      setMeta('meta[property="og:description"]', 'content', description, () => {
        const m = document.createElement('meta')
        m.setAttribute('property', 'og:description')
        return m
      })
    }
    setMeta('meta[property="og:title"]', 'content', full, () => {
      const m = document.createElement('meta')
      m.setAttribute('property', 'og:title')
      return m
    })
    setMeta('link[rel="canonical"]', 'href', `${origin}${path}`, () =>
      Object.assign(document.createElement('link'), { rel: 'canonical' }),
    )
    setMeta('meta[name="robots"]', 'content', noindex ? 'noindex, nofollow' : 'index, follow', () =>
      Object.assign(document.createElement('meta'), { name: 'robots' }),
    )
  }, [title, description, path, noindex])
}
