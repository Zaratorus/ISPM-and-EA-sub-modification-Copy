/**
 * scripts/add-variant-support.js
 * One-off migration for the size/age variant selector (see db/schema.sql):
 *   - categories.variant_type (NONE/SIZE/AGE)
 *   - product_out_of_stock_variants (which chips are disabled per product)
 *   - cart_items.variant_label + the widened unique key
 * schema.sql only applies to a fresh database — this brings an
 * ALREADY-RUNNING one up to date. Safe to re-run (every step checks
 * first).
 *
 * Usage: node scripts/add-variant-support.js
 */
require('dotenv').config();
const { pool } = require('../src/shared/db/connection');

// Maps a product name to the chip labels that should be marked out of
// stock for it — populate as needed via an admin UI or a one-off script
// run; none exists yet (see product.service.js's outOfStockVariants comment).
const OUT_OF_STOCK_BY_PRODUCT_NAME = {};

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].n > 0;
}

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows[0].n > 0;
}

async function indexExists(table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return rows[0].n > 0;
}

async function main() {
  // 1) categories.variant_type
  if (!(await columnExists('categories', 'variant_type'))) {
    await pool.query(
      "ALTER TABLE categories ADD COLUMN variant_type ENUM('NONE','SIZE','AGE') NOT NULL DEFAULT 'NONE'"
    );
    console.log('Added categories.variant_type.');
  } else {
    console.log('categories.variant_type already exists — skipping.');
  }
  await pool.query("UPDATE categories SET variant_type = 'AGE' WHERE name LIKE 'Kids%' OR name LIKE 'Boys%'");
  await pool.query("UPDATE categories SET variant_type = 'SIZE' WHERE name LIKE '%Clothing%' AND name NOT LIKE 'Kids%' AND name NOT LIKE 'Boys%'");
  const [catRows] = await pool.query('SELECT name, variant_type FROM categories ORDER BY name');
  for (const c of catRows) console.log(`  category "${c.name}" -> variant_type=${c.variant_type}`);

  // 2) product_out_of_stock_variants
  if (!(await tableExists('product_out_of_stock_variants'))) {
    await pool.query(`
      CREATE TABLE product_out_of_stock_variants (
        product_id      BIGINT UNSIGNED NOT NULL,
        variant_label   VARCHAR(20) NOT NULL,
        PRIMARY KEY (product_id, variant_label),
        CONSTRAINT fk_oos_variants_product
          FOREIGN KEY (product_id) REFERENCES products(product_id)
          ON DELETE CASCADE ON UPDATE RESTRICT
      ) ENGINE=InnoDB
    `);
    console.log('Created product_out_of_stock_variants.');
  } else {
    console.log('product_out_of_stock_variants already exists — skipping.');
  }

  for (const [name, labels] of Object.entries(OUT_OF_STOCK_BY_PRODUCT_NAME)) {
    const [[product]] = await pool.query('SELECT product_id FROM products WHERE name = ?', [name]);
    if (!product) {
      console.log(`  (skip) product not found: ${name}`);
      continue;
    }
    for (const label of labels) {
      await pool.query(
        'INSERT IGNORE INTO product_out_of_stock_variants (product_id, variant_label) VALUES (?, ?)',
        [product.product_id, label]
      );
    }
    console.log(`  ${name} -> out of stock: ${labels.join(', ')}`);
  }

  // 3) cart_items.variant_label + widened unique key
  if (!(await columnExists('cart_items', 'variant_label'))) {
    await pool.query("ALTER TABLE cart_items ADD COLUMN variant_label VARCHAR(20) NOT NULL DEFAULT '' AFTER product_id");
    console.log('Added cart_items.variant_label.');
  } else {
    console.log('cart_items.variant_label already exists — skipping.');
  }
  // Add the new (wider) key BEFORE dropping the old one: fk_cart_items_cart
  // (on cart_id) needs SOME index with cart_id as its leftmost column at all
  // times, and uq_cart_items_cart_product is currently the only one — MySQL
  // refuses to drop it otherwise (ER_DROP_INDEX_FK).
  if (!(await indexExists('cart_items', 'uq_cart_items_cart_product_variant'))) {
    await pool.query(
      'ALTER TABLE cart_items ADD UNIQUE KEY uq_cart_items_cart_product_variant (cart_id, product_id, variant_label)'
    );
    console.log('Added widened cart_items unique key (cart_id, product_id, variant_label).');
  } else {
    console.log('Widened cart_items unique key already exists — skipping.');
  }
  if (await indexExists('cart_items', 'uq_cart_items_cart_product')) {
    await pool.query('ALTER TABLE cart_items DROP INDEX uq_cart_items_cart_product');
    console.log('Dropped old cart_items unique key (cart_id, product_id).');
  }

  console.log('Variant support migration complete.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
