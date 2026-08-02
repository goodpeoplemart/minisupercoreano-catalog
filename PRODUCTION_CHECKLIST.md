# Production Checklist — minisupercoreano-catalog

Use this checklist before and after deploying to Render and publishing the Theme App Extension.
Do **not** commit real secrets to git.

---

## 1. Environment variables (Render Dashboard)

Set these in **Render → Service → Environment**:

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | Yes | `production` |
| `SHOPIFY_API_KEY` | Yes | From Shopify Partner Dashboard → App → Client credentials |
| `SHOPIFY_API_SECRET` | Yes | Secret — Render encrypted env only |
| `SHOPIFY_APP_URL` | Yes | `https://YOUR-PRODUCTION-DOMAIN` (no trailing slash) |
| `SCOPES` | Yes | `read_products,write_products,write_app_proxy` |
| `DATABASE_URL` | Yes | With Render disk: `file:/data/production.sqlite` |
| `RESEND_API_KEY` | Yes | Resend API key |
| `ORDER_EMAIL_FROM` | Yes | Verified sender in Resend (e.g. `orders@yourdomain.com`) |
| `ORDER_EMAIL_TO` | Yes | Store inbox that receives orders |
| `SHOP_CUSTOM_DOMAIN` | No | Only if the shop uses a custom domain |
| `MSC_ORDER_WEBHOOK_URL` | No | Optional post-order webhook |
| `MSC_ORDER_WEBHOOK_SECRET` | No | Sent as `X-MSC-Webhook-Secret` header only |

Copy from [`.env.example`](./.env.example) — leave values empty in git.

---

## 2. Render commands

| Step | Command |
|------|---------|
| **Build Command** | `npm install && npm run setup && npm run build` |
| **Start Command** | `npm run start` |

`setup` runs `prisma generate && prisma migrate deploy`.

### SQLite persistent disk (required on Render)

- Mount path: `/data`
- Set `DATABASE_URL=file:/data/production.sqlite`
- Without a disk, SQLite is wiped on every deploy → Shopify sessions lost → reinstall required

---

## 3. Shopify Partner Dashboard URLs

Replace `YOUR-PRODUCTION-DOMAIN` everywhere:

| Setting | Value |
|---------|-------|
| App URL | `https://YOUR-PRODUCTION-DOMAIN` |
| Allowed redirection URL(s) | `https://YOUR-PRODUCTION-DOMAIN/api/auth` |

---

## 4. `shopify.app.toml` (before `shopify app deploy`)

Update these lines to match production:

```toml
application_url = "https://YOUR-PRODUCTION-DOMAIN"

[auth]
redirect_urls = [ "https://YOUR-PRODUCTION-DOMAIN/api/auth" ]
```

App Proxy (keep unchanged):

```toml
[app_proxy]
url = "/apps/msc"
subpath = "msc"
prefix = "apps"
```

---

## 5. Deploy commands (run locally after Render is live)

```bash
# 1. Link / confirm production app config
shopify app config use

# 2. Deploy app + extension bundle
shopify app deploy

# 3. Install app on production store (if not already)
shopify app dev --reset   # dev only — for prod use Partner install flow
```

After deploy, open the store **Theme Editor → add/update MSC Catalog block** and save.

---

## 6. Health check

```bash
curl https://YOUR-PRODUCTION-DOMAIN/health
```

Expected:

```json
{"ok":true,"service":"minisupercoreano-catalog"}
```

---

## 7. App Proxy test URLs (storefront)

Replace `{store}` with your `.myshopify.com` domain:

| Endpoint | Method | Test |
|----------|--------|------|
| `https://{store}/apps/msc/products` | GET | Returns `{ ok: true, products: [...] }` |
| `https://{store}/apps/msc/order` | POST | JSON order body → `{ ok: true, orderNumber }` |
| `https://{store}/apps/msc/click` | POST | `{ productId: "gid://shopify/Product/..." }` |
| `https://{store}/apps/msc/request` | POST | Legacy alias of `/order` |

---

## 8. Email test

1. Add products to cart on the catalog page.
2. Complete buyer form → **Enviar pedido**.
3. Confirm JSON response includes `orderNumber`.
4. Confirm email arrives at `ORDER_EMAIL_TO`.
5. Check Render logs for `[ORDER SERVER] Email sent successfully` (no full buyer address in logs).

---

## 9. WhatsApp test

1. Complete an order (email success).
2. On success screen, tap **Enviar por WhatsApp**.
3. Confirm WhatsApp opens with order summary.
4. Seller number comes from Theme block setting `whatsapp_number` (default in Liquid schema), not from server env.

---

## 10. Mobile final test

- [ ] Product grid 2 columns
- [ ] Product detail modal: 50dvh, white overlay, “Agregar a la lista” visible
- [ ] Cart modal: 50dvh, list scroll, Total + Continuar
- [ ] Buyer modal: form scroll, submit + WhatsApp buttons visible
- [ ] No auto-open modals on page refresh
- [ ] Lista button updates count after add

---

## 11. Rollback

1. **Render:** Deploy previous successful commit from Render dashboard → **Rollback**.
2. **Shopify app:** Redeploy prior git tag with `shopify app deploy`.
3. **Theme:** Theme Editor → **Versions** → restore previous theme version.
4. **Database:** Session DB is on Render disk; rollback app code does not revert DB file.

---

## 12. PostgreSQL (future — not required now)

Current app stores **orders in email only** (not DB). Prisma SQLite holds **Shopify sessions** only.

Switch to PostgreSQL if you need:

- Multi-instance horizontal scaling without shared disk
- Managed backups for session storage

Requires schema `provider = "postgresql"` and migration — **do not change without explicit approval**.
