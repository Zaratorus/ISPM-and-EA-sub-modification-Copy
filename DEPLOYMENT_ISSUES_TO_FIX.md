# Gen-Z Digital Storefront — Issues To Fix Before Deployment

**Reviewed:** 2026-09-21
**Scope:** `genz-backend/genz-backend/` and `genz-frontend/`
**Method:** read-only inspection. Test suite executed, frontend build executed. No project file was changed.

---

## First, what is already working

Do not rewrite these. They are fine.

| Check | Result |
|---|---|
| Backend tests | **712 tests, 46 suites, all passing** (~21 seconds) |
| Frontend production build | **Succeeds in 2.5s**, code-split, main bundle 231 kB (71 kB gzipped) |
| Database schema | 22 InnoDB tables with foreign keys, CHECK and UNIQUE constraints |
| Input validation | A zod schema on every route, parameterised SQL everywhere |
| Secret strength check | Server refuses to start on missing / placeholder / short secrets |
| Security headers | `helmet()` enabled, `X-Powered-By` removed |

The problems below are **deployment and configuration problems**, not bad code.

---

## Summary table

| # | Issue | Severity | Effort |
|---|---|---|---|
| 1 | Backend crashes on startup in production (mail config) | **Critical** | 5 min |
| 2 | Project is not under version control | **Critical** | 15 min |
| 3 | CORS allows every website on the internet | **Critical** | 10 min |
| 4 | No deployment configuration files exist | **Critical** | 1 hour |
| 5 | Staff can never log in | High | Design decision |
| 6 | Rate limiters stored in server memory | High | 30 min |
| 7 | `trust proxy` not set — IP rate limiting breaks behind a load balancer | High | 2 min |
| 8 | No graceful shutdown | High | 15 min |
| 9 | Zero integration tests | High | 1–2 days |
| 10 | No database migration tooling | High | 2 hours |
| 11 | `ADMIN_ACCESS_KEY_RAW` still present in `.env` | High | 2 min |
| 12 | Code comments contradict the actual code | Medium | 30 min |
| 13 | No token revocation or server-side logout | Medium | Design decision |
| 14 | Courier links never expire | Medium | 1 hour |
| 15 | Order rows not locked during status change | Medium | 1 hour |
| 16 | Registration not rate limited | Medium | 20 min |
| 17 | Folder name contains `&`, breaking npm on Windows | Medium | 5 min |

---

# CRITICAL — deployment fails or is unsafe

## 1. The backend will not start in production

**What is wrong**
`MAIL_TRANSPORT` defaults to `console`. The config file rejects `console` whenever `NODE_ENV` is anything other than `development`, and throws an error that stops the process.

