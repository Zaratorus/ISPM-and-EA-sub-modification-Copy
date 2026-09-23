# Gen-Z Digital Storefront — Backend

Project Group: **ISE_WE_0201_58**

Backend implementation for *A Modern Digital Storefront for Gen-Z*, built strictly from the accepted design chain:

`PROJECT_UNDERSTANDING.md` → `INTEGRATED_BUSINESS_ARCHITECTURE_MODEL_v2.md` → `DETAILED_SYSTEM_ARCHITECTURE_v1.2.md` → `DETAILED_DATABASE_ARCHITECTURE_v1.1.md` → `LOGICAL_DATABASE_DESIGN_v1.1.md` → `PHYSICAL_MYSQL_SCHEMA_DESIGN_v1.0.md` → `BACKEND_API_ARCHITECTURE_DESIGN_v1.0.md`

---

## Implementation Status

| Module | Status |
|---|---|
| **Module A — Product & Catalogue (EP-01)** | ✅ **Fully implemented** — products, categories, inventory, images, manual stock adjustment (now writes to the Activity Log). Product creation is atomic (Product + Inventory/Stock rows in one transaction). |
| **Module D — Store Administration (EP-04)** | ✅ **Fully implemented.** Admin Access Key flow (now writes Activity Log entries for both successful and failed attempts), Staff/Admin User management (create is Owner-level only), Roles + Permissions (incl. assigning permissions to a role), Store Settings (public/admin hybrid `GET`), the Activity Log (write + the `GET /activity-log` read/listing endpoint), and the read-only Dashboard. Every documented endpoint in Section 6 is real. No Staff *login* endpoint exists — Staff authentication remains OPEN (item 1). |
| **Module B — Customer & Order (EP-02)** | ✅ **Fully implemented** — registration, login, Cart (all 4 endpoints), and the complete Order lifecycle (checkout, list, detail, confirm, status-advance, cancel). Every documented endpoint in Section 6 is real. |
| **Module C — Delivery & Review (EP-03)** | ✅ **Complete except one endpoint.** `POST /deliveries`, `GET /deliveries/:id`, `GET /orders/:id/delivery`, Admin-triggered status advance, Review submission (with full eligibility check), the public approved-reviews+rating listing, and the read-only moderation queue are all real. Only `PATCH /reviews/:id/moderate` remains blocked — a genuine, unresolved architecture inconsistency (`moderation_logs.actor_id` has no legitimate value any current actor can supply), not an OPEN decision. See "Known Gaps" item 11. |

This build order matches the parallelization plan from Detailed System Architecture V1.2: Module A first (no inbound dependencies), so every other module has a real interface (`inventory.service.js`) to build against.

---

## What "fully implemented" means here

For Module A, every layer described in Backend/API Architecture Design V1.0 is present and wired together:

```
routes/  → controllers/  → services/  → repositories/  → MySQL
                 ↑
            validators/ (via request-validator.middleware.js)
```

- **`inventory.service.js`** is the exposed cross-module interface (`decreaseStock`, `increaseStock`, `getAvailability`, `getProduct`) — the only file any *other* module is allowed to import for stock operations. `inventory.repository.js` is never imported outside Module A.
- Manual stock adjustment (`PATCH /products/:id/stock`) is implemented separately inside `product.service.js`, since it's Module A editing its *own* data, not a cross-module request.
- All transactional/atomicity rules from Physical Schema Design V1.0 Section 5 that fall inside Module A's scope are implemented via `withTransaction()` (see `src/shared/db/connection.js`).

