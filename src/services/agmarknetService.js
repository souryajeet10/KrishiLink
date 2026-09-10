/**
 * AGMARKNET Mandi Price Integration Service
 * =========================================
 * Integrates with data.gov.in Open Government Data (OGD) Platform:
 * Resource ID: 9ef84268-d588-465a-a308-a864a43d0070
 *
 * Resilient multi-tier architecture:
 * 1. Redis Cache (3h TTL, daily mandi refresh)
 * 2. Live data.gov.in AGMARKNET API
 * 3. PostgreSQL market_prices table (persisted cache & fallback)
 * 4. Documented Demo Data fallback (only for offline/demo resilience)
 */

const { query } = require('../config/db');
const { getCache, setCache } = require('../config/redis');

const AGMARKNET_RESOURCE_ID = process.env.AGMARKNET_RESOURCE_ID || '9ef84268-d588-465a-a308-a864a43d0070';
const DATA_GOV_IN_BASE_URL = 'https://api.data.gov.in/resource';

const COMMODITY_EMOJIS = {
  Tomato: '🍅',
  Potato: '🥔',
  Onion: '🧅',
  Wheat: '🌾',
  Rice: '🌾',
  Maize: '🌽',
  Soyabean: '🌱',
  Mustard: '🌼',
  Cotton: '⚪',
  Chilli: '🌶️',
  Garlic: '🧄',
  Ginger: '🫚',
};

const COMMODITY_HI = {
  Tomato: 'टमाटर',
  Potato: 'आलू',
  Onion: 'प्याज',
  Wheat: 'गेहूं',
  Rice: 'चावल',
  Maize: 'मक्का',
  Soyabean: 'सोयाबीन',
  Mustard: 'सरसों',
  Cotton: 'कपास',
  Chilli: 'मिर्च',
  Garlic: 'लहसुन',
  Ginger: 'अदरक',
};

/**
 * Fetch live mandi prices from data.gov.in AGMARKNET API
 */
