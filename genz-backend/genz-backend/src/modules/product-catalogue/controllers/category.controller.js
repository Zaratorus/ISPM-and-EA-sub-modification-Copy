const categoryService = require('../services/category.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');

const listCategories = asyncHandler(async (req, res) => {
  const data = await categoryService.listCategories();
  res.status(200).json({ data });
});

const createCategory = asyncHandler(async (req, res) => {
  const data = await categoryService.createCategory(req.body);
  res.status(201).json({ data });
});

const updateCategory = asyncHandler(async (req, res) => {
  const data = await categoryService.updateCategory(req.params.id, req.body);
  res.status(200).json({ data });
});

module.exports = { listCategories, createCategory, updateCategory };
