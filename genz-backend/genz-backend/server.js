/**
 * server.js
 * Entry point — starts the HTTP server. Kept separate from app.js so the
 * Express app itself can be imported directly by integration tests
 * (tests/integration/) without binding a port.
 */

const app = require('./src/app');
const config = require('./src/config/env.config');

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Gen-Z Digital Storefront API listening on port ${config.port} [${config.env}]`);
  // eslint-disable-next-line no-console
  console.log(`API base path: ${config.apiPrefix}`);
});
