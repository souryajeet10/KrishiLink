const { query } = require('../config/db');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');

// GET /api/v1/users
const listUsers = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { role, search } = req.query;

    let whereClauses = [];
    let params = [];

    if (role) {
      params.push(role);
      whereClauses.push(`u.role = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) FROM users u ${whereSql};`, params);
    const totalCount = countRes.rows[0].count;

    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT u.id, u.role, u.name, u.name_hi, u.phone, u.email, u.avatar, u.verified, u.created_at, u.updated_at,
             fp.id AS farmer_profile_id, fp.village, fp.district AS farmer_district, fp.state AS farmer_state, fp.rating AS farmer_rating,
             bp.id AS buyer_profile_id, bp.company, bp.city AS buyer_city, bp.state AS buyer_state, bp.rating AS buyer_rating
      FROM users u
      LEFT JOIN farmer_profiles fp ON u.id = fp.user_id
      LEFT JOIN buyer_profiles bp ON u.id = bp.user_id
      ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length};
    `;

    const dataRes = await query(dataSql, dataParams);
    res.json(formatPaginatedResponse(dataRes.rows, totalCount, page, limit));
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/users/:id
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userRes = await query(
      `SELECT u.id, u.role, u.name, u.name_hi, u.phone, u.email, u.avatar, u.verified, u.created_at, u.updated_at,
              fp.id AS farmer_profile_id, fp.village, fp.district AS farmer_district, fp.state AS farmer_state, fp.land_acres, fp.crops, fp.rating AS farmer_rating, fp.total_sales,
              bp.id AS buyer_profile_id, bp.company, bp.city AS buyer_city, bp.district AS buyer_district, bp.state AS buyer_state, bp.gstin, bp.rating AS buyer_rating, bp.total_purchases
       FROM users u
       LEFT JOIN farmer_profiles fp ON u.id = fp.user_id
       LEFT JOIN buyer_profiles bp ON u.id = bp.user_id
       WHERE u.id = $1;`,
      [id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: userRes.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/users
const createUser = async (req, res, next) => {
  try {
    const { role, name, nameHi, phone, email, password, avatar, verified } = req.body;
    const insertRes = await query(
      `INSERT INTO users (role, name, name_hi, phone, email, password, avatar, verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, role, name, name_hi, phone, email, avatar, verified, created_at;`,
      [role, name, nameHi || null, phone, email || null, password, avatar || null, verified || false]
    );

    res.status(201).json({ success: true, data: insertRes.rows[0] });
  } catch (err) {
    next(err);
  }
};

// PUT /api/v1/users/:id
const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, nameHi, phone, email, avatar, verified } = req.body;

    const fields = [];
    const values = [];

    if (name !== undefined) { values.push(name); fields.push(`name = $${values.length}`); }
    if (nameHi !== undefined) { values.push(nameHi); fields.push(`name_hi = $${values.length}`); }
    if (phone !== undefined) { values.push(phone); fields.push(`phone = $${values.length}`); }
    if (email !== undefined) { values.push(email); fields.push(`email = $${values.length}`); }
    if (avatar !== undefined) { values.push(avatar); fields.push(`avatar = $${values.length}`); }
    if (verified !== undefined) { values.push(verified); fields.push(`verified = $${values.length}`); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update' });
    }

    values.push(id);
    const updateSql = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, role, name, name_hi, phone, email, avatar, verified, updated_at;
    `;

    const result = await query(updateSql, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/v1/users/:id
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id;', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted successfully', id });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
