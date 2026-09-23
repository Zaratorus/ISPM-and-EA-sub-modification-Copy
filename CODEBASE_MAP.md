# Gen-Z Digital Storefront — Codebase Map

**What this is:** a guide to where everything lives in the code, and how the main concepts (validation, error handling, OOP, authentication, database access) are implemented.

**Written:** 2026-09-21, from reading the actual source. No project file was changed.

> **Path note:** the backend is nested one level deeper than you might expect.
> The real backend root is `genz-backend/genz-backend/`, not `genz-backend/`.
> All backend paths below are relative to that inner folder.

---

## 1. The big picture

Three tiers, as designed:

```
┌──────────────────────────────────────────┐
│  genz-frontend/          React 19 + Vite │   Presentation
│  Pages, components, contexts, api/       │
└──────────────────┬───────────────────────┘
                   │  HTTPS / JSON, Bearer token
┌──────────────────▼───────────────────────┐
│  genz-backend/   Node.js + Express       │   Application
│  Routes → Controllers → Services → Repos │
└──────────────────┬───────────────────────┘
                   │  mysql2, parameterised SQL
┌──────────────────▼───────────────────────┐
│  MySQL — 22 InnoDB tables                │   Data
│  FKs, CHECK constraints, UNIQUE keys     │
└──────────────────────────────────────────┘
```

---

## 2. Backend folder structure

```
genz-backend/genz-backend/
├── server.js               ← entry point: starts the HTTP listener only
├── db/schema.sql           ← all 22 CREATE TABLE statements
├── scripts/                ← one-off tools (seed products, set admin key)
├── tests/                  ← 46 unit test suites; integration/ is EMPTY
└── src/
    ├── app.js              ← builds the Express app, mounts every route
    ├── config/
    │   └── env.config.js   ← reads & validates ALL environment variables
    ├── shared/             ← code used by every module
    │   ├── constants/statuses.js
    │   ├── db/connection.js
    │   ├── middleware/     ← 5 auth + RBAC + validation + error handler
    │   └── utils/          ← ApiError, asyncHandler, courier-link, mailer
    └── modules/            ← one folder per Epic
        ├── product-catalogue/      (EP-01)
        ├── customer-order/         (EP-02)
        ├── delivery-review/        (EP-03)
        └── store-administration/   (EP-04)
```

### Every module has the same five folders

This is the pattern to remember. Once you understand one module, you understand all four.

| Folder | Job | Rule |
|---|---|---|
| `routes/` | Declares URLs and chains middleware | No logic. Just wiring |
| `validators/` | zod schemas describing valid input | Shape only, no database |
| `controllers/` | Reads the request, calls a service, sends the response | No business rules |
| `services/` | **All business rules live here** | Throws `ApiError` on refusal |
| `repositories/` | SQL queries only | No business rules |

**Direction of calls is one-way:**

```
route → controller → service → repository → database
```

A repository never calls a service. A controller never touches SQL.

---

## 3. Following one request all the way through

`PATCH /api/v1/products/12/stock` — the admin corrects stock:

| Step | File | What happens |
|---|---|---|
| 1 | `src/app.js` | `helmet` → `cors` → `express.json` → `morgan`, then matches `/products` |
| 2 | `product-catalogue/routes/product.routes.js` | Matches the route, runs its middleware chain |
| 3 | `shared/middleware/auth-admin-access-key.middleware.js` | Verifies the admin JWT, sets `req.adminSession` |
| 4 | `shared/middleware/rbac.middleware.js` | Checks the `PRODUCT_MANAGE` permission |
| 5 | `shared/middleware/request-validator.middleware.js` | Runs the zod schema from `validators/product.validator.js` |
| 6 | `product-catalogue/controllers/product.controller.js` | Calls the service, then writes an activity-log entry |
| 7 | `product-catalogue/services/product.service.js` | Applies business rules, opens a transaction |
| 8 | `product-catalogue/services/inventory.service.js` | The **only** place stock may change |
| 9 | `product-catalogue/repositories/inventory.repository.js` | Runs the SQL with `SELECT ... FOR UPDATE` |
| 10 | `shared/middleware/error-handler.middleware.js` | Only if something threw |

---

## 4. Where the validation is

Validation happens in **three separate layers**. This is deliberate defence-in-depth, and it is a strong point of the project — worth explaining in a viva.

### Layer 1 — zod schemas (shape and format)

