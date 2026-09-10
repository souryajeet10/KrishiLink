const { query } = require('../config/db');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');

// GET /api/v1/listings
const listListings = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { crop, grade, minPrice, maxPrice, status, farmerId, lat, lng, radiusKm } = req.query;

    let whereClauses = [];
    let params = [];

    // Default status filter to 'active' unless specified
    if (status) {
      params.push(status);
      whereClauses.push(`l.status = $${params.length}`);
    } else {
      whereClauses.push(`l.status = 'active'`);
    }

    if (crop) {
      params.push(`%${crop}%`);
      whereClauses.push(`(l.crop ILIKE $${params.length} OR (l.crop_hi IS NOT NULL AND l.crop_hi ILIKE $${params.length}))`);
    }

    if (grade) {
      params.push(grade.toUpperCase());
      whereClauses.push(`l.grade = $${params.length}`);
    }

    if (minPrice) {
      params.push(parseFloat(minPrice));
      whereClauses.push(`l.asking_price >= $${params.length}`);
    }

    if (maxPrice) {
      params.push(parseFloat(maxPrice));
      whereClauses.push(`l.asking_price <= $${params.length}`);
    }

    if (farmerId) {
      params.push(farmerId);
      whereClauses.push(`l.farmer_id = $${params.length}`);
    }

    let selectDistanceSql = 'NULL AS distance_km';
    let orderBySql = 'l.created_at DESC';

    // Spatial filter if latitude & longitude provided
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      const radius = parseFloat(radiusKm || 50);

      // Haversine distance in KM
      params.push(userLat, userLng);
      const latIdx = params.length - 1;
      const lngIdx = params.length;

      selectDistanceSql = `
        CASE 
          WHEN l.latitude IS NOT NULL AND l.longitude IS NOT NULL THEN
            ROUND((6371 * acos(
              LEAST(1.0, GREATEST(-1.0, 
                cos(radians($${latIdx})) * cos(radians(l.latitude)) * cos(radians(l.longitude) - radians($${lngIdx})) + 
                sin(radians($${latIdx})) * sin(radians(l.latitude))
              ))
            ))::numeric, 2)
          ELSE NULL 
        END AS distance_km
      `;

      if (radiusKm) {
        params.push(radius);
        const radiusIdx = params.length;
        whereClauses.push(`
          (l.latitude IS NOT NULL AND l.longitude IS NOT NULL AND 
           (6371 * acos(
              LEAST(1.0, GREATEST(-1.0, 
                cos(radians($${latIdx})) * cos(radians(l.latitude)) * cos(radians(l.longitude) - radians($${lngIdx})) + 
                sin(radians($${latIdx})) * sin(radians(l.latitude))
              ))
            )) <= $${radiusIdx})
        `);
      }

      orderBySql = 'distance_km ASC NULLS LAST, l.created_at DESC';
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) FROM produce_listings l ${whereSql};`, params);
    const totalCount = countRes.rows[0].count;

    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT l.*,
             ${selectDistanceSql},
             u.name AS farmer_name, u.name_hi AS farmer_name_hi, u.phone AS farmer_phone, u.avatar AS farmer_avatar, u.verified AS farmer_verified,
             fp.rating AS farmer_rating, fp.village AS farmer_village, fp.district AS farmer_district, fp.state AS farmer_state,
             (SELECT COUNT(*) FROM offers o WHERE o.listing_id = l.id) AS total_offers
      FROM produce_listings l
      JOIN users u ON l.farmer_id = u.id
      LEFT JOIN farmer_profiles fp ON u.id = fp.user_id
      ${whereSql}
      ORDER BY ${orderBySql}
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length};
    `;

    const dataRes = await query(dataSql, dataParams);
    res.json(formatPaginatedResponse(dataRes.rows, totalCount, page, limit));
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/listings/:id
const getListingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const listingRes = await query(
      `SELECT l.*,
              u.name AS farmer_name, u.name_hi AS farmer_name_hi, u.phone AS farmer_phone, u.avatar AS farmer_avatar, u.verified AS farmer_verified,
              fp.rating AS farmer_rating, fp.village AS farmer_village, fp.district AS farmer_district, fp.state AS farmer_state
       FROM produce_listings l
       JOIN users u ON l.farmer_id = u.id
       LEFT JOIN farmer_profiles fp ON u.id = fp.user_id
       WHERE l.id = $1;`,
      [id]
    );

    if (listingRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Produce listing not found' });
    }

    const listing = listingRes.rows[0];

    // Fetch related offers
    const offersRes = await query(
      `SELECT o.*, u.name AS buyer_name, u.phone AS buyer_phone, bp.company AS buyer_company, bp.rating AS buyer_rating
       FROM offers o
       JOIN users u ON o.buyer_id = u.id
       LEFT JOIN buyer_profiles bp ON u.id = bp.user_id
       WHERE o.listing_id = $1
       ORDER BY o.created_at DESC;`,
      [id]
    );
    listing.offers = offersRes.rows;

    res.json({ success: true, data: listing });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/listings
