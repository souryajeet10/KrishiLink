const { query } = require('../config/db');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');

// GET /api/v1/farmer-profiles
const listFarmerProfiles = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { state, district, crop } = req.query;

    let whereClauses = [];
    let params = [];

    if (state) {
      params.push(state);
      whereClauses.push(`fp.state ILIKE $${params.length}`);
    }
    if (district) {
      params.push(district);
      whereClauses.push(`fp.district ILIKE $${params.length}`);
    }
    if (crop) {
      params.push(crop);
      whereClauses.push(`$${params.length} = ANY(fp.crops)`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) FROM farmer_profiles fp ${whereSql};`, params);
    const totalCount = countRes.rows[0].count;

    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT fp.*, u.name, u.name_hi, u.phone, u.email, u.avatar, u.verified
      FROM farmer_profiles fp
      JOIN users u ON fp.user_id = u.id
      ${whereSql}
      ORDER BY fp.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length};
    `;

    const dataRes = await query(dataSql, dataParams);
    res.json(formatPaginatedResponse(dataRes.rows, totalCount, page, limit));
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/farmer-profiles/:id (accepts profile ID or user ID)
const getFarmerProfileById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const profileRes = await query(
      `SELECT fp.*, u.name, u.name_hi, u.phone, u.email, u.avatar, u.verified
       FROM farmer_profiles fp
       JOIN users u ON fp.user_id = u.id
       WHERE fp.id = $1 OR fp.user_id = $1;`,
      [id]
    );

    if (profileRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Farmer profile not found' });
    }

    res.json({ success: true, data: profileRes.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/farmer-profiles
const createFarmerProfile = async (req, res, next) => {
  try {
    const { userId, village, district, state, landAcres, crops, latitude, longitude } = req.body;
    const cropsArray = Array.isArray(crops) ? crops : (crops ? [crops] : []);

    const result = await query(
      `INSERT INTO farmer_profiles (user_id, village, district, state, land_acres, crops, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *;`,
      [userId, village || null, district || null, state || null, landAcres || 0, cropsArray, latitude || null, longitude || null]
    );

    // Update PostGIS geometry if coordinates provided and PostGIS is enabled
    if (latitude && longitude) {
      await query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
            UPDATE farmer_profiles 
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

// PUT /api/v1/farmer-profiles/:id
const updateFarmerProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { village, district, state, landAcres, crops, rating, totalSales, latitude, longitude } = req.body;

    const fields = [];
    const values = [];

    if (village !== undefined) { values.push(village); fields.push(`village = $${values.length}`); }
    if (district !== undefined) { values.push(district); fields.push(`district = $${values.length}`); }
    if (state !== undefined) { values.push(state); fields.push(`state = $${values.length}`); }
    if (landAcres !== undefined) { values.push(landAcres); fields.push(`land_acres = $${values.length}`); }
    if (crops !== undefined) { values.push(Array.isArray(crops) ? crops : [crops]); fields.push(`crops = $${values.length}`); }
    if (rating !== undefined) { values.push(rating); fields.push(`rating = $${values.length}`); }
    if (totalSales !== undefined) { values.push(totalSales); fields.push(`total_sales = $${values.length}`); }
    if (latitude !== undefined) { values.push(latitude); fields.push(`latitude = $${values.length}`); }
    if (longitude !== undefined) { values.push(longitude); fields.push(`longitude = $${values.length}`); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update' });
    }

    values.push(id);
    const updateSql = `
      UPDATE farmer_profiles
      SET ${fields.join(', ')}
      WHERE id = $${values.length} OR user_id = $${values.length}
      RETURNING *;
    `;

    const result = await query(updateSql, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Farmer profile not found' });
    }

    if (latitude !== undefined && longitude !== undefined) {
      await query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
            UPDATE farmer_profiles 
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

// DELETE /api/v1/farmer-profiles/:id
const deleteFarmerProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM farmer_profiles WHERE id = $1 OR user_id = $1 RETURNING id;', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Farmer profile not found' });
    }
    res.json({ success: true, message: 'Farmer profile deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listFarmerProfiles,
  getFarmerProfileById,
  createFarmerProfile,
  updateFarmerProfile,
  deleteFarmerProfile,
};
