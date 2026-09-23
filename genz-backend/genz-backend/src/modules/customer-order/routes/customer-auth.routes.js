const express = require('express');
const controller = require('../controllers/customer.controller');
const validate = require('../../../shared/middleware/request-validator.middleware');
const passwordResetController = require('../controllers/password-reset.controller');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} = require('../validators/customer.validator');
const { customerLoginRateLimit } = require('../../../shared/middleware/customer-login-rate-limit.middleware');

const router = express.Router();

// POST /auth/customer/register — public (DEC-02: registration itself is not gated)
router.post('/register', validate(registerSchema), controller.register);

// POST /auth/customer/login — public (DEC-02). Rate-limited after validation,
// so 400s never count as failed attempts.
router.post('/login', validate(loginSchema), customerLoginRateLimit, controller.login);

// Forgot password (email one-time code) — public: no customer JWT, admin
// session or access key is involved. Abuse is bounded per account by the
// service (60 s resend cooldown, 5 codes/hour, 5 wrong attempts per code).
router.post('/password/forgot', validate(forgotPasswordSchema), passwordResetController.forgotPassword);
router.post('/password/verify-otp', validate(verifyOtpSchema), passwordResetController.verifyOtp);
router.post('/password/reset', validate(resetPasswordSchema), passwordResetController.resetPassword);

module.exports = router;
