const { z } = require('zod');

// PUT /settings — Admin. All three fields are NOT NULL on store_settings,
// so a full update requires all of them (no partial PATCH is documented).
const updateSettingsSchema = {
  body: z.object({
    storeName: z.string().trim().min(1).max(150),
    contactInfo: z.string().trim().min(1).max(255),
    whatsappNumber: z.string().trim().min(1).max(30),
  }),
};

module.exports = { updateSettingsSchema };
