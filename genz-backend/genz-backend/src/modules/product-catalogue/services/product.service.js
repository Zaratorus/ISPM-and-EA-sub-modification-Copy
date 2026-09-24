/**
 * product.service.js
 * Business logic for Product browsing/search and admin CRUD.
 * Manual stock adjustment (a permitted stock-mutation flow, per revised
 * DEC-05 and Physical Schema Design V1.0 Section 24) lives HERE, not in a separate
 * file — it is Module A's own internal editing capability, distinct from
 * the decreaseStock/increaseStock request pattern used by other modules.
 *
 * Product create/edit/discontinue each write one Activity Log entry
 * (Detailed System Architecture V1.2, Section 19 / Database Architecture
 * V1.1, Section 21: "Product changes (create/edit/delete) — Module A" is
 * one of the operations required to generate an audit record), following
 * the same actor-handling and logActivity() call shape already used by
 * every other module's own-entity CRUD (e.g. staff.service.js's
 * createStaff/updateStaff/deactivateStaff).
 */

const { withTransaction } = require('../../../shared/db/connection');
const productRepository = require('../repositories/product.repository');
const categoryRepository = require('../repositories/category.repository');
const inventoryRepository = require('../repositories/inventory.repository');
const ApiError = require('../../../shared/utils/ApiError');
const activityLogService = require('../../store-administration/services/activity-log.service');
const { variantTypeOfLabel } = require('../../../shared/constants/variants');

async function searchProducts({ categoryId, name, brand, variant, minPrice, maxPrice, page = 1, limit = 20 }) {
  const variantType = variant ? variantTypeOfLabel(variant) : null;
  // An unrecognized `variant` value can't match anything real — short-circuit
  // to an empty result instead of silently ignoring the filter.
  if (variant && !variantType) {
    return { data: [], meta: { page, limit, total: 0 } };
  }
  const { rows, total } = await productRepository.search({
    categoryId,
    name,
    brand,
    variant,
    variantType,
    minPrice,
    maxPrice,
    page,
    limit,
  });
  const productIds = rows.map((r) => r.product_id);
  const [imagesByProduct, outOfStockByProduct] = await Promise.all([
    productRepository.findImagesByProductIds(productIds),
    productRepository.findOutOfStockVariantsByProductIds(productIds),
  ]);
  const data = rows.map((row) => ({
    ...row,
    images: imagesByProduct.get(row.product_id) || [],
    outOfStockVariants: outOfStockByProduct.get(row.product_id) || [],
  }));
  return {
    data,
    meta: { page, limit, total },
  };
}

async function getProductDetail(productId) {
  const product = await productRepository.findById(productId);
  if (!product || product.status === 'DISCONTINUED') {
    throw ApiError.notFound('PRODUCT_NOT_FOUND', `Product ${productId} does not exist.`);
  }
  const [images, outOfStockByProduct] = await Promise.all([
    productRepository.findImages(productId),
    productRepository.findOutOfStockVariantsByProductIds([productId]),
  ]);
  return { ...product, images, outOfStockVariants: outOfStockByProduct.get(Number(productId)) || [] };
}

async function createProduct({ categoryId, name, description, price, brand }, actor) {
  const category = await categoryRepository.findById(categoryId);
  if (!category) {
    throw ApiError.badRequest('CATEGORY_NOT_FOUND', `Category ${categoryId} does not exist.`);
  }
  const product = await productRepository.create({ categoryId, name, description, price, brand });

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'PRODUCT_CREATED',
    affectedEntityType: 'Product',
    affectedEntityId: product.product_id,
    originatingModule: 'A',
  });

  return product;
}

async function updateProduct(productId, { categoryId, name, description, price, brand }, actor) {
  const existing = await productRepository.findByIdIncludingDiscontinued(productId);
  if (!existing) {
    throw ApiError.notFound('PRODUCT_NOT_FOUND', `Product ${productId} does not exist.`);
  }
  if (categoryId) {
    const category = await categoryRepository.findById(categoryId);
    if (!category) {
      throw ApiError.badRequest('CATEGORY_NOT_FOUND', `Category ${categoryId} does not exist.`);
    }
  }
  const product = await productRepository.update(productId, {
    categoryId: categoryId ?? existing.category_id,
    name: name ?? existing.name,
    description: description ?? existing.description,
    price: price ?? existing.price,
    brand: brand ?? existing.brand,
  });

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'PRODUCT_UPDATED',
    affectedEntityType: 'Product',
    affectedEntityId: productId,
    originatingModule: 'A',
  });

  return product;
}

async function discontinueProduct(productId, actor) {
  const existing = await productRepository.findByIdIncludingDiscontinued(productId);
  if (!existing) {
    throw ApiError.notFound('PRODUCT_NOT_FOUND', `Product ${productId} does not exist.`);
  }
  const product = await productRepository.discontinue(productId);

  await activityLogService.logActivity({
    actorType: actor.actorType,
    actorId: actor.actorId,
    actionType: 'PRODUCT_DISCONTINUED',
    affectedEntityType: 'Product',
    affectedEntityId: productId,
    originatingModule: 'A',
  });

  return product;
}

async function addProductImage(productId, { imageReference, sortOrder }) {
  const existing = await productRepository.findByIdIncludingDiscontinued(productId);
  if (!existing) {
    throw ApiError.notFound('PRODUCT_NOT_FOUND', `Product ${productId} does not exist.`);
  }
  return productRepository.addImage(productId, { imageReference, sortOrder });
}

/**
 * Manual stock adjustment (DEC-05, revised 2026-09-14 when Supplier &
 * Procurement was descoped from the final system): this is the normal way
 * to increase or correct stock. A reason is mandatory, and every
 * adjustment is written to the central Activity Log. Writes directly to inventory_stock because this IS Module A editing its
 * own owned data — unlike inventory.service.js's decreaseStock/increaseStock,
 * which exist for OTHER modules to call.
 *
 * `reason` is required and is written to the Activity Log by the caller
 * (controller layer) so every manual adjustment is traceable, per Physical
 * Schema Design V1.0 Section 8/19 (single central Activity Log, no second
 * Inventory Audit entity).
 */
async function adjustStockManually(productId, { newQuantity, reason }) {
  if (!reason || !reason.trim()) {
    throw ApiError.badRequest('REASON_REQUIRED', 'A reason is required for manual stock adjustments.');
  }
  return withTransaction(async (conn) => {
    const row = await inventoryRepository.getForUpdate(productId, conn);
    if (!row) {
      throw ApiError.notFound('PRODUCT_NOT_FOUND', `No inventory record for product ${productId}.`);
    }
    await inventoryRepository.setQuantity(productId, newQuantity, conn);
    return { productId, previousQuantity: row.quantity, newQuantity, reason };
  });
}

module.exports = {
  searchProducts,
  getProductDetail,
  createProduct,
  updateProduct,
  discontinueProduct,
  addProductImage,
  adjustStockManually,
};
