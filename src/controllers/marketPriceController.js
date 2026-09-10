const { query } = require('../config/db');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');
const {
  AGMARKNET_RESOURCE_ID,
  fetchLiveFromGovApi,
  syncPricesToDatabase,
  getMarketPricesWithFallback,
} = require('../services/agmarknetService');

// GET /api/v1/market-prices
const listMarketPrices = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { commodity, state, district, lat, lng } = req.query;

    // Use multi-tier service (Redis Cache -> data.gov.in AGMARKNET -> PostgreSQL -> Demo)
    const result = await getMarketPricesWithFallback({
      commodity,
      state,
      district,
      limit,
      offset,
    });

    let records = result.data || [];

    // If user coordinates provided, compute geospatial distances
    if (lat && lng) {
      const userLat = parseFloat(lat);
      const userLng = parseFloat(lng);
      records = records.map(r => {
        if (r.latitude && r.longitude) {
          const rLat = parseFloat(r.latitude);
          const rLng = parseFloat(r.longitude);
          const dLat = (rLat - userLat) * (Math.PI / 180);
          const dLng = (rLng - userLng) * (Math.PI / 180);
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(userLat * (Math.PI / 180)) * Math.cos(rLat * (Math.PI / 180)) *
                    Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distance_km = Math.round(6371 * c * 10) / 10;
          return { ...r, distance_km };
        }
        return r;
      });
    }

    const totalCount = result.count || records.length;
    const paginated = formatPaginatedResponse(records, totalCount, page, limit);

    // Attach government source and transparency metadata
    res.json({
      ...paginated,
      source: result.source,
      isRealGovData: result.isRealGovData,
      dataSource: result.dataSource,
      resourceId: result.resourceId || AGMARKNET_RESOURCE_ID,
      timestamp: result.timestamp || new Date().toISOString(),
      notice: result.notice || null,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/market-prices/sync (Manually or cron-triggered synchronization with data.gov.in)
const syncMarketPrices = async (req, res, next) => {
  try {
    const { commodity, state, district, limit } = { ...req.query, ...req.body };

    const liveRecords = await fetchLiveFromGovApi({
      commodity,
      state,
      district,
      limit: parseInt(limit || '100', 10),
    });

    const syncedCount = await syncPricesToDatabase(liveRecords);

    res.json({
      success: true,
      message: `Successfully synchronized ${syncedCount} mandi price records from data.gov.in AGMARKNET`,
      source: 'GOVERNMENT_API_AGMARKNET',
      resourceId: AGMARKNET_RESOURCE_ID,
      totalFetched: liveRecords.length,
      totalDatabaseSynced: syncedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(502).json({
      success: false,
      message: `Failed to synchronize with data.gov.in: ${err.message}`,
      notice: 'Ensure DATA_GOV_IN_API_KEY is configured in .env',
    });
  }
};

// GET /api/v1/market-prices/commodities
const getCommodities = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT commodity AS name,
             MAX(commodity_hi) AS name_hi,
             MAX(emoji) AS emoji,
             COUNT(*) AS total_markets,
             ROUND(AVG(modal_price), 0) AS avg_price,
             MIN(min_price) AS overall_min,
             MAX(max_price) AS overall_max
      FROM market_prices
      GROUP BY commodity
      ORDER BY commodity ASC;
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    // Fallback static commodities list if DB is offline
    res.json({
      success: true,
      data: [
        { name: 'Tomato', name_hi: 'टमाटर', emoji: '🍅', total_markets: 12, avg_price: 2200 },
        { name: 'Potato', name_hi: 'आलू', emoji: '🥔', total_markets: 8, avg_price: 1150 },
        { name: 'Onion', name_hi: 'प्याज', emoji: '🧅', total_markets: 15, avg_price: 1950 },
        { name: 'Wheat', name_hi: 'गेहूं', emoji: '🌾', total_markets: 22, avg_price: 2150 },
        { name: 'Rice', name_hi: 'चावल', emoji: '🌾', total_markets: 18, avg_price: 5200 },
        { name: 'Maize', name_hi: 'मक्का', emoji: '🌽', total_markets: 10, avg_price: 1850 },
      ],
    });
  }
};

// GET /api/v1/market-prices/:id
const getMarketPriceById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM market_prices WHERE id = $1;', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Market price record not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/market-prices
const createMarketPrice = async (req, res, next) => {
  try {
    const {
      commodity, commodityHi, emoji, market, district, state,
      minPrice, maxPrice, modalPrice, priceDate, trend, changeAmount,
      latitude, longitude
    } = req.body;

    const cropEmoji = emoji || (commodity === 'Tomato' ? '🍅' : commodity === 'Potato' ? '🥔' : commodity === 'Wheat' ? '🌾' : commodity === 'Onion' ? '🧅' : commodity === 'Maize' ? '🌽' : '🌱');

    const result = await query(`
      INSERT INTO market_prices (
        commodity, commodity_hi, emoji, market, district, state,
        min_price, max_price, modal_price, price_date, trend, change_amount,
        latitude, longitude
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;
    `, [
      commodity, commodityHi || null, cropEmoji, market, district || null, state || null,
      minPrice, maxPrice, modalPrice, priceDate || new Date(), trend || 'stable', changeAmount || 0,
      latitude || null, longitude || null
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// PUT /api/v1/market-prices/:id
const updateMarketPrice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { minPrice, maxPrice, modalPrice, trend, changeAmount, latitude, longitude } = req.body;

    const fields = [];
    const values = [];

    if (minPrice !== undefined) { values.push(minPrice); fields.push(`min_price = $${values.length}`); }
    if (maxPrice !== undefined) { values.push(maxPrice); fields.push(`max_price = $${values.length}`); }
    if (modalPrice !== undefined) { values.push(modalPrice); fields.push(`modal_price = $${values.length}`); }
    if (trend !== undefined) { values.push(trend); fields.push(`trend = $${values.length}`); }
    if (changeAmount !== undefined) { values.push(changeAmount); fields.push(`change_amount = $${values.length}`); }
    if (latitude !== undefined) { values.push(latitude); fields.push(`latitude = $${values.length}`); }
    if (longitude !== undefined) { values.push(longitude); fields.push(`longitude = $${values.length}`); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update' });
    }

    values.push(id);
    const updateSql = `
      UPDATE market_prices
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING *;
    `;

    const result = await query(updateSql, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Market price record not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/v1/market-prices/:id
const deleteMarketPrice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM market_prices WHERE id = $1 RETURNING id;', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Market price record not found' });
    }
    res.json({ success: true, message: 'Market price record deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listMarketPrices,
  syncMarketPrices,
  getCommodities,
  getMarketPriceById,
  createMarketPrice,
  updateMarketPrice,
  deleteMarketPrice,
};
