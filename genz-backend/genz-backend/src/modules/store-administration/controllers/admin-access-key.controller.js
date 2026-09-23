const adminAccessKeyService = require('../services/admin-access-key.service');
const activityLogService = require('../services/activity-log.service');
const asyncHandler = require('../../../shared/utils/asyncHandler');

/**
 * POST /admin/access-key/validate — public, rate-limited.
 * Logs BOTH successful and failed attempts to the Activity Log, per
 * Detailed System Architecture V1.2, Section 19's explicit requirement:
 * "Admin Access Key access attempts (successful and failed)". This is the
 * one already-documented audit behaviour connected in this change — no
 * new audit semantics are invented (Backend/API Architecture Design V1.0
 * — the existing bcrypt/JWT validation logic in admin-access-key.service.js
 * is untouched).
 */
const validateAccessKey = asyncHandler(async (req, res, next) => {
  let token;
  try {
    token = await adminAccessKeyService.validateAccessKey(req.body.accessKey, req.ip);
  } catch (err) {
    await activityLogService.logActivity({
      actorType: 'SYSTEM',
      actionType: 'ADMIN_ACCESS_KEY_VALIDATION_FAILED',
      affectedEntityType: 'AdminAccessKey',
      affectedEntityId: 1,
      originatingModule: 'D',
      contextNote: `Failed attempt from IP ${req.ip}`,
    });
    return next(err);
  }

  await activityLogService.logActivity({
    actorType: 'OWNER_ADMIN',
    actionType: 'ADMIN_ACCESS_KEY_VALIDATED',
    affectedEntityType: 'AdminAccessKey',
    affectedEntityId: 1,
    originatingModule: 'D',
  });

  res.status(200).json({ data: { token } });
});

// POST /admin/logout — stateless JWT: client discards the token.
// (No server-side session store exists in this design; if one is added
// later for revocation support, this handler would invalidate it here.)
// Logout is NOT in DSA V1.2 Section 19's audited-actions list, so no
// Activity Log entry is written here — not silently inventing one.
const logout = asyncHandler(async (req, res) => {
  res.status(200).json({ data: { message: 'Logged out.' } });
});

module.exports = { validateAccessKey, logout };
