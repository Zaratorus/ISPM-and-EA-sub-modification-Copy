/**
 * category.repository.js
 * Direct data access for the `categories` table only.
 * Module A owns this table exclusively (Physical MySQL Database Schema
 * Design V1.0, Section 3) — no other module's repository queries it directly.
 */

const { pool } = require('../../../shared/db/connection');

async function findAll() {
  const [rows] = await pool.query('SELECT * FROM categories ORDER BY name ASC');
  return rows;
}

async function findById(categoryId) {
  const [rows] = await pool.query('SELECT * FROM categories WHERE category_id = ?', [categoryId]);
  return rows[0] || null;
}

async function create({ name, description }) {
  const [result] = await pool.query(
    'INSERT INTO categories (name, description) VALUES (?, ?)',
    [name, description ?? null]
  );
  return findById(result.insertId);
}

async function update(categoryId, { name, description }) {
  await pool.query(
    'UPDATE categories SET name = ?, description = ? WHERE category_id = ?',
    [name, description ?? null, categoryId]
  );
  return findById(categoryId);
}

module.exports = { findAll, findById, create, update };