For Module B, the same layering applies. Three decisions were needed to fully unblock it (all confirmed by the project owner):
- **Guest cart persistence → Option B**: Cart is customer-authenticated-only; every `/cart` route requires a Customer JWT (`auth-customer.middleware.js`). There is no guest-cart path.
- **Login-identifier uniqueness → application-layer enforcement**: `customer.service.js`'s `register()` rejects a `contact_info` already in use (409); `db/schema.sql` is unchanged (still no DB-level `UNIQUE` constraint on `contact_info`).
- **Order cancellation authority → both, stage-dependent**: a Customer may cancel only their own order, and only while it is still Pending; Admin/Owner may cancel at any (non-Cancelled) stage. Implemented in `order.service.js.cancelOrder()`, gated by `auth-customer-or-admin.middleware.js` at the route level.
- **Delivery address → sourced from the Order, snapshotted onto Delivery** (project-owner amendment, not one of the ten headline OPEN items — a genuine schema gap discovered during Module C implementation, since neither Customer nor Order had ever stored an address). `orders.delivery_address` is now a required field captured at checkout (`POST /orders`); `deliveries.delivery_address` copies it once, at handover — never a live link to Order or Customer thereafter. This is a **real, approved schema change** — `db/schema.sql`, `PHYSICAL_MYSQL_SCHEMA_DESIGN_v1.0.md`, `LOGICAL_DATABASE_DESIGN_v1.1.md`, and `BACKEND_API_ARCHITECTURE_DESIGN_v1.0.md` were all updated to reflect it (each amendment clearly marked 🟢, consistent with those documents' own labeling convention).

`order.service.js.confirmOrder()` and `cancelOrder()` are the most architecturally important pieces of Module B: both call `inventory.service.js` (`decreaseStock()` / `increaseStock()` respectively) — never a direct write — inside the same `withTransaction()` as the order-status update, so a stock failure rolls back the whole operation (confirm leaves the order Pending; cancel simply fails, leaving stock and status untouched). `checkout()`'s pre-order availability check is explicitly advisory only, per System Architecture V1.2, Section 9.1.

For Module C, `review.service.js.submitReview()` is the piece worth understanding: eligibility is split correctly across the two modules involved — "is this order Delivered?" is answered from Module C's **own** `deliveries` table (Module C owns Delivery status and determines eligibility internally, per System Architecture V1.2 Section 11), while "does this order belong to this customer, and was this product actually in it?" is answered via Module B's exposed `order.service.js.getOrderDetail()` — never a direct read of Module B's tables. `delivery.service.js.createDelivery()` reads that same interface for both the Ready-for-Delivery precondition and the delivery-address snapshot; `advanceStatus()` mirrors Module B's `advanceStatus()` pattern exactly (sequential-only transitions, atomic status+history update, Activity Log write). One piece of Module C remains **not implemented** — not an OPEN decision, but an unresolved architecture inconsistency; see "Known Gaps" item 11.

For Module D: `dashboard.service.js.getDashboard()` is read-only-by-construction — every number comes from an ALREADY-EXPOSED service function of the owning module (`product.service.js.searchProducts()`, `order.service.js.listAllOrders()`, `review.service.js.listModerationQueue()`), read via `meta.total` on a 1-item page rather than any new cross-module interface. Delivery counts are disclosed as unavailable (Module C exposes no list-all interface for Delivery) rather than worked around. `staff.service.js` never sets or exposes `credentials_reference` anywhere — Staff accounts can be created/edited/deactivated, but have no way to log in yet, since the authentication mechanism is OPEN (item 1). `POST /staff` is deliberately gated by `authAdminAccessKey` alone (no `requirePermission()`), so it stays Owner-Access-Key-exclusive even once Staff sessions exist — a narrower, permanent restriction distinct from the other three Staff endpoints. `GET /settings` uses a new `authAdminAccessKey.optional` variant (attached to the existing middleware's export, not a new file) to implement its documented Public/Admin hybrid response without ever rejecting the request. The Admin Access Key flow now writes Activity Log entries for both successful and failed validation attempts, per Detailed System Architecture V1.2, Section 19's explicit requirement — the bcrypt/JWT validation logic itself is untouched.

Stock replenishment (revised DEC-05): manual stock adjustment (`PATCH /products/:id/stock`) is the normal way to increase or correct stock. It requires a `reason`, is restricted to an Admin session with `PRODUCT_MANAGE`, and every adjustment is written to the central Activity Log.

---

## Getting Started

### 1. Prerequisites
- Node.js 18+
- A running MySQL 8.0+ instance

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# then edit .env with real DB credentials, JWT secrets, etc.
```

### 4. Create the database schema
```bash
mysql -u root -p < db/schema.sql
```
`db/schema.sql` is the exact DDL from Physical MySQL Database Schema Design V1.0, Section 15 — copied verbatim, not regenerated.

### 5. Set the Owner/Admin Access Key
```bash
# Set ADMIN_ACCESS_KEY_RAW in .env to a real secret value first, then:
node scripts/set-admin-access-key.js
```
This hashes the key (bcrypt — see the OPEN-decision note in `admin-access-key.service.js`) and stores it in `admin_access_key`. The raw value is never stored, and the running server never reads `ADMIN_ACCESS_KEY_RAW` — only this one-time script does.

### 6. Run the server
```bash
npm run dev     # with nodemon
# or
npm start
```
Server starts on `PORT` (default `4000`); API is served under `API_PREFIX` (default `/api/v1`).

### 7. Smoke test
```bash
curl http://localhost:4000/health
# → {"data":{"status":"ok"}}

curl http://localhost:4000/api/v1/products
# → {"data":[],"meta":{"page":1,"limit":20,"total":0}}

curl -X POST http://localhost:4000/api/v1/admin/access-key/validate \
  -H "Content-Type: application/json" \
  -d '{"accessKey":"<the value you set in ADMIN_ACCESS_KEY_RAW>"}'
# → {"data":{"token":"<jwt>"}}
```

> **Note on this environment:** `npm install` now succeeds (network access is available), but **`bcrypt`'s native binding cannot build in this project's current folder path** — `C:\Users\Shasoo\Desktop\ISPM & EA\...` contains an `&`, which breaks `cmd.exe`'s invocation of `node-pre-gyp` (and, separately, breaks `npm start`/`npm test`/`npx <anything>` themselves the same way, since npm's own script runner also shells out through `cmd.exe`). Workarounds that *do* work in this exact path: `node node_modules/jest/bin/jest.js` (used to run the test suite below) and `node server.js` (bypasses the `npm start` shim) — but the server still cannot fully start today because `bcrypt`'s native module is genuinely missing, not just unreachable via the shim. The most robust fix is to move/rename this project directory to a path with no `&` (or any other `cmd.exe`-special character), then re-run `npm install` normally. This is an environment/tooling characteristic of this specific machine and path, not a code defect — every `.js` file has additionally been verified with `node --check`.

---

## Known Gaps / OPEN Decisions (carried forward, not invented)

These are unresolved business/security decisions from prior design documents — the code does **not** guess an answer for any of them:

1. **Staff authentication mechanism** — `auth-staff.middleware.js` exists as a documented placeholder that always returns 501; no login endpoint is defined for Staff.
2. ~~Guest cart persistence through login/register~~ — **RESOLVED** (project-owner decision): Cart is customer-authenticated-only (Option B — "Cart only created post-login"). Implemented in `cart.routes.js`/`cart.service.js`; every Cart route requires a Customer JWT. There is no guest-cart path.
3. **WhatsApp integration mechanism** — `whatsapp.service.js` builds a `wa.me` deep link from `STORE_WHATSAPP_NUMBER` (a disclosed, swappable implementation choice — see the file's own header comment); whether this should instead be a formal WhatsApp Business API integration remains open. Does not block checkout, which now works end-to-end using the link-based approach.
4. ~~Order cancellation authority~~ — **RESOLVED** (project-owner decision): both, stage-dependent. Customer may self-cancel only their own order while it is Pending (no stock effect); Admin/Owner may cancel at any non-Cancelled stage (restores stock via `increaseStock()` if it had been deducted). Implemented in `order.service.js.cancelOrder()`.
5. **Duplicate-review restriction** — deliberately NOT implemented. `review.service.js.submitReview()` performs no check for prior reviews by the same customer on the same product/order; `reviews` carries no uniqueness constraint. A customer may submit any number of reviews.
6. **Admin Access Key hashing algorithm** — bcrypt (12 rounds), confirmed as the implementation choice going forward. Reused for Customer password hashing too (`customer.service.js`) for consistency — Customer authentication's *mechanism* (email/password, JWT) is not itself an OPEN decision, only the Access Key's specific hashing choice was.
7. *(Withdrawn — not applicable to the final four-epic scope.)*
8. **Deactivation downstream behaviour** (Category/Customer/Staff) — flags exist in the schema; behavioural effects not implemented anywhere yet.
9. **Delivery Person identity structure** — `PATCH /deliveries/:id/status` implements only the Admin path; no Delivery Person auth mechanism, role, or entity is invented. Blocks the Delivery Person half of that one endpoint only.
10. ~~Customer login-identifier uniqueness~~ — **RESOLVED** (project-owner decision, newly surfaced during implementation, not one of the original ten headline items): enforced at the application layer only. `customer.service.js`'s `register()` rejects a `contact_info` already registered to an ACTIVE customer (409 `CONTACT_INFO_IN_USE`); `db/schema.sql` is unchanged. `POST /auth/customer/login` is implemented and safe to look up a single row as a result.
11. **Two genuine schema gaps discovered while implementing Module C (EP-03)** — **not** OPEN decisions:
    - ~~`POST /deliveries` was blocked~~ — **RESOLVED** (project-owner decision): `orders.delivery_address` was added (`NOT NULL`, captured at checkout) as the authoritative source; `deliveries.delivery_address` now snapshots from it at handover, never from a live Customer link. This is a genuine, approved amendment to the physical schema — see `db/schema.sql`, `PHYSICAL_MYSQL_SCHEMA_DESIGN_v1.0.md`, `LOGICAL_DATABASE_DESIGN_v1.1.md`, and `BACKEND_API_ARCHITECTURE_DESIGN_v1.0.md` (each change marked 🟢). `POST /deliveries` is now fully implemented and tested.
    - ~~`PATCH /reviews/:id/moderate` was blocked~~ — **RESOLVED** (Actor Identity Architecture Decision, project-owner-approved 2026-09-08): `moderation_logs` gained a paired `actor_type`/`actor_id` (Physical Schema V1.0, Section 5b) — Owner/Admin moderates with `actor_type = 'OWNER_ADMIN'`, `actor_id = NULL` (no Staff/Admin User row is created); Staff would moderate with its real `staff_admin_user_id`, once Staff authentication (gap #1) is resolved. `PATCH /reviews/:id/moderate` is now fully implemented and tested (`review.service.js.moderateReview()`).
12. *(Withdrawn — not applicable to the final four-epic scope.)*

See `BACKEND_API_ARCHITECTURE_DESIGN_v1.0.md`, Section 15, for full detail on items 1, 3, 6–9. Items 10–12 are tracked here because they were discovered during implementation, not listed in that document.

---

## Project Structure

See `BACKEND_API_ARCHITECTURE_DESIGN_v1.0.md`, Section 4, for the authoritative structure diagram. The folders in this repository match it exactly — each of the four modules is self-contained (`routes/ → controllers/ → services/ → repositories/`, plus `validators/`), and `src/shared/` holds only genuinely cross-cutting code (auth, RBAC, error handling, the DB connection).

## Next Steps

Modules A, B, C, and D are all now complete against the documented, unblocked endpoint set. Remaining work:

1. Now that Store Settings exists (Module D), switch `whatsapp.service.js` to read `store_settings.whatsapp_number` instead of the env var (see that file's header comment) — a small, isolated follow-up.
2. Once Staff authentication is resolved (gap #1): a Staff login endpoint can be added to Module D, and every `authAdminAccessKey` + `requirePermission()` route across all four modules (review moderation included) becomes exercisable by a real Staff session — the service-layer logic already supports the Staff actor path (`actor_type = 'STAFF_ADMIN_USER'`) and is unit-tested against it; only the HTTP-level session middleware itself is pending.
3. Resolve the remaining OPEN decisions above (items 1, 3, 6–9) with the team/supervisor as each becomes a hard blocker for the feature that needs it.
