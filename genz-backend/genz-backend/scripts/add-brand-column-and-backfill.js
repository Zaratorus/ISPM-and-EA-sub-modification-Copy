/**
 * scripts/add-brand-column-and-backfill.js
 * One-off migration for the `brand` column added to `products` (see
 * db/schema.sql). schema.sql is only applied on a fresh database — this
 * script brings an ALREADY-RUNNING database up to date: adds the column if
 * it's missing, then backfills brand values on the current demo catalogue
 * by product name. Safe to re-run (idempotent both steps).
 *
 * Usage: node scripts/add-brand-column-and-backfill.js
 */
require('dotenv').config();
const { pool } = require('../src/shared/db/connection');

const BRAND_BY_PRODUCT_NAME = {};

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].n > 0;
}

async function main() {
  if (!(await columnExists('products', 'brand'))) {
    await pool.query('ALTER TABLE products ADD COLUMN brand VARCHAR(100) NULL AFTER category_id');
    await pool.query('ALTER TABLE products ADD INDEX idx_products_brand (brand)');
    console.log('Added products.brand column + index.');
  } else {
    console.log('products.brand already exists — skipping ALTER TABLE.');
  }

  for (const [name, brand] of Object.entries(BRAND_BY_PRODUCT_NAME)) {
    const [result] = await pool.query('UPDATE products SET brand = ? WHERE name = ?', [brand, name]);
    console.log(`${name} -> ${brand} (${result.affectedRows} row${result.affectedRows === 1 ? '' : 's'})`);
  }

  console.log('Brand backfill complete.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