Your `.env` file contains **no mail settings at all**. The keys exist in `.env.example` but were never copied across. Missing: `MAIL_TRANSPORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.

**Why it matters**
The moment you set `NODE_ENV=production`, the server exits before it accepts a single request. This is the first thing that will happen on Render or Railway.

**Where**
`genz-backend/genz-backend/src/config/env.config.js:67-80` — the `mailConfig()` function

**Fix**
Set these seven variables in your hosting platform's environment settings (not in a file):

```
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-address@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM="Gen-Z Store <no-reply@yourdomain.com>"
```

For Gmail you need an **App Password**, not your normal account password.

---

## 2. The project is not under version control

**What is wrong**
The only git repository found is rooted at `C:\Users\Shasoo` — your entire home folder. The current branch `inventory` has **zero commits**. The project itself has never been committed anywhere.

**Why it matters**
Render, Railway and Vercel all deploy by pulling from a git repository. Without one there is no deployment path. You also have no backup and no history — and the folder is named "- Copy", which suggests you are versioning by duplicating folders.

**Fix**
Create a real repository inside the project folder:

```bash
cd "C:/Users/Shasoo/Desktop/ISPM & EA - sub modification - Copy" && git init && git add . && git commit -m "Initial commit"
```

Before committing, confirm `.env` files are ignored. The backend `.gitignore` already lists `.env` — check the frontend's does too. **Never commit a `.env` file.**

---

## 3. CORS allows every website on the internet

**What is wrong**
`app.use(cors())` with no options allows requests from any origin.

**Why it matters**
Combined with session tokens stored in browser `localStorage`, any malicious website can call your API. This is listed in your own `GEN-Z_Validation_and_Security_by_Epic.docx` §9 as a known gap.

**Where**
`genz-backend/genz-backend/src/app.js:43`

**Fix**
Restrict it to your real frontend address:

```js
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({ origin: allowedOrigins }));
```

Then set `CORS_ALLOWED_ORIGINS` to your deployed frontend URL.

---

## 4. No deployment configuration exists

**What is wrong**
Searched the whole project: no `Dockerfile`, no `render.yaml`, no `Procfile`, no `vercel.json`, no `.github/` folder. Nothing tells a hosting platform how to build or run this.

**Why it matters**
Platforms can sometimes guess a Node project, but with your **nested `genz-backend/genz-backend/` folder** auto-detection will very likely fail.

**Fix**
Decide the platform first, then add its config file. Also note the nested folder: your backend root is `genz-backend/genz-backend/`, not `genz-backend/`. You must tell the platform this, or flatten the folder.

---

# HIGH — it runs, but behaves incorrectly

## 5. Staff can never log in

**What is wrong**
The staff authentication middleware is a placeholder that always returns the error `STAFF_AUTH_NOT_IMPLEMENTED`.

**Why it matters**
EP-04 lets you create staff accounts, assign roles and grant permissions — but no staff member can ever use them. The RBAC permission-checking code is written and ready; only the login entry point is missing. A whole approved epic is partially non-functional.

**Where**
`genz-backend/genz-backend/src/shared/middleware/auth-staff.middleware.js:36`

**Fix**
This is **DEC-01**, an open decision awaiting your supervisor. It is not just a coding task. Either resolve the decision and implement it, or state clearly in your report that staff login is out of scope for this release.

---

## 6. Rate limiters live in server memory

**What is wrong**
Both the customer-login and admin-access-key limiters keep their counters in a plain object in the Node process.

**Why it matters**
Counters reset on every restart, and are not shared between instances. Free-tier hosting sleeps and restarts constantly, so an attacker can reset the limit simply by waiting or by retrying until the dyno restarts. Brute-force protection effectively disappears in production.

**Fix**
For an academic demo, document it as an accepted limitation. For a real deployment, move the counters to the database or Redis.

---

## 7. `trust proxy` is not set

**What is wrong**
`app.set('trust proxy', ...)` appears nowhere in the codebase.

**Why it matters**
Behind Render's or Vercel's load balancer, `req.ip` returns the **proxy's** address, not the visitor's. Every user then shares one rate-limit counter: five failed logins from anyone locks out everyone, and an attacker is never isolated.

**Fix**
Add to `app.js`, before the middleware:

```js
app.set('trust proxy', 1);
```

---

## 8. No graceful shutdown

**What is wrong**
`server.js` calls `app.listen()` and nothing else. There is no `SIGTERM` handler and the MySQL pool is never closed.

**Why it matters**
Hosting platforms stop apps by sending `SIGTERM` on every deploy and restart. Requests in flight are cut mid-transaction and database connections are left dangling.

**Where**
`genz-backend/genz-backend/server.js`

**Fix**

```js
const server = app.listen(config.port, () => { /* existing logs */ });