const createListing = async (req, res, next) => {
  try {
    const {
      farmerId, crop, cropHi, emoji, variety, quantity, unit, grade,
      askingPrice, marketRefPrice, aiSuggestedPrice, description,
      locationAddress, latitude, longitude, images, status
    } = req.body;

    const imagesArray = Array.isArray(images) ? images : (images ? [images] : []);
    const cropEmoji = emoji || (crop === 'Tomato' ? '🍅' : crop === 'Potato' ? '🥔' : crop === 'Wheat' ? '🌾' : crop === 'Onion' ? '🧅' : crop === 'Maize' ? '🌽' : '🌱');

    const result = await query(
      `INSERT INTO produce_listings (
        farmer_id, crop, crop_hi, emoji, variety, quantity, unit, grade,
        asking_price, market_ref_price, ai_suggested_price, description,
        location_address, latitude, longitude, images, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING *;`,
      [
        farmerId, crop, cropHi || null, cropEmoji, variety || null, quantity, unit || 'kg', grade || 'A',
        askingPrice, marketRefPrice || null, aiSuggestedPrice || null, description || null,
        locationAddress || null, latitude || null, longitude || null, imagesArray, status || 'active'
      ]
    );

    const newListing = result.rows[0];

    if (latitude && longitude) {
      await query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
            UPDATE produce_listings 
            SET location_geom = ST_SetSRID(ST_MakePoint($1, $2), 4326) 
            WHERE id = $3;
          END IF;
        END $$;
      `, [longitude, latitude, newListing.id]).catch(() => {});
    }

    res.status(201).json({ success: true, data: newListing });
  } catch (err) {
    next(err);
  }
};

// PUT /api/v1/listings/:id
const updateListing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      crop, cropHi, emoji, variety, quantity, unit, grade,
      askingPrice, marketRefPrice, aiSuggestedPrice, description,
      locationAddress, latitude, longitude, images, status
    } = req.body;

    const fields = [];
    const values = [];

    if (crop !== undefined) { values.push(crop); fields.push(`crop = $${values.length}`); }
    if (cropHi !== undefined) { values.push(cropHi); fields.push(`crop_hi = $${values.length}`); }
    if (emoji !== undefined) { values.push(emoji); fields.push(`emoji = $${values.length}`); }
    if (variety !== undefined) { values.push(variety); fields.push(`variety = $${values.length}`); }
    if (quantity !== undefined) { values.push(quantity); fields.push(`quantity = $${values.length}`); }
    if (unit !== undefined) { values.push(unit); fields.push(`unit = $${values.length}`); }
    if (grade !== undefined) { values.push(grade); fields.push(`grade = $${values.length}`); }
    if (askingPrice !== undefined) { values.push(askingPrice); fields.push(`asking_price = $${values.length}`); }
    if (marketRefPrice !== undefined) { values.push(marketRefPrice); fields.push(`market_ref_price = $${values.length}`); }
    if (aiSuggestedPrice !== undefined) { values.push(aiSuggestedPrice); fields.push(`ai_suggested_price = $${values.length}`); }
    if (description !== undefined) { values.push(description); fields.push(`description = $${values.length}`); }
    if (locationAddress !== undefined) { values.push(locationAddress); fields.push(`location_address = $${values.length}`); }
    if (latitude !== undefined) { values.push(latitude); fields.push(`latitude = $${values.length}`); }
    if (longitude !== undefined) { values.push(longitude); fields.push(`longitude = $${values.length}`); }
    if (images !== undefined) { values.push(Array.isArray(images) ? images : [images]); fields.push(`images = $${values.length}`); }
    if (status !== undefined) { values.push(status); fields.push(`status = $${values.length}`); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update' });
    }

    values.push(id);
    const updateSql = `
      UPDATE produce_listings
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING *;
    `;

    const result = await query(updateSql, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Produce listing not found' });
    }

    if (latitude !== undefined && longitude !== undefined) {
      await query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
            UPDATE produce_listings 
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

// DELETE /api/v1/listings/:id
const deleteListing = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Soft-delete or hard-delete based on query parameter
    const hardDelete = req.query.hard === 'true';

    let result;
    if (hardDelete) {
      result = await query('DELETE FROM produce_listings WHERE id = $1 RETURNING id;', [id]);
    } else {
      result = await query("UPDATE produce_listings SET status = 'deleted' WHERE id = $1 RETURNING id, status;", [id]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Produce listing not found' });
    }

    res.json({ success: true, message: 'Produce listing deleted successfully', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listListings,
  getListingById,
  createListing,
  updateListing,
  deleteListing,
};
