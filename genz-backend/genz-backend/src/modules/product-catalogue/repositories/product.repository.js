/**
 * product.repository.js
 * Direct data access for `products` and `product_images` only.
 * `inventory_stock` has its own repository (inventory.repository.js) because
 * it is conceptually a distinct owned entity, even though it shares its
 * primary key with Product (Physical Schema Design V1.0, Section 2/3).
 */

const { pool, withTransaction } = require('../../../shared/db/connection');

const BASE_SELECT = `
  SELECT p.product_id, p.category_id, p.name, p.description, p.price, p.status,
         p.created_at, p.updated_at,
         i.quantity AS stock_quantity, i.availability_status
    FROM products p
    LEFT JOIN inventory_stock i ON i.product_id = p.product_id
`;

/**
 * @param {{ categoryId?: number, name?: string, minPrice?: number, maxPrice?: number, page: number, limit: number }} filters
 */
async function search(filters) {
  const where = ['p.status = "ACTIVE"'];
  const params = [];

  if (filters.categoryId) {
    where.push('p.category_id = ?');
    params.push(filters.categoryId);
  }
  if (filters.name) {
    where.push('p.name LIKE ?');
    params.push(`%${filters.name}%`);
  }
  if (filters.minPrice != null) {
    where.push('p.price >= ?');
    params.push(filters.minPrice);
  }
  if (filters.maxPrice != null) {
    where.push('p.price <= ?');
    params.push(filters.maxPrice);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (filters.page - 1) * filters.limit;

  const [rows] = await pool.query(
    `${BASE_SELECT} ${whereClause} ORDER BY p.name ASC LIMIT ? OFFSET ?`,
    [...params, filters.limit, offset]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM products p ${whereClause}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(productId) {
  const [rows] = await pool.query(`${BASE_SELECT} WHERE p.product_id = ?`, [productId]);
  return rows[0] || null;
}

/** Includes DISCONTINUED products too — for admin-only lookups. */
async function findByIdIncludingDiscontinued(productId, conn = pool) {
  const [rows] = await conn.query(
    'SELECT product_id, category_id, name, description, price, status FROM products WHERE product_id = ?',
    [productId]
  );
  return rows[0] || null;
}

async function findImages(productId) {
  const [rows] = await pool.query(
    'SELECT product_image_id, image_reference, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC',
    [productId]
  );
  return rows;
}

/**
 * Batch-loads every image for a set of product IDs in one query (used by
 * search() to populate each result's `images` array without N+1 queries —
 * ProductCard.jsx already reads `product.images?.[0]?.image_reference`,
 * this just supplies the data it was always expecting).
 */
async function findImagesByProductIds(productIds) {
  if (!productIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT product_id, product_image_id, image_reference, sort_order
       FROM product_images
      WHERE product_id IN (?)
      ORDER BY product_id ASC, sort_order ASC`,
    [productIds]
  );
  const byProduct = new Map();
  for (const row of rows) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
    byProduct.get(row.product_id).push(row);
  }
  return byProduct;
}

/**
 * Product creation and its corresponding Inventory/Stock row (1:1, Physical
 * Schema Design V1.0 Section 2) must be created atomically — a Product must
 * never exist without an Inventory/Stock row. Both inserts run on the same
 * transaction connection; either both commit or both roll back (audit
 * correction, see Phase 3A/3B audit report).
 */
async function create({ categoryId, name, description, price }) {
  const productId = await withTransaction(async (conn) => {
    const [result] = await conn.query(
      'INSERT INTO products (category_id, name, description, price, status) VALUES (?, ?, ?, ?, "ACTIVE")',
      [categoryId, name, description ?? null, price]
    );
    await conn.query('INSERT INTO inventory_stock (product_id, quantity) VALUES (?, ?)', [result.insertId, 0]);
    return result.insertId;
  });
  return findById(productId);
}

async function update(productId, { categoryId, name, description, price }) {
  await pool.query(
    'UPDATE products SET category_id = ?, name = ?, description = ?, price = ? WHERE product_id = ?',
    [categoryId, name, description ?? null, price, productId]
  );
  return findById(productId);
}

async function discontinue(productId) {
  // Soft-delete only, per Physical Schema Design V1.0 Section 9's RESTRICT
  // policy on Product's child references — a hard DELETE is never issued.
  await pool.query('UPDATE products SET status = "DISCONTINUED" WHERE product_id = ?', [productId]);
  return findById(productId);
}

async function addImage(productId, { imageReference, sortOrder }) {
  const [result] = await pool.query(
    'INSERT INTO product_images (product_id, image_reference, sort_order) VALUES (?, ?, ?)',
    [productId, imageReference, sortOrder ?? 0]
  );
  return { productImageId: result.insertId, imageReference, sortOrder: sortOrder ?? 0 };
}

module.exports = {
  search,
  findById,
  findByIdIncludingDiscontinued,
  findImages,
  findImagesByProductIds,
  create,
  update,
  discontinue,
  addImage,
};
