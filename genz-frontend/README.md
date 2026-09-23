# Gen-Z Digital Storefront — Frontend

React (Vite) frontend for the Gen-Z Digital Storefront, integrating against the completed `genz-backend` API. Men's & boys' fashion and fragrances — modern, premium, maroon/burgundy + black + white brand identity.

## Stack

React 19, Vite, React Router 7, Axios, plain CSS with CSS Modules and a design-token theme (`src/styles/theme.css`) — no CSS framework, no TypeScript (matching the backend's JavaScript convention).

## Setup

```bash
npm install
cp .env.example .env   # set VITE_API_URL to your running genz-backend
npm run dev
```

The backend must be running separately (see `genz-backend/genz-backend/README.md`) — this app makes no mock/fake API calls; every page talks to the real backend.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build
- `npm run lint` — oxlint

## Structure

```
src/
├── api/          one file per backend resource — the only place axios is used
├── components/   ui/ (generic), product/, cart/, forms/, admin/, layout/, search/, routing/
├── context/      CustomerAuthContext, AdminAuthContext, CartContext, ToastContext
├── hooks/        useDebounce, useCategories, useProductSearch, useDocumentTitle
├── layouts/      StorefrontLayout, AdminLayout
├── pages/        one file per route; pages/admin/ for the /admin/* area
├── styles/       theme.css (tokens), global.css (resets/base)
└── utils/        format.js, constants.js, enrichOrder.js
```

## Architecture notes

- **Two separate auth sessions.** A Customer JWT (register/login) and an Owner/Admin Access Key session are entirely different backend concepts — `src/api/client.js` sends the right one per call via an `authAs: "customer" | "admin"` option, never both.
- **Cart requires login.** The backend has no guest cart (a resolved OPEN decision) — `/cart` is customer-authenticated only.
- **No invented endpoints.** Every call in `src/api/*.js` maps 1:1 to a documented `genz-backend` route. Known gaps in the *backend's* own API surface are handled honestly rather than worked around:
  - No admin-facing "look up delivery by order" endpoint exists — `AdminOrderDetailsPage` explains this rather than guessing.
- **Product images.** `product_images.image_reference` is an R2 object key, not a URL — see `VITE_R2_PUBLIC_BASE_URL` in `.env.example`. Product list responses don't include images at all (only the single-product detail endpoint does), so grid cards intentionally show a styled placeholder, not a broken image.
