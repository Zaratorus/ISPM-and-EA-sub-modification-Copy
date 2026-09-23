/**
 * Module B (EP-02 — Customer & Order Management) route index.
 * Fully implemented: registration, login, Cart, and the complete Order
 * lifecycle including cancellation. See Backend/API Architecture Design
 * V1.0, Section 6, for the full documented contract.
 */

const customerAuthRoutes = require('./customer-auth.routes');
const cartRoutes = require('./cart.routes');
const orderRoutes = require('./order.routes');

module.exports = { customerAuthRoutes, cartRoutes, orderRoutes };