async function fetchLiveFromGovApi({ commodity, state, district, limit = 100, offset = 0 }) {
  const apiKey = process.env.DATA_GOV_IN_API_KEY || process.env.DATA_GOV_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here' || apiKey === 'your_data_gov_in_api_key_here') {
    throw new Error('data.gov.in API key is not configured in environment (DATA_GOV_IN_API_KEY or DATA_GOV_API_KEY)');
  }

  const url = new URL(`${DATA_GOV_IN_BASE_URL}/${AGMARKNET_RESOURCE_ID}`);
  url.searchParams.append('api-key', apiKey);
  url.searchParams.append('format', 'json');
  url.searchParams.append('offset', offset.toString());
  url.searchParams.append('limit', limit.toString());

  if (commodity) url.searchParams.append('filters[commodity]', commodity);
  if (state) url.searchParams.append('filters[state]', state);
  if (district) url.searchParams.append('filters[district]', district);

  console.log(`🏛️ [AGMARKNET Service] Querying data.gov.in: commodity=${commodity || 'all'}, state=${state || 'all'}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second timeout

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`data.gov.in responded with HTTP ${res.status}: ${res.statusText}`);
    }

    const json = await res.json();
    const rawRecords = json.records || [];

    console.log(`✅ [AGMARKNET Service] Successfully fetched ${rawRecords.length} records from data.gov.in`);

    // Standardize fields
    return rawRecords.map((r, index) => {
      const commName = r.commodity || 'Produce';
      const minP = parseFloat(r.min_price || r.modal_price || 0);
      const maxP = parseFloat(r.max_price || r.modal_price || 0);
      const modalP = parseFloat(r.modal_price || (minP + maxP) / 2 || 0);

      // Parse date format (usually DD/MM/YYYY or YYYY-MM-DD)
      let priceDate = new Date().toISOString().split('T')[0];
      if (r.arrival_date) {
        if (r.arrival_date.includes('/')) {
          const [d, m, y] = r.arrival_date.split('/');
          if (d && m && y) priceDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        } else {
          priceDate = r.arrival_date;
        }
      }

      return {
        id: `gov_${priceDate}_${index}`,
        commodity: commName,
        commodity_hi: COMMODITY_HI[commName] || commName,
        emoji: COMMODITY_EMOJIS[commName] || '🌱',
        market: r.market || 'APMC Yard',
        district: r.district || '',
        state: r.state || '',
        min_price: minP,
        max_price: maxP,
        modal_price: modalP,
        price_date: priceDate,
        trend: 'stable',
        change_amount: 0,
        source: 'GOVERNMENT_API_AGMARKNET',
      };
    });
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('⚠️ [AGMARKNET Service] data.gov.in fetch failed:', err.message);
    throw err;
  }
}

/**
 * Upsert verified government records into PostgreSQL market_prices table
 */
async function syncPricesToDatabase(records) {
  if (!records || records.length === 0) return 0;

  try {
    let synced = 0;
    for (const r of records) {
      // Upsert: check if record for commodity + market + price_date exists
      const existing = await query(`
        SELECT id FROM market_prices 
        WHERE LOWER(commodity) = LOWER($1) 
          AND LOWER(market) = LOWER($2) 
          AND price_date = $3::date
        LIMIT 1;
      `, [r.commodity, r.market, r.price_date]);

      if (existing.rows.length > 0) {
        await query(`
          UPDATE market_prices
          SET min_price = $1, max_price = $2, modal_price = $3, trend = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $5;
        `, [r.min_price, r.max_price, r.modal_price, r.trend, existing.rows[0].id]);
      } else {
        await query(`
          INSERT INTO market_prices (
            commodity, commodity_hi, emoji, market, district, state,
            min_price, max_price, modal_price, price_date, trend, change_amount
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
        `, [
          r.commodity, r.commodity_hi, r.emoji, r.market, r.district, r.state,
          r.min_price, r.max_price, r.modal_price, r.price_date, r.trend, r.change_amount
        ]);
      }
      synced++;
    }
    console.log(`📥 [AGMARKNET Service] Synchronized ${synced} records into PostgreSQL market_prices table.`);
    return synced;
  } catch (err) {
    console.warn('⚠️ [AGMARKNET Service] Database sync notice:', err.message);
    return 0;
  }
}

/**
 * Get market prices with complete multi-tier resilience:
 * Tier 1: Redis Cache (3h TTL)
 * Tier 2: data.gov.in AGMARKNET API
 * Tier 3: PostgreSQL market_prices table
 * Tier 4: Documented Demo Data fallback
 */
async function getMarketPricesWithFallback(options = {}) {
  const { commodity, state, district, limit = 50, offset = 0 } = options;
  const cacheKey = `mandi:prices:${commodity || 'all'}:${state || 'all'}:${district || 'all'}:${limit}:${offset}`;

  // ── Tier 1: Check Redis Cache ──────────────────────────────
  const cached = await getCache(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    console.log(`⚡ [AGMARKNET Service] Serving ${cached.length} prices from Redis cache (key: ${cacheKey})`);
    return {
      source: 'REDIS_CACHE',
      isRealGovData: true,
      dataSource: 'Redis Cache (TTL ~3 hours) - Cached from data.gov.in AGMARKNET',
      resourceId: AGMARKNET_RESOURCE_ID,
      data: cached,
      count: cached.length,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Tier 2: Fetch Live from data.gov.in AGMARKNET ─────────
  try {
    const liveRecords = await fetchLiveFromGovApi({ commodity, state, district, limit, offset });
    if (liveRecords && liveRecords.length > 0) {
      // 1. Cache in Redis with 3-hour TTL
      const ttl = parseInt(process.env.REDIS_CACHE_TTL || '10800', 10);
      await setCache(cacheKey, liveRecords, ttl);

      // 2. Persist/refresh to PostgreSQL market_prices table asynchronously
      syncPricesToDatabase(liveRecords).catch(() => {});

      return {
        source: 'GOVERNMENT_API_AGMARKNET',
        isRealGovData: true,
        dataSource: 'data.gov.in Open Government Data Platform - AGMARKNET Mandi Price API',
        resourceId: AGMARKNET_RESOURCE_ID,
        data: liveRecords,
        count: liveRecords.length,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (apiErr) {
    console.log(`ℹ️ [AGMARKNET Service] Live API unavailable (${apiErr.message}). Falling back to PostgreSQL...`);
  }

  // ── Tier 3: Fallback to PostgreSQL market_prices Table ─────
  try {
    let whereClauses = [];
    let params = [];

    if (commodity) {
      params.push(`%${commodity}%`);
      whereClauses.push(`(mp.commodity ILIKE $${params.length} OR mp.commodity_hi ILIKE $${params.length})`);
    }
    if (state) {
      params.push(state);
      whereClauses.push(`mp.state ILIKE $${params.length}`);
    }
    if (district) {
      params.push(district);
      whereClauses.push(`mp.district ILIKE $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    params.push(limit, offset);
    const sql = `
      SELECT mp.*
      FROM market_prices mp
      ${whereSql}
      ORDER BY mp.price_date DESC, mp.modal_price DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const dbRes = await query(sql, params);
    if (dbRes.rows.length > 0) {
      const records = dbRes.rows.map(p => ({
        ...p,
        min_price: parseFloat(p.min_price),
        max_price: parseFloat(p.max_price),
        modal_price: parseFloat(p.modal_price),
        change_amount: parseFloat(p.change_amount || 0),
        source: 'POSTGRESQL_FALLBACK',
      }));

      return {
        source: 'POSTGRESQL_FALLBACK',
        isRealGovData: false,
        dataSource: 'PostgreSQL market_prices Table (Historical Mandi Records)',
        data: records,
        count: records.length,
        timestamp: new Date().toISOString(),
        notice: 'Served from PostgreSQL database fallback due to live API offline/unconfigured.',
      };
    }
  } catch (dbErr) {
    console.warn('⚠️ [AGMARKNET Service] PostgreSQL fallback failed:', dbErr.message);
  }

  // ── Tier 4: Documented Demo Fallback (Offline / Zero-DB Resilience)
  console.log('ℹ️ [AGMARKNET Service] Using documented demo fallback data.');
  const demoFallback = [
    { id: 'demo_01', commodity: 'Tomato', commodity_hi: 'टमाटर', emoji: '🍅', market: 'Azadpur Mandi', district: 'Delhi', state: 'Delhi', min_price: 1800, max_price: 2800, modal_price: 2250, price_date: new Date().toISOString().split('T')[0], trend: 'up', change_amount: 150 },
    { id: 'demo_02', commodity: 'Tomato', commodity_hi: 'टमाटर', emoji: '🍅', market: 'Ahmedabad APMC', district: 'Ahmedabad', state: 'Gujarat', min_price: 1700, max_price: 2600, modal_price: 2150, price_date: new Date().toISOString().split('T')[0], trend: 'up', change_amount: 100 },
    { id: 'demo_03', commodity: 'Potato', commodity_hi: 'आलू', emoji: '🥔', market: 'Azadpur Mandi', district: 'Delhi', state: 'Delhi', min_price: 900, max_price: 1400, modal_price: 1100, price_date: new Date().toISOString().split('T')[0], trend: 'stable', change_amount: 0 },
    { id: 'demo_04', commodity: 'Onion', commodity_hi: 'प्याज', emoji: '🧅', market: 'Nasik APMC', district: 'Nasik', state: 'Maharashtra', min_price: 1500, max_price: 2200, modal_price: 1900, price_date: new Date().toISOString().split('T')[0], trend: 'up', change_amount: 200 },
    { id: 'demo_05', commodity: 'Wheat', commodity_hi: 'गेहूं', emoji: '🌾', market: 'Karnal Grain Market', district: 'Karnal', state: 'Haryana', min_price: 1950, max_price: 2300, modal_price: 2100, price_date: new Date().toISOString().split('T')[0], trend: 'stable', change_amount: 10 },
  ];

  const filtered = commodity
    ? demoFallback.filter(p => p.commodity.toLowerCase().includes(commodity.toLowerCase()))
    : demoFallback;

  return {
    source: 'DEMO_DATA_FALLBACK',
    isRealGovData: false,
    dataSource: 'Documented Demo Fallback (Offline Resilience Only)',
    data: filtered,
    count: filtered.length,
    timestamp: new Date().toISOString(),
    notice: 'Demo fallback active. Set DATA_GOV_IN_API_KEY in .env to connect to live AGMARKNET.',
  };
}

module.exports = {
  AGMARKNET_RESOURCE_ID,
  fetchLiveFromGovApi,
  syncPricesToDatabase,
  getMarketPricesWithFallback,
};
