# Production shape


One small Azure VM in Singapore runs Caddy in front of the Bun server, which also serves the built web app. Cloudflare sits in front of everything: it caches the big model files so Azure egress stays near zero, absorbs floods, and is the only thing allowed to reach the VM. Photos and share links live in Cloudflare R2; the VM only holds SQLite (orders, licenses, analytics), backed up nightly to R2.

```
browser ──https──> Cloudflare (cache, WAF, rate limit) ──> NSG: Cloudflare ranges only
                                                              └─> Caddy :443 ──> Bun :8787 ──> /var/lib/groupshot/groupshot.sqlite
                                                                                          └──> R2 media bucket (rooms 6 h, share links 24 h, Business links 30 d)
                                          nightly: sqlite3 .backup ──> R2 backups bucket (30 days)
```

## Cost

Rough list prices, 2026. Check the Azure calculator for your region.

| Part | About |
| --- | --- |
| `Standard_B2ats_v2` VM, 24/7 | US$8 to 10 a month |
| 30 GB Standard SSD + static IPv4 | US$6 |
| Egress | the first 100 GB a month is free, and Cloudflare caches the heavy files, so usually US$0 |
| Cloudflare (Free plan), R2 | US$0 inside the free tier (10 GB of storage, 1 M writes a month) |

If the VM only needs to be up for events, `az vm deallocate` stops compute billing; the disk and IP still bill.

## Decisions

- **Orange cloud, `full` SSL.** Caddy makes a self-signed certificate and Cloudflare accepts it. That is encrypted but not authenticated on the Cloudflare to Azure hop. The NSG only admits Cloudflare's ranges, which limits the exposure. To make it strict: create an Origin CA certificate in the Cloudflare dashboard, copy it to the VM, point Caddy's `tls` at it, and set `cloudflare_zone_setting.ssl` to `strict`.
- **Why the app trusts `cf-connecting-ip`.** `TRUST_PROXY=1` makes the rate limiters read that header. It is only safe because the NSG blocks every source that is not Cloudflare. If you ever open 80/443 wider, unset `TRUST_PROXY`.
- **Cache rule.** Cloudflare does not cache `.wasm`, `.onnx` or `.tflite` by default. `cloudflare_ruleset.cache` fixes that for `/assets`, `/models` and `/textures`.
- **Lifecycle.** The media bucket deletes objects after 31 days as a backstop. The app itself expires rooms (6 h) and free links (24 h); Business links are stored under `pro/` and live 30 days.
- **Secrets.** Terraform takes tokens from `TF_VAR_*`. App secrets (`ADMIN_TOKEN`, R2 keys, billing keys) are never in Terraform state: CI writes them to `/opt/groupshot/.env` from the `SERVER_ENV` secret on each deploy.

## Apply

```sh
az login
cp terraform.tfvars.example terraform.tfvars   # fill in subscription, zone, deploy public key
export TF_VAR_cloudflare_api_token=...
terraform init && terraform plan && terraform apply
```

`terraform validate` passes on this module (azurerm 4, cloudflare 5), but it has not been applied. Read the plan first, and check that `vm_size` is offered in `location` for your subscription (`az vm list-skus --location southeastasia --size Standard_B2ats --output table`).

Optional: copy `backend.tf.example` to `backend.tf` to keep state in an R2 bucket instead of on your laptop.

## GitHub setup

Then create an R2 API token (Object Read & Write, scoped to the media and backups buckets) in the Cloudflare dashboard.

| Kind | Name | Value |
| --- | --- | --- |
| variable | `DEPLOY_HOST` | `server_ipv4` from the apply (CI connects to the VM directly, not through Cloudflare) |
| variable | `DEPLOY_HOST_KEY` | output of `ssh-keyscan -t ed25519 <ip>` without the host column |
| variable | `DEPLOY_URL` | `https://` + your site, used for the post-deploy health check |
| secret | `DEPLOY_SSH_KEY` | private half of the deploy key |
| secret | `SERVER_ENV` | `KEY=value` lines, see below |

`SERVER_ENV`:

```
ADMIN_TOKEN=<long random string>
WEB_URL=https://groupshot.example.com
API_URL=https://groupshot.example.com
CORS_ORIGIN=https://groupshot.example.com
R2_ACCOUNT_ID=...
R2_BUCKET=groupshot-media
R2_BACKUP_BUCKET=groupshot-backups
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
BILLPLZ_API_KEY=...
BILLPLZ_COLLECTION_ID=...
BILLPLZ_X_SIGNATURE_KEY=...
SOCIABUZZ_URL_KEY=<random string you also put in the webhook URL>
SOCIABUZZ_TOKEN=<the Webhook Token you set in SociaBuzz>
SOCIABUZZ_PAGE_URL=https://sociabuzz.com/<your page>
TNG_QR_IMAGE_URL=/duitnow-qr.png
TNG_PAYEE=<name shown in the banking app>
```

Leave a provider's keys out and it disappears from checkout.

`ci.yml` runs typecheck, tests and build on every PR and push to `main` (one run per branch, older runs cancelled, docs-only changes skipped). Pushes to `main` bundle the server, upload it with the web build, deploy over SSH, then call `/api/health` on `DEPLOY_URL` and fail the job if the new server does not answer. `infra.yml` runs `terraform fmt` and `validate` when `infra/` changes; it never applies.
