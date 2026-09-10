const { query } = require('../config/db');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');

// GET /api/v1/buyer-profiles
const listBuyerProfiles = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { city, state, search } = req.query;

    let whereClauses = [];
    let params = [];

    if (city) {
      params.push(city);
      whereClauses.push(`bp.city ILIKE $${params.length}`);
    }
    if (state) {
      params.push(state);
      whereClauses.push(`bp.state ILIKE $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      whereClauses.push(`(bp.company ILIKE $${params.length} OR u.name ILIKE $${params.length})`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) FROM buyer_profiles bp JOIN users u ON bp.user_id = u.id ${whereSql};`, params);
    const totalCount = countRes.rows[0].count;

    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT bp.*, u.name, u.name_hi, u.phone, u.email, u.avatar, u.verified
      FROM buyer_profiles bp
      JOIN users u ON bp.user_id = u.id
      ${whereSql}
      ORDER BY bp.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length};
    `;

    const dataRes = await query(dataSql, dataParams);
    res.json(formatPaginatedResponse(dataRes.rows, totalCount, page, limit));
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/buyer-profiles/:id (profile ID or user ID)
const getBuyerProfileById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const profileRes = await query(
      `SELECT bp.*, u.name, u.name_hi, u.phone, u.email, u.avatar, u.verified
       FROM buyer_profiles bp
       JOIN users u ON bp.user_id = u.id
       WHERE bp.id = $1 OR bp.user_id = $1;`,
      [id]
    );

    if (profileRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Buyer profile not found' });
    }

    res.json({ success: true, data: profileRes.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/buyer-profiles
const createBuyerProfile = async (req, res, next) => {
  try {
    const { userId, company, city, district, state, gstin, latitude, longitude } = req.body;

    const result = await query(
      `INSERT INTO buyer_profiles (user_id, company, city, district, state, gstin, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *;`,
      [userId, company || null, city || null, district || null, state || null, gstin || null, latitude || null, longitude || null]
    );

    if (latitude && longitude) {
      await query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
            UPDATE buyer_profiles 
            SET location_geom = ST_SetSRID(ST_MakePoint($1, $2), 4326) 
            WHERE id = $3;
          END IF;
        END $$;
      `, [longitude, latitude, result.rows[0].id]).catch(() => {});
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// PUT /api/v1/buyer-profiles/:id
const updateBuyerProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { company, city, district, state, gstin, rating, totalPurchases, latitude, longitude } = req.body;

    const fields = [];
    const values = [];

    if (company !== undefined) { values.push(company); fields.push(`company = $${values.length}`); }
    if (city !== undefined) { values.push(city); fields.push(`city = $${values.length}`); }
    if (district !== undefined) { values.push(district); fields.push(`district = $${values.length}`); }
    if (state !== undefined) { values.push(state); fields.push(`state = $${values.length}`); }
    if (gstin !== undefined) { values.push(gstin); fields.push(`gstin = $${values.length}`); }
    if (rating !== undefined) { values.push(rating); fields.push(`rating = $${values.length}`); }
    if (totalPurchases !== undefined) { values.push(totalPurchases); fields.push(`total_purchases = $${values.length}`); }
    if (latitude !== undefined) { values.push(latitude); fields.push(`latitude = $${values.length}`); }
    if (longitude !== undefined) { values.push(longitude); fields.push(`longitude = $${values.length}`); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update' });
    }

    values.push(id);
    const updateSql = `
      UPDATE buyer_profiles
      SET ${fields.join(', ')}
      WHERE id = $${values.length} OR user_id = $${values.length}
      RETURNING *;
    `;

    const result = await query(updateSql, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Buyer profile not found' });
    }

    if (latitude !== undefined && longitude !== undefined) {
      await query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
            UPDATE buyer_profiles 
            SET location_geom = ST_SetSRID(ST_MakePoint($1, $2), 4326) 
            WHERE id = $3;
          END IF;
        END $$;
      `, [longitude, latitude, result.rows[0].id]).catch(() => {});
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/v1/buyer-profiles/:id
const deleteBuyerProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM buyer_profiles WHERE id = $1 OR user_id = $1 RETURNING id;', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Buyer profile not found' });
    }
    res.json({ success: true, message: 'Buyer profile deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listBuyerProfiles,
  getBuyerProfileById,
  createBuyerProfile,
  updateBuyerProfile,
  deleteBuyerProfile,
};