process.on('SIGTERM', () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});
```

---

## 9. There are no integration tests

**What is wrong**
The `tests/integration/` folder exists but is **completely empty**. All 712 passing tests are unit tests with a mocked database.

**Why it matters**
No code path has ever run against real MySQL. Your transactions, `SELECT ... FOR UPDATE` row locks, foreign keys and CHECK constraints are the core of your correctness story — and none of them has been executed even once. A passing test suite is currently not evidence that the system works end to end.

**Fix**
The comment at the top of `server.js` says the app was deliberately split from the entry point so integration tests could import it. Use that. Even five tests against a real test database (register → login → cart → order → stock decrease) would be a large improvement, and would be strong evidence for your report.

---

## 10. No database migration tooling

**What is wrong**
There is a single `db/schema.sql` applied by hand. No migration tool, no versioning, no rollback.

**Why it matters**
Every schema change means manually re-running SQL on the live database, with no record of what was applied. Easy to get wrong, impossible to undo cleanly.

**Fix**
For an academic project, `schema.sql` plus a documented apply procedure is acceptable — but document it explicitly.

---

## 11. `ADMIN_ACCESS_KEY_RAW` is still in `.env`

**What is wrong**
The variable is still present with a value. Your own `.env.example` says it is used **only once** by `scripts/set-admin-access-key.js` and should then be removed.

**Why it matters**
It is the plaintext master key to the entire admin panel, sitting in a file inside a folder you have already duplicated at least once ("- Copy").

**Fix**
Remove the line after seeding. Never set it on the hosting platform.

---

# MEDIUM

## 12. Comments contradict the code

Several file headers describe an older state of the project and are now wrong:

| File | Claims | Reality |
|---|---|---|
| `src/app.js:20` | Cart and Orders are "stubbed/blocked" | Both fully implemented |
| `src/modules/delivery-review/routes/index.js:10` | Review moderation is "NOT IMPLEMENTED" | Implemented at `review.routes.js:40` |
| `genz-backend/README.md` | — | Out of date (already noted in your own security doc) |

**Why it matters:** anyone deploying or grading this will read the comments first and conclude features are missing when they are not. Fixing the comments costs nothing and directly protects your marks.

---

## 13. No token revocation or server-side logout

Logging out only deletes the token from the browser. The token stays valid until it expires — **7 days** for customers, **12 hours** for admin — and survives a password reset. A stolen token cannot be cancelled.

Your documentation records this as an approved design decision. Keep it, but state it clearly as a known limitation.

---

## 14. Courier links never expire

A signed delivery link works forever and cannot be cancelled individually. The token is visible in the courier's address bar and browser history, and will be shared over WhatsApp.

**Fix:** add an expiry timestamp inside the signed payload.

---

## 15. Order rows are not locked during status changes

Stock, delivery, review and customer rows use `SELECT ... FOR UPDATE`. **Order rows do not.** Two admins acting on the same order at the same time can both succeed.

---

## 16. Registration is not rate limited

Login is limited to 5 attempts; registration has no limit at all. A script can create unlimited accounts — and since password reset sends email, this can also be used to send mail through your SMTP account.

---

## 17. The folder name contains `&`

`ISPM & EA - sub modification - Copy` breaks `npm` and `npx` on Windows. I hit this while reviewing: `npx jest` failed with `Cannot find module 'C:\Users\Shasoo\Desktop\jest\bin\jest.js'` because the shell split the path at the `&`.

**Fix:** rename to something like `ISPM-EA-project`. This will bite you during deployment scripting if left alone.

---

# Recommended order of work

### Path A — demo deployment (about one day)

1. Add the seven mail variables (#1)
2. `git init` and commit (#2)
3. Lock down CORS (#3)
4. Add `trust proxy` (#7)
5. Add graceful shutdown (#8)
6. Remove `ADMIN_ACCESS_KEY_RAW` (#11)
7. Rename the folder (#17)
8. Write the platform config and deploy (#4)
9. Fix the misleading comments (#12)

### Path B — production quality (1–2 further weeks)

10. Write integration tests (#9)
11. Move rate limiters to shared storage (#6)
12. Add order row locking (#15) and registration rate limiting (#16)
13. Add courier link expiry (#14)
14. Resolve staff authentication, DEC-01 (#5)
15. Decide on token revocation (#13)

---

# For your report

Items **5, 6, 9, 13 and 14** are worth writing up as *known limitations with justification* rather than hiding. Examiners reward a team that knows exactly where its system is weak and can explain why. That is also exactly the material your IE3101 risk register needs.
