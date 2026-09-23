/**
 * category.service.js
 */

const categoryRepository = require('../repositories/category.repository');
const ApiError = require('../../../shared/utils/ApiError');

async function listCategories() {
  return categoryRepository.findAll();
}

async function createCategory({ name, description }) {
  return categoryRepository.create({ name, description });
}

async function updateCategory(categoryId, { name, description }) {
  const existing = await categoryRepository.findById(categoryId);
  if (!existing) {
    throw ApiError.notFound('CATEGORY_NOT_FOUND', `Category ${categoryId} does not exist.`);
  }
  return categoryRepository.update(categoryId, { name, description });
}

module.exports = { listCategories, createCategory, updateCategory };
