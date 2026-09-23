/**
 * Module A (EP-01) route index.
 * Mounted in src/app.js at:
 *   `${API_PREFIX}/products`   -> productRoutes
 *   `${API_PREFIX}/categories` -> categoryRoutes
 */

module.exports = {
  productRoutes: require('./product.routes'),
  categoryRoutes: require('./category.routes'),
};
