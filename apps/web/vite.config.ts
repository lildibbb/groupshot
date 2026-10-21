import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const api = process.env.API_URL ?? 'http://localhost:8787'

const PAGES = ['/', '/business']

function seoFiles(): Plugin {
  return {
    name: 'groupshot-seo-files',
    generateBundle() {
      const site = process.env.SITE_URL?.replace(/\/$/, '')
      const robots = ['User-agent: *', 'Disallow: /admin', 'Disallow: /kiosk', 'Disallow: /r/', 'Disallow: /billing/', 'Disallow: /api/']
      if (site) robots.push(`Sitemap: ${site}/sitemap.xml`)
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robots.join('\n')}\n` })
      if (!site) return
      const urls = PAGES.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), seoFiles()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '0.0.0.0',
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': api,
      '/ws': { target: api.replace(/^http/, 'ws'), ws: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': api,
      '/ws': { target: api.replace(/^http/, 'ws'), ws: true },
    },
  },
  worker: { format: 'es' },
})