**The engine:** `src/shared/middleware/request-validator.middleware.js`
It is a factory: you give it schemas for `params`, `query` and/or `body`, and it returns middleware that parses them before the controller runs. On failure it throws `ApiError.badRequest('VALIDATION_ERROR', ...)`.

**The schemas — 12 validator files, one or more per module:**

| Module | Files |
|---|---|
| EP-01 Product | `product-catalogue/validators/product.validator.js`, `category.validator.js` |
| EP-02 Order | `customer-order/validators/customer.validator.js`, `cart.validator.js`, `order.validator.js` |
| EP-03 Delivery | `delivery-review/validators/delivery.validator.js`, `review.validator.js` |
| EP-04 Admin | `store-administration/validators/staff.validator.js`, `role-permission.validator.js`, `store-settings.validator.js`, `activity-log.validator.js`, `admin-access-key.validator.js` |

Example, from `product.validator.js`:

```js
const createProductSchema = {
  body: z.object({
    categoryId:  z.coerce.number().int().positive(),
    name:        z.string().trim().min(1).max(150),
    description: z.string().trim().max(5000).optional(),
    price:       z.coerce.number().positive(),
  }),
};
```

Three things to note: `z.coerce` turns the string `"12"` from a URL into the number `12`; `.trim()` normalises input; and unknown fields are silently dropped, so a client **cannot** inject `customerId` or `status` into a request body.

### Layer 2 — business rules in services

Rules that need database state cannot be checked by a schema. They live in the service layer.

Examples:
- "is there enough stock right now?" → `inventory.service.js`
- "can this order move from Pending to Confirmed?" → `order.service.js`
- "has this customer actually received this product before reviewing it?" → `review.service.js`

### Layer 3 — database constraints

The final authority: `db/schema.sql`. `price > 0`, `quantity >= 0`, unique category names, foreign keys. Even if both layers above were bypassed, the database refuses bad data.

---

## 5. Where the error handling is

### The `ApiError` class

`src/shared/utils/ApiError.js` — the single error type used across the whole backend.

```js
class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
  static badRequest(code, message)   { return new ApiError(400, code, message); }
  static unauthorized(code, message) { return new ApiError(401, code, message); }
  static forbidden(code, message)    { return new ApiError(403, code, message); }
  static notFound(code, message)     { return new ApiError(404, code, message); }
  static conflict(code, message)     { return new ApiError(409, code, message); }
  static unprocessable(code, message){ return new ApiError(422, code, message); }
  static tooManyRequests(code, message) { return new ApiError(429, code, message); }
}
```

Services never throw a raw `Error` for a business refusal — always `ApiError`.

### `asyncHandler`

`src/shared/utils/asyncHandler.js` — wraps every async controller so a rejected promise goes to `next(err)` automatically. This is why you will not find `try/catch` in the controllers: it is handled once, here.

```js
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

### The global error handler

`src/shared/middleware/error-handler.middleware.js` — mounted **last** in `app.js`. It converts everything into one response shape:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "..." } }
```

What it handles, in order:

| Condition | Response |
|---|---|
| `err instanceof ApiError` | That error's own status and code |
| `entity.parse.failed` | 400 `INVALID_JSON` |
| `entity.too.large` | 413 `PAYLOAD_TOO_LARGE` |
| `ER_DUP_ENTRY` | 409 `DUPLICATE_ENTRY` |
| `ER_ROW_IS_REFERENCED(_2)` | 409 `REFERENCED_ROW` |
| `ER_CHECK_CONSTRAINT_VIOLATED` | 400 `CONSTRAINT_VIOLATED` |
| anything else | 500 — generic message in production, real message in development |

Stack traces are never sent to the client.

### Status codes used

`400` invalid input · `401` not authenticated · `403` not allowed · `404` not found · `409` conflict · `413` body too large · `422` business rule refusal · `429` too many attempts · `500` unexpected

### On the frontend

`genz-frontend/src/api/client.js` → `toApiError(err)` normalises everything — server errors, network failures, client errors — into `{ status, code, message }`, so no page needs to understand Axios internals.

---

## 6. OOP concepts — an honest account

**Be careful in your viva.** This is **not** a class-based object-oriented codebase. It is a **layered, modular codebase** written in a mostly functional style using CommonJS modules. There is exactly **one** class in the entire backend.

Claiming "we used OOP throughout" would be inaccurate and easy for an examiner to disprove. Here is what is actually there.

### The one genuine class

