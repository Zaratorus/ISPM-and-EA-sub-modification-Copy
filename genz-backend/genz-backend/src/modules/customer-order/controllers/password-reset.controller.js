const passwordResetService = require('../services/password-reset.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');

// POST /auth/customer/password/forgot — public. Always the same generic answer.
const forgotPassword = asyncHandler(async (req, res) => {
  const data = await passwordResetService.requestPasswordReset(req.body.email);
  res.status(200).json({ data });
});

// POST /auth/customer/password/verify-otp — public. Checks the code only.
const verifyOtp = asyncHandler(async (req, res) => {
  const data = await passwordResetService.verifyOtp(req.body.email, req.body.otp);
  res.status(200).json({ data });
});

// POST /auth/customer/password/reset — public. No automatic login afterwards.
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const data = await passwordResetService.resetPassword({ email, otp, newPassword });
  res.status(200).json({ data });
});

module.exports = { forgotPassword, verifyOtp, resetPassword };
