const { query, getClient } = require('../config/db');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');
const { sendNotification } = require('../services/notificationService');

// GET /api/v1/offers
const listOffers = async (req, res, next) => {
  try {
    // Defense-in-depth: Ensure buyers cannot access offers list
    if (req.user && req.user.role === 'buyer') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Access restricted to role(s): [farmer, admin]. Your current role is "buyer".',
      });
    }

    const { page, limit, offset } = getPaginationParams(req);
    const { listingId, buyerId, farmerId, status } = req.query;

    let whereClauses = [];
    let params = [];

    // Role-aware scoping: farmers only see offers on their own listings
    if (req.user && req.user.role === 'farmer') {
      params.push(req.user.id);
      whereClauses.push(`l.farmer_id = $${params.length}`);
    } else if (farmerId) {
      params.push(farmerId);
      whereClauses.push(`l.farmer_id = $${params.length}`);
    }

    if (listingId) {
      params.push(listingId);
      whereClauses.push(`o.listing_id = $${params.length}`);
    }
    if (buyerId && req.user?.role === 'admin') {
      params.push(buyerId);
      whereClauses.push(`o.buyer_id = $${params.length}`);
    }

    // Default to 'pending' offers if not specified
    const targetStatus = status || (req.user?.role === 'farmer' ? 'pending' : null);
    if (targetStatus) {
      params.push(targetStatus);
      whereClauses.push(`o.status = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`
      SELECT COUNT(*) 
      FROM offers o
      JOIN produce_listings l ON o.listing_id = l.id
      ${whereSql};
    `, params);
    const totalCount = countRes.rows[0].count;

    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT o.*,
             l.crop, l.crop_hi, l.emoji AS crop_emoji, l.variety, l.asking_price, l.status AS listing_status, l.farmer_id,
             buyer.name AS buyer_name, buyer.phone AS buyer_phone, buyer.avatar AS buyer_avatar,
             bp.company AS buyer_company, bp.city AS buyer_city, bp.rating AS buyer_rating,
             farmer.name AS farmer_name, farmer.phone AS farmer_phone
      FROM offers o
      JOIN produce_listings l ON o.listing_id = l.id
      JOIN users buyer ON o.buyer_id = buyer.id
      LEFT JOIN buyer_profiles bp ON buyer.id = bp.user_id
      JOIN users farmer ON l.farmer_id = farmer.id
      ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length};
    `;

    const dataRes = await query(dataSql, dataParams);
    res.json(formatPaginatedResponse(dataRes.rows, totalCount, page, limit));
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/offers/:id
const getOfferById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const offerRes = await query(`
      SELECT o.*,
             l.crop, l.crop_hi, l.emoji AS crop_emoji, l.variety, l.asking_price, l.quantity AS listing_quantity, l.farmer_id,
             buyer.name AS buyer_name, buyer.phone AS buyer_phone, buyer.email AS buyer_email,
             bp.company AS buyer_company, bp.city AS buyer_city, bp.rating AS buyer_rating,
             farmer.name AS farmer_name, farmer.phone AS farmer_phone
      FROM offers o
      JOIN produce_listings l ON o.listing_id = l.id
      JOIN users buyer ON o.buyer_id = buyer.id
      LEFT JOIN buyer_profiles bp ON buyer.id = bp.user_id
      JOIN users farmer ON l.farmer_id = farmer.id
      WHERE o.id = $1;
    `, [id]);

    if (offerRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    res.json({ success: true, data: offerRes.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/offers
const createOffer = async (req, res, next) => {
  const client = await getClient();
  try {
    const { listingId, buyerId, offerPrice, quantity, unit, message } = req.body;

    await client.query('BEGIN');

    // 1. Verify listing exists
    const listingRes = await client.query('SELECT * FROM produce_listings WHERE id = $1;', [listingId]);
    if (listingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Referenced produce listing not found' });
    }
    const listing = listingRes.rows[0];

    const offerQty = parseFloat(quantity);
    const price = parseFloat(offerPrice);
    const totalAmount = offerQty * price;

    // 2. Insert Offer
    const offerRes = await client.query(`
      INSERT INTO offers (listing_id, buyer_id, offer_price, quantity, unit, total_amount, message, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *;
    `, [listingId, buyerId, price, offerQty, unit || 'kg', totalAmount, message || null]);

    const newOffer = offerRes.rows[0];

    // 3. Create Notification for the Farmer
    const buyerRes = await client.query('SELECT name FROM users WHERE id = $1;', [buyerId]);
    const buyerName = buyerRes.rows[0]?.name || 'एक खरीदार';

    await client.query('COMMIT');

    // Trigger FCM push and in-app notification for the farmer
    sendNotification({
      userId: listing.farmer_id,
      type: 'offer',
      title: 'नया ऑफर मिला!',
      titleEn: 'New Offer Received',
      body: `${buyerName} ने ${listing.crop} के लिए ₹${price}/${unit || 'kg'} का ऑफर दिया है।`,
      emoji: '💰',
      data: {
        event: 'offer_created',
        offerId: newOffer.id,
        listingId: listing.id,
        crop: listing.crop,
        price: String(price),
        quantity: String(offerQty),
        unit: unit || 'kg',
      },
    }).catch(err => console.warn('[Offer Notification Error]:', err.message));

    res.status(201).json({ success: true, data: newOffer });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// PUT /api/v1/offers/:id
const updateOffer = async (req, res, next) => {
  const client = await getClient();
  try {
    const { id } = req.params;
    const { status, offerPrice, quantity, message } = req.body;

    await client.query('BEGIN');

    const offerRes = await client.query(`
      SELECT o.*, l.farmer_id, l.crop
      FROM offers o
      JOIN produce_listings l ON o.listing_id = l.id
      WHERE o.id = $1;
    `, [id]);

    if (offerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }

    const currentOffer = offerRes.rows[0];

    // If updating status to 'accepted'
    let orderCreated = null;
    if (status === 'accepted' && currentOffer.status !== 'accepted') {
      // 1. Create Order
      const todayStr = new Date().toISOString().split('T')[0];
      const initialTimeline = JSON.stringify([
        { step: 'Order Created', date: todayStr, done: true },
        { step: 'Pickup Scheduled', date: '', done: false },
        { step: 'In Transit', date: '', done: false },
        { step: 'Delivered', date: '', done: false },
        { step: 'Payment Released', date: '', done: false }
      ]);

      const orderRes = await client.query(`
        INSERT INTO orders (listing_id, offer_id, farmer_id, buyer_id, crop, quantity, unit, agreed_price, total_amount, status, payment_status, timeline)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
        RETURNING *;
      `, [
        currentOffer.listing_id,
        currentOffer.id,
        currentOffer.farmer_id,
        currentOffer.buyer_id,
        currentOffer.crop,
        currentOffer.quantity,
        currentOffer.unit,
        currentOffer.offer_price,
        currentOffer.total_amount,
        'confirmed',
        'pending',
        initialTimeline
      ]);
      orderCreated = orderRes.rows[0];

      // 2. Mark listing as sold
      await client.query("UPDATE produce_listings SET status = 'sold' WHERE id = $1;", [currentOffer.listing_id]);
    }

    const fields = [];
    const values = [];

    if (status !== undefined) { values.push(status); fields.push(`status = $${values.length}`); }
    if (offerPrice !== undefined) { values.push(offerPrice); fields.push(`offer_price = $${values.length}`); }
    if (quantity !== undefined) { values.push(quantity); fields.push(`quantity = $${values.length}`); }
    if (message !== undefined) { values.push(message); fields.push(`message = $${values.length}`); }

    if (offerPrice !== undefined || quantity !== undefined) {
      const q = quantity !== undefined ? parseFloat(quantity) : parseFloat(currentOffer.quantity);
      const p = offerPrice !== undefined ? parseFloat(offerPrice) : parseFloat(currentOffer.offer_price);
      values.push(q * p);
      fields.push(`total_amount = $${values.length}`);
    }

    values.push(id);
    const updateRes = await client.query(`
      UPDATE offers
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING *;
    `, values);

    await client.query('COMMIT');

    // Trigger FCM & DB push notifications for accept/reject
    if (status === 'accepted' && orderCreated) {
      sendNotification({
        userId: currentOffer.buyer_id,
        type: 'order',
        title: 'ऑर्डर स्वीकृत!',
        titleEn: 'Offer Accepted',
        body: `आपका ₹${currentOffer.offer_price}/${currentOffer.unit} (${currentOffer.crop}) का ऑफर स्वीकार कर लिया गया है।`,
        emoji: '🎉',
        data: {
          event: 'offer_accepted',
          orderId: orderCreated.id,
          offerId: currentOffer.id,
          listingId: currentOffer.listing_id,
          crop: currentOffer.crop,
          agreedPrice: String(currentOffer.offer_price),
        },
      }).catch(err => console.warn('[Offer Accepted Notification Error]:', err.message));
    } else if (status === 'rejected' && currentOffer.status !== 'rejected') {
      sendNotification({
        userId: currentOffer.buyer_id,
        type: 'offer',
        title: 'ऑफर अस्वीकृत',
        titleEn: 'Offer Rejected',
        body: `आपका ₹${currentOffer.offer_price}/${currentOffer.unit} (${currentOffer.crop}) का ऑफर अस्वीकार कर दिया गया।`,
        emoji: '❌',
        data: {
          event: 'offer_rejected',
          offerId: currentOffer.id,
          listingId: currentOffer.listing_id,
          crop: currentOffer.crop,
        },
      }).catch(err => console.warn('[Offer Rejected Notification Error]:', err.message));
    }

    res.json({
      success: true,
      data: updateRes.rows[0],
      ...(orderCreated && { order: orderCreated }),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// DELETE /api/v1/offers/:id
const deleteOffer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM offers WHERE id = $1 RETURNING id;', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Offer not found' });
    }
    res.json({ success: true, message: 'Offer deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listOffers,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
};
