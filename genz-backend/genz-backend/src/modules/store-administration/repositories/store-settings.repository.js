/**
 * store-settings.repository.js
 * Direct data access for the single-row `store_settings` table only.
 * Module D owns this table exclusively (Physical MySQL Database Schema
 * Design V1.0, Section 3). Read-only for Module B (checkout's WhatsApp
 * number) via this module's exposed service, per Logical Database Design
 * V1.1, Section D4 — never a direct cross-module table read.
 */

const { pool } = require('../../../shared/db/connection');

async function getSettings() {
  const [rows] = await pool.query(
    'SELECT store_settings_id, store_name, contact_info, whatsapp_number, updated_at FROM store_settings WHERE store_settings_id = 1'
  );
  return rows[0] || null;
}

/**
 * Single-row upsert — the physical schema pins store_settings_id to 1 via
 * a CHECK constraint; this is the standard way to guarantee "exactly one
 * settings row" (Physical Schema Design V1.0, Section 3).
 */
async function upsertSettings({ storeName, contactInfo, whatsappNumber }) {
  await pool.query(
    `INSERT INTO store_settings (store_settings_id, store_name, contact_info, whatsapp_number)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE store_name = VALUES(store_name), contact_info = VALUES(contact_info),
       whatsapp_number = VALUES(whatsapp_number)`,
    [storeName, contactInfo, whatsappNumber]
  );
  return getSettings();
}

module.exports = { getSettings, upsertSettings };