`ApiError` in `src/shared/utils/ApiError.js` demonstrates real OOP:

| Concept | How |
|---|---|
| **Inheritance** | `class ApiError extends Error` |
| **Constructor** | Sets `statusCode`, `code`, `name` |
| **Static factory methods** | `ApiError.notFound(...)` instead of `new ApiError(404, ...)` |
| **Polymorphism** | The error handler uses `err instanceof ApiError` to treat it differently from other errors |

### Encapsulation — enforced by module boundaries, not by `private`

The strongest example is `inventory.service.js`. Its header states that it is the **sole exposed interface** for stock, and that no other file may import `inventory.repository.js` directly. The data is hidden behind one gateway, which is the *purpose* of encapsulation, achieved through module discipline rather than access modifiers.

`actor-from-request.js` does the same for identity: one function derives `{ actorType, actorId }` so no module invents its own version.

### Immutability

`src/shared/constants/statuses.js` uses `Object.freeze()` on every status group:

```js
const ORDER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  CANCELLED: 'CANCELLED',
});
```

One source of truth, and no file can accidentally reassign a status value.

### Design patterns that *are* used

These are what you should actually talk about:

| Pattern | Where | What it does |
|---|---|---|
| **Layered architecture** | Every module | route → controller → service → repository |
| **Repository pattern** | `*/repositories/*.js` | All SQL isolated from business logic |
| **Service layer** | `*/services/*.js` | Business rules in one place |
| **Factory function** | `validate(schemas)`, `requirePermission(name)`, `asyncHandler(fn)` | Each returns configured middleware |
| **Higher-order function** | `asyncHandler` | Wraps a function and adds behaviour |
| **Singleton** | `pool` in `shared/db/connection.js` | One connection pool for the whole app |
| **Middleware chain** | `app.js` and every routes file | Composable request pipeline |
| **Facade** | `inventory.service.js` | One simple interface over complex stock rules |
| **Single source of truth** | `statuses.js`, `env.config.js` | Constants and configuration defined once |

**Suggested phrasing for your viva:** *"We used a layered modular architecture with the repository and service-layer patterns. Object-oriented techniques were applied where they added value — most clearly in the `ApiError` class hierarchy — while the rest of the codebase uses module-level encapsulation and factory functions, which is idiomatic for Node.js."*

That is accurate, and it is a stronger answer than a false claim of full OOP.

---

## 7. Authentication and authorisation

**Five separate auth middlewares**, all in `src/shared/middleware/`:

| File | Who it authenticates | Sets on `req` |
|---|---|---|
| `auth-customer.middleware.js` | Logged-in customer | `req.customer` |
| `auth-admin-access-key.middleware.js` | Owner/Admin via Access Key | `req.adminSession` |
| `auth-customer-or-admin.middleware.js` | Either of the above | whichever matched |
| `auth-courier-link.middleware.js` | Delivery person via signed link | delivery scope |
| `auth-staff.middleware.js` | Staff — **NOT IMPLEMENTED** | always returns an error |

All tokens are HS256 only. Tokens signed with a different algorithm, `alg: none`, the wrong secret, or tampered/expired tokens are all rejected with 401.

**The acting user is always taken from the verified token, never from the request body.** That single rule prevents a large class of privilege-escalation attacks.

### RBAC

`src/shared/middleware/rbac.middleware.js` exports `requirePermission(name)`:

- An Owner/Admin session passes automatically — the Access Key *is* the owner.
- A staff session is checked against `role_permissions` / `permissions` in the database.
- The staff path is fully written and ready, but unreachable until staff login exists.

Usage:

```js
router.post('/staff', authAdminAccessKey, requirePermission('STAFF_MANAGE'), controller.createStaff);
```

### Rate limiting

