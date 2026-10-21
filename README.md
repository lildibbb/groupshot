# Groupshot

Same frame, different places. A browser photo booth where up to six friends join one room, see each other live, count down together, and all get the same strip.

## Stack

| Part | Tech |
| --- | --- |
| `apps/web` | Vite, React 19, TypeScript, Tailwind v4, Zustand, React Router |
| `apps/server` | Bun, Hono, native WebSockets (rooms, signaling, shot relay) |
| `packages/protocol` | Zod schemas and types shared by both sides |

- **Live video:** WebRTC mesh between browsers. The server only relays signaling.
- **Synced shutter:** the server picks the fire times, and each client measures its clock offset with ping/pong. Every camera captures its own full-res frame at the same moment.
- **Compositing:** an OffscreenCanvas in a Web Worker draws the final PNG and GIF, so the UI never stalls. Browsers without OffscreenCanvas fall back to the main thread.
- **Templates:** templates defined as data in `apps/web/src/templates`. Each template lists its slots and draws its own decoration. People are tiled inside each slot, so a group of 1–6 lands in one frame.

## Run

```bash
pnpm install
pnpm dev          # web on :5173 (proxies /api and /ws), server on :8787
pnpm test         # protocol + server + web unit tests
pnpm typecheck
```

Phones on your Wi-Fi can open the Vite network URL, but camera access needs https outside localhost (use `vite --https` or a tunnel).

## Phone testing and tunnels

```bash
pnpm tunnel   # builds the web app, serves it from the API process, opens a Cloudflare quick tunnel
```

Do not tunnel `pnpm dev`. Vite sends hundreds of unbundled modules and keeps an HMR socket open, which leaves a phone on an endless loading preview. `pnpm tunnel` serves the production build from one origin (`WEB_DIST`), with brotli on the wasm and long-lived caching on fingerprinted files.

## Deploy notes

- Server: `bun apps/server/src/index.ts` (`PORT`, `CORS_ORIGIN`, `TRUST_PROXY=1` behind a reverse proxy, `WEB_DIST` to also serve the built web app, `DATA_DIR`). Rooms live in memory and are swept 6 hours after a room empties; a restart forgets every room. Run a single instance.
- Storage: `apps/server/data/groupshot.sqlite` (orders, licenses, counters, flags; WAL mode, so `-wal`/`-shm` sit beside it) is durable state and a good fit for one small VM. Photos, clips and share links go to the blob store: Cloudflare R2 when `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are set, otherwise `data/blobs/` on disk (each blob is a file plus a `.json` sidecar holding its type and expiry). R2 keeps media off the VM, has no egress fees, and a bucket lifecycle rule deletes anything older than a day.
- Limits (in `apps/server/src/app.ts` and `rooms.ts`): 20 new rooms per IP per 10 minutes, 40 share links per IP per hour, 24 share links per room, and per session 216 uploads / 96 MB per room. Uploads are refused 15 s after the last shutter. Over-limit requests get `429`.
- Share links last 24 hours and can be revoked. Creating one returns a `deleteToken`, and `DELETE /api/keep/:id` with `x-delete-token` removes the link. The token stays on the device that made the link and is never exported.
- Reliability: photos and clip sprites upload one at a time with 3 attempts and backoff. A dropped guest keeps their seat for 90 s. If the host leaves, the oldest guest becomes host.
- Web: set `VITE_API_URL` when the API lives on another origin. Peers behind strict NATs need a TURN server: `VITE_TURN_URL`, `VITE_TURN_USER`, `VITE_TURN_PASS`.
- Production: see `infra/README.md` (Terraform, Caddy with Let's Encrypt, GitHub Actions deploy).

## Adding a template

Add an entry to `apps/web/src/templates/index.ts` with a `size`, its `slots`, colors, and optional `background` / `decorate` draw functions. The picker thumbnail is rendered from the same code. Add its occasions and suggested group size to `META` in the same file so the picker can filter it. Text on a template should come from the session (names, date, frame count, caption), not made-up claims.

## Exports

- **Print sheet:** a 300 dpi US Letter or A4 JPEG with one or two copies and crop marks. Templates print at native size (a 600×1800 strip is 2×6 in).
- **Memories:** the shelf exports to one `.groupshot.json` file (version 1, base64 images) and imports it back. Imports are validated as a whole (format, version, ids, image type checked against its signature, size) and written in one transaction, so a bad file adds nothing.

## Business tier, admin and kiosk

Everything above stays free. Business adds what a host needs to run Groupshot for other people.

| Route | What it is |
| --- | --- |
| `/business` | Plans, checkout (Billplz FPX and TNG/Boost, DuitNow QR transfer, SociaBuzz tip), license lookup and event gallery |
| `/kiosk` | Guest-proof tablet mode: license key, exit PIN, event name, auto-reset after a quiet spell, fullscreen and wake lock |
| `/admin` | Owner dashboard: analytics, live rooms, orders, licenses, kiosks, payment log, switches. Needs `ADMIN_TOKEN` |

- **Plans** are placeholders in `apps/server/src/billing/plans.ts` (Event Pass RM49 for 7 days, Studio RM99 for 31 days). Override them with `PLANS_JSON`.
- **Payments** are verified, never trusted from the browser. Billplz callbacks need a valid `X-Signature` and are re-fetched from Billplz before a key is issued. SociaBuzz tips are matched by the `GS-XXXXXX` code in the message, the webhook URL key and the amount. DuitNow transfers get a unique sen amount and wait for you to approve them in `/admin`. Each order issues its license once, however many times a webhook is retried.
- **SociaBuzz payload:** its webhook format is not published. The parser looks for the usual field names and logs every body under Payment log. Run "Test Notification" once and check the fields match.
- **Analytics** are daily and hourly counters in SQLite (`DATA_DIR`): no IPs, no user ids, no images. Solo and kiosk strips are counted by a small beacon from the browser.
- **Server env:** `ADMIN_TOKEN`, `DATA_DIR`, `WEB_URL`, `API_URL`, `BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID`, `BILLPLZ_X_SIGNATURE_KEY`, `BILLPLZ_SANDBOX`, `SOCIABUZZ_URL_KEY`, `SOCIABUZZ_TOKEN`, `SOCIABUZZ_PAGE_URL`, `TNG_QR_IMAGE_URL`, `TNG_PAYEE`. A provider with no keys is left out of checkout.
- **SEO:** per-route titles and canonical URLs, `robots.txt` and `sitemap.xml` generated at build (set `SITE_URL`), private routes marked `noindex`.
- **Deploy:** Azure VM behind Cloudflare, see `infra/README.md`.
