/**
 * app.js
 * Assembles the Express application: global middleware, then each module's
 * router mounted under its base path (Backend/API Architecture Design V1.0,
 * Section 5 — Module-to-Route Mapping), then the global error handler last.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config/env.config');
const errorHandler = require('./shared/middleware/error-handler.middleware');

// Module A — fully implemented
const { productRoutes, categoryRoutes } = require('./modules/product-catalogue/routes');

// Module B — Customer registration implemented; Customer login, Cart, and
// Orders are stubbed/blocked pending OPEN decisions (see routes/index.js)
const { customerAuthRoutes, cartRoutes, orderRoutes } = require('./modules/customer-order/routes');

// Module C — Delivery retrieval/status-advance and Review submission/
// listing/moderation-queue implemented; Delivery creation and the
// moderation action itself are blocked (see routes/index.js)
const { deliveryRoutes, reviewRoutes, productReviewsRoutes, orderDeliveryRoutes } = require('./modules/delivery-review/routes');

// Module D — Access Key flow implemented, remainder stubbed
const {
  adminAccessKeyRoutes,
  staffRoutes,
  roleRoutes,
  permissionRoutes,
  settingsRoutes,
  dashboardRoutes,
  activityLogRoutes,
} = require('./modules/store-administration/routes');

const app = express();

// ---- Global middleware ----
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// ---- Health check (not part of any module — infrastructure only) ----
app.get('/health', (req, res) => res.status(200).json({ data: { status: 'ok' } }));

// ---- Module routes, mounted per Section 5's mapping ----
const prefix = config.apiPrefix;

app.use(`${prefix}/products`, productRoutes);
// Module C's GET /products/:id/reviews is mounted at the same prefix,
// alongside (not instead of) Module A's productRoutes — see
// product-reviews.routes.js for why this path is Module C's, not A's.
app.use(`${prefix}/products`, productReviewsRoutes);
app.use(`${prefix}/categories`, categoryRoutes);

app.use(`${prefix}/auth/customer`, customerAuthRoutes);
app.use(`${prefix}/cart`, cartRoutes);
app.use(`${prefix}/orders`, orderRoutes);
// Module C's GET /orders/:id/delivery is mounted at the same prefix,
// alongside (not instead of) Module B's orderRoutes.
app.use(`${prefix}/orders`, orderDeliveryRoutes);

app.use(`${prefix}/deliveries`, deliveryRoutes);
app.use(`${prefix}/reviews`, reviewRoutes);

app.use(`${prefix}/admin`, adminAccessKeyRoutes);
app.use(`${prefix}/staff`, staffRoutes);
app.use(`${prefix}/roles`, roleRoutes);
app.use(`${prefix}/permissions`, permissionRoutes);
app.use(`${prefix}/settings`, settingsRoutes);
app.use(`${prefix}/dashboard`, dashboardRoutes);
app.use(`${prefix}/activity-log`, activityLogRoutes);

// ---- 404 for anything not matched above ----
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` } });
});

// ---- Global error handler (must be last) ----
app.use(errorHandler);

module.exports = app;