`src/shared/middleware/customer-login-rate-limit.middleware.js` — 5 failed attempts per IP + contact within 15 minutes, then 429. Counters are held in memory (see issue #6 in `DEPLOYMENT_ISSUES_TO_FIX.md`).

---

## 8. Database access and transactions

**Everything goes through `src/shared/db/connection.js`.** It exports two things:

| Export | Use |
|---|---|
| `pool` | Normal single queries |
| `withTransaction(work)` | Multi-step changes that must be atomic |

```js
async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
```

**Three rules the codebase follows:**

1. **All SQL is parameterised** with `?` placeholders (mysql2), so input can never be executed as SQL.
2. **Rows that two requests might change at once are locked** with `SELECT ... FOR UPDATE` — stock, delivery, review, customer and password-reset. (Order rows are the known exception.)
3. **`decimalNumbers: false`** keeps MySQL `DECIMAL` columns as strings, avoiding floating-point rounding errors on prices.

---

## 9. Frontend structure

```
genz-frontend/src/
├── main.jsx        ← React entry
├── App.jsx         ← all routes
├── api/            ← 15 files: ALL backend calls live here
├── context/        ← 4 global state providers
├── hooks/          ← 4 reusable hooks
├── pages/          ← 21 storefront + 11 admin pages
├── components/     ← reusable UI, grouped by purpose
├── layouts/        ← StorefrontLayout, AdminLayout
├── styles/         ← theme.css (design tokens) + global.css
└── utils/          ← formatting, constants, enrichOrder
```

### The API layer

`src/api/client.js` is the single Axios instance. Its notable feature is **dual authentication**: because the backend has two unrelated session types, each call declares which token it needs.

```js
apiClient.interceptors.request.use((config) => {
  if (config.authAs === "customer") { /* attach customer token */ }
  else if (config.authAs === "admin") { /* attach admin token */ }
  return config;
});
```

Tokens are kept in `localStorage` under `genz_customer_token` and `genz_admin_token`. A 401 fires a browser event (`genz:customer-unauthorized` / `genz:admin-unauthorized`) so the matching context can clear itself and the UI never shows a logged-in state the backend has rejected.

### State management

No Redux. Four React contexts in `src/context/`:

| Context | Holds |
|---|---|
| `CustomerAuthContext` | Customer session and profile |
| `AdminAuthContext` | Admin session |
| `CartContext` | Shopping cart |
| `ToastContext` | Notification messages |

### Route protection

`src/components/routing/ProtectedRoute.jsx` and `AdminProtectedRoute.jsx` guard customer-only and admin-only pages.

### Styling

CSS Modules — every component has its own `.module.css`, so class names cannot collide. Shared design tokens (colours, spacing, fonts) live in `src/styles/theme.css`. No Tailwind, no TypeScript, matching the backend's plain-JavaScript convention.

---

## 10. Tests

```
tests/
├── setup-env.js      ← sets fake env vars so config loads in tests
├── unit/             ← 46 suites, 712 tests, ALL PASSING
│   ├── config/
│   ├── modules/      ← mirrors the src/modules structure
│   └── shared/
└── integration/      ← EMPTY
```

Run them with (note: use this form, because the `&` in the folder name breaks `npx`):

```bash
cd "C:/Users/Shasoo/Desktop/ISPM & EA - sub modification - Copy/genz-backend/genz-backend" && node ./node_modules/jest/bin/jest.js
```

The tests mirror the source layout, so the test for `product.service.js` is at `tests/unit/modules/product-catalogue/services/product.service.test.js`.

---

## 11. Quick lookup — "where do I find...?"

| I want to... | Go to |
|---|---|
| Add a new API endpoint | `modules/<module>/routes/*.routes.js` |
| Change what input is accepted | `modules/<module>/validators/*.validator.js` |
| Change a business rule | `modules/<module>/services/*.service.js` |
| Change a SQL query | `modules/<module>/repositories/*.repository.js` |
| Add a new error type | `shared/utils/ApiError.js` |
| Change how errors are returned | `shared/middleware/error-handler.middleware.js` |
| Change who can access what | `shared/middleware/rbac.middleware.js` |
| Add an environment variable | `config/env.config.js` **and** `.env.example` |
| Change a status value | `shared/constants/statuses.js` |
| Change the database structure | `db/schema.sql` |
| Change stock logic | `product-catalogue/services/inventory.service.js` only |
| Add a frontend page | `genz-frontend/src/pages/`, then register it in `App.jsx` |
| Add a backend call from React | `genz-frontend/src/api/` |
| Change colours or spacing | `genz-frontend/src/styles/theme.css` |

---

## 12. The five ideas that explain this codebase

1. **One direction of flow.** route → controller → service → repository. Never backwards.
2. **Three layers of validation.** Schema for shape, service for business rules, database for the final word.
3. **One error type, one error shape.** `ApiError` everywhere, one global handler, one JSON envelope.
4. **One owner per piece of data.** Only `inventory.service.js` may touch stock. Only EP-01 owns products.
5. **One source of truth for everything shared.** Config, statuses, the database pool, the API client — each defined exactly once.
