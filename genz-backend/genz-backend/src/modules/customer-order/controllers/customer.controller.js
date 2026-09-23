const customerService = require('../services/customer.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');

// POST /auth/customer/register — public (DEC-02)
const register = asyncHandler(async (req, res) => {
  const data = await customerService.register(req.body);
  res.status(201).json({ data });
});

// POST /auth/customer/login — public (DEC-02)
const login = asyncHandler(async (req, res) => {
  const data = await customerService.login(req.body);
  res.status(200).json({ data });
});

module.exports = { register, login };
