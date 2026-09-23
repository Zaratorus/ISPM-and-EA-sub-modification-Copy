/**
 * product.service.test.js
 * Verifies the Activity Log fix for the confirmed audit defect: Product
 * create/edit/discontinue must each write one Activity Log entry
 * (Detailed System Architecture V1.2, Section 19 / Database Architecture
 * V1.1, Section 21 — "Product changes (create/edit/delete) — Module A").
 * Covers createProduct(), updateProduct(), discontinueProduct() only —
 * the three functions touched by this fix.
 */

jest.mock('../../../../../src/modules/product-catalogue/repositories/product.repository', () => ({
  create: jest.fn(),
  update: jest.fn(),
  discontinue: jest.fn(),
  findByIdIncludingDiscontinued: jest.fn(),
}));
jest.mock('../../../../../src/modules/product-catalogue/repositories/category.repository', () => ({
  findById: jest.fn(),
}));
jest.mock('../../../../../src/modules/store-administration/services/activity-log.service', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const productRepository = require('../../../../../src/modules/product-catalogue/repositories/product.repository');
const categoryRepository = require('../../../../../src/modules/product-catalogue/repositories/category.repository');
const activityLogService = require('../../../../../src/modules/store-administration/services/activity-log.service');
const productService = require('../../../../../src/modules/product-catalogue/services/product.service');

const ownerAdmin = { actorType: 'OWNER_ADMIN', actorId: null };
const staffA = { actorType: 'STAFF_ADMIN_USER', actorId: 7 };
const body = { categoryId: 1, name: 'Shirt', description: 'A shirt', price: 25 };

beforeEach(() => jest.clearAllMocks());

describe('product.service.createProduct() — Activity Log', () => {
  it('400s CATEGORY_NOT_FOUND without logging anything when the category does not exist', async () => {
    categoryRepository.findById.mockResolvedValue(null);
    await expect(productService.createProduct(body, ownerAdmin)).rejects.toMatchObject({
      statusCode: 400,
      code: 'CATEGORY_NOT_FOUND',
    });
    expect(productRepository.create).not.toHaveBeenCalled();
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
  });

  it('logs PRODUCT_CREATED with the Owner/Admin actor (actorId: null) and the new product_id', async () => {
    categoryRepository.findById.mockResolvedValue({ category_id: 1, name: 'Clothing' });
    productRepository.create.mockResolvedValue({ product_id: 5, category_id: 1, name: 'Shirt', price: 25, status: 'ACTIVE' });

    const result = await productService.createProduct(body, ownerAdmin);

    expect(activityLogService.logActivity).toHaveBeenCalledWith({
      actorType: 'OWNER_ADMIN',
      actorId: null,
      actionType: 'PRODUCT_CREATED',
      affectedEntityType: 'Product',
      affectedEntityId: 5,
      originatingModule: 'A',
    });
    expect(result.product_id).toBe(5);
  });

  it('logs PRODUCT_CREATED with a Staff actor (real staff_admin_user_id, never NULL)', async () => {
    categoryRepository.findById.mockResolvedValue({ category_id: 1, name: 'Clothing' });
    productRepository.create.mockResolvedValue({ product_id: 6, category_id: 1, name: 'Shirt', price: 25, status: 'ACTIVE' });

    await productService.createProduct(body, staffA);

    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'STAFF_ADMIN_USER', actorId: 7, actionType: 'PRODUCT_CREATED' })
    );
  });
});

describe('product.service.updateProduct() — Activity Log', () => {
  it('404s PRODUCT_NOT_FOUND without logging anything when the product does not exist', async () => {
    productRepository.findByIdIncludingDiscontinued.mockResolvedValue(null);
    await expect(productService.updateProduct(999, body, ownerAdmin)).rejects.toMatchObject({ statusCode: 404 });
    expect(productRepository.update).not.toHaveBeenCalled();
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
  });

  it('logs PRODUCT_UPDATED with the correct actor and affected product id', async () => {
    productRepository.findByIdIncludingDiscontinued.mockResolvedValue({
      product_id: 5,
      category_id: 1,
      name: 'Shirt',
      description: 'Old',
      price: 20,
    });
    productRepository.update.mockResolvedValue({ product_id: 5, category_id: 1, name: 'Shirt', price: 25, status: 'ACTIVE' });

    await productService.updateProduct(5, { price: 25 }, ownerAdmin);

    expect(activityLogService.logActivity).toHaveBeenCalledWith({
      actorType: 'OWNER_ADMIN',
      actorId: null,
      actionType: 'PRODUCT_UPDATED',
      affectedEntityType: 'Product',
      affectedEntityId: 5,
      originatingModule: 'A',
    });
  });

  it('logs PRODUCT_UPDATED with a Staff actor (real staff_admin_user_id, never NULL)', async () => {
    productRepository.findByIdIncludingDiscontinued.mockResolvedValue({
      product_id: 5,
      category_id: 1,
      name: 'Shirt',
      description: 'Old',
      price: 20,
    });
    productRepository.update.mockResolvedValue({ product_id: 5, category_id: 1, name: 'Shirt', price: 25, status: 'ACTIVE' });

    await productService.updateProduct(5, { price: 25 }, staffA);

    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'STAFF_ADMIN_USER', actorId: 7, actionType: 'PRODUCT_UPDATED' })
    );
  });
});

describe('product.service.discontinueProduct() — Activity Log', () => {
  it('404s PRODUCT_NOT_FOUND without logging anything when the product does not exist', async () => {
    productRepository.findByIdIncludingDiscontinued.mockResolvedValue(null);
    await expect(productService.discontinueProduct(999, ownerAdmin)).rejects.toMatchObject({ statusCode: 404 });
    expect(productRepository.discontinue).not.toHaveBeenCalled();
    expect(activityLogService.logActivity).not.toHaveBeenCalled();
  });

  it('logs PRODUCT_DISCONTINUED with the correct actor and affected product id', async () => {
    productRepository.findByIdIncludingDiscontinued.mockResolvedValue({
      product_id: 5,
      category_id: 1,
      name: 'Shirt',
      status: 'ACTIVE',
    });
    productRepository.discontinue.mockResolvedValue({ product_id: 5, status: 'DISCONTINUED' });

    const result = await productService.discontinueProduct(5, ownerAdmin);

    expect(activityLogService.logActivity).toHaveBeenCalledWith({
      actorType: 'OWNER_ADMIN',
      actorId: null,
      actionType: 'PRODUCT_DISCONTINUED',
      affectedEntityType: 'Product',
      affectedEntityId: 5,
      originatingModule: 'A',
    });
    expect(result.status).toBe('DISCONTINUED');
  });

  it('logs PRODUCT_DISCONTINUED with a Staff actor (real staff_admin_user_id, never NULL)', async () => {
    productRepository.findByIdIncludingDiscontinued.mockResolvedValue({
      product_id: 5,
      category_id: 1,
      name: 'Shirt',
      status: 'ACTIVE',
    });
    productRepository.discontinue.mockResolvedValue({ product_id: 5, status: 'DISCONTINUED' });

    await productService.discontinueProduct(5, staffA);

    expect(activityLogService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ actorType: 'STAFF_ADMIN_USER', actorId: 7, actionType: 'PRODUCT_DISCONTINUED' })
    );
  });
});
