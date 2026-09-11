const { query } = require('../config/db');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');
const { sendNotification } = require('../services/notificationService');

// GET /api/v1/orders
const listOrders = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { farmerId, buyerId, status, paymentStatus } = req.query;

    let whereClauses = [];
    let params = [];

    // Role-aware scoping: Buyers see only their purchases; Farmers see only their sales
    if (req.user && req.user.role === 'buyer') {
      params.push(req.user.id);
      whereClauses.push(`o.buyer_id = $${params.length}`);
    } else if (req.user && req.user.role === 'farmer') {
      params.push(req.user.id);
      whereClauses.push(`o.farmer_id = $${params.length}`);
    } else {
      // Admin or optional filter override
      if (farmerId) {
        params.push(farmerId);
        whereClauses.push(`o.farmer_id = $${params.length}`);
      }
      if (buyerId) {
        params.push(buyerId);
        whereClauses.push(`o.buyer_id = $${params.length}`);
      }
    }

    if (status) {
      params.push(status);
      whereClauses.push(`o.status = $${params.length}`);
    }
    if (paymentStatus) {
      params.push(paymentStatus);
      whereClauses.push(`o.payment_status = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) FROM orders o ${whereSql};`, params);
    const totalCount = countRes.rows[0].count;

    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT o.*,
             farmer.name AS farmer_name, farmer.phone AS farmer_phone,
             buyer.name AS buyer_name, buyer.phone AS buyer_phone,
             bp.company AS buyer_company,
             l.variety, l.grade, l.location_address
      FROM orders o
      JOIN users farmer ON o.farmer_id = farmer.id
      JOIN users buyer ON o.buyer_id = buyer.id
      LEFT JOIN buyer_profiles bp ON buyer.id = bp.user_id
      LEFT JOIN produce_listings l ON o.listing_id = l.id
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

// GET /api/v1/orders/:id
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const orderRes = await query(`
      SELECT o.*,
             farmer.name AS farmer_name, farmer.phone AS farmer_phone, farmer.email AS farmer_email,
             fp.village AS farmer_village, fp.district AS farmer_district, fp.state AS farmer_state,
             fp.latitude AS farmer_lat, fp.longitude AS farmer_lng,
             buyer.name AS buyer_name, buyer.phone AS buyer_phone, buyer.email AS buyer_email,
             bp.company AS buyer_company, bp.city AS buyer_city, bp.state AS buyer_state,
             bp.latitude AS buyer_lat, bp.longitude AS buyer_lng,
             l.variety, l.grade, l.location_address,
             l.latitude AS listing_lat, l.longitude AS listing_lng
      FROM orders o
      JOIN users farmer ON o.farmer_id = farmer.id
      LEFT JOIN farmer_profiles fp ON farmer.id = fp.user_id
      JOIN users buyer ON o.buyer_id = buyer.id
      LEFT JOIN buyer_profiles bp ON buyer.id = bp.user_id
      LEFT JOIN produce_listings l ON o.listing_id = l.id
      WHERE o.id = $1;
    `, [id]);

    if (orderRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const row = orderRes.rows[0];

    // Access control: only the buyer or seller on that specific order (or admin) can fetch detail
    if (req.user && req.user.role !== 'admin' && req.user.id !== row.buyer_id && req.user.id !== row.farmer_id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have permission to view this order.',
      });
    }

    // Determine normalized status: Ordered/Paid/Packed/Delivered/Cancelled
    let normalizedStatus = 'Ordered';
    const rawStatus = (row.status || '').toLowerCase();
    const rawPayment = (row.payment_status || '').toLowerCase();

    if (rawStatus === 'delivered') {
      normalizedStatus = 'Delivered';
    } else if (rawStatus === 'cancelled') {
      normalizedStatus = 'Cancelled';
    } else if (rawStatus === 'in_transit' || rawStatus === 'pickup_scheduled') {
      normalizedStatus = 'Packed';
    } else if (rawPayment === 'paid') {
      normalizedStatus = 'Paid';
    } else if (rawStatus === 'confirmed') {
      normalizedStatus = 'Ordered';
    }

    // Parse timeline safely
    let timeline = [];
    if (Array.isArray(row.timeline)) {
      timeline = row.timeline;
    } else if (typeof row.timeline === 'string') {
      try {
        timeline = JSON.parse(row.timeline);
      } catch {
        timeline = [];
      }
    }

    const detail = {
      ...row,
      orderId: row.id,
      id: row.id,
      status: normalizedStatus,
      rawStatus: row.status,
      paymentStatus: row.payment_status,
      produce: {
        name: row.crop,
        quantity: parseFloat(row.quantity),
        unit: row.unit || 'kg',
        pricePerUnit: parseFloat(row.agreed_price),
        totalAmount: parseFloat(row.total_amount),
        variety: row.variety || null,
        grade: row.grade || null,
      },
      payment: {
        status: rawPayment === 'paid' ? 'Paid (Test Mode)' : (rawPayment === 'escrowed' ? 'Escrowed (Test Mode)' : 'Pending (Test Mode)'),
        method: row.payment_method || (rawPayment === 'paid' ? 'Razorpay Standard Checkout' : 'Escrow on Delivery'),
        transactionId: row.payment_id || (rawPayment === 'paid' ? `pay_rzp_${row.id.replace(/-/g, '').slice(0, 14)}` : null),
        paidAt: row.paid_at || (rawPayment === 'paid' ? row.updated_at || row.created_at : null),
      },
      buyer: {
        id: row.buyer_id,
        name: row.buyer_name || 'Buyer',
        phone: row.buyer_phone || '',
        company: row.buyer_company || null,
      },
      seller: {
        id: row.farmer_id,
        name: row.farmer_name || 'Farmer',
        phone: row.farmer_phone || '',
      },
      location: {
        pickupAddress: row.location_address || [row.farmer_village, row.farmer_district, row.farmer_state].filter(Boolean).join(', ') || 'Farm Gate Pickup',
        deliveryAddress: [row.buyer_company, row.buyer_city, row.buyer_state].filter(Boolean).join(', ') || null,
        mandiName: row.location_address?.includes('Mandi') ? row.location_address : (row.farmer_district ? `${row.farmer_district} APMC Mandi` : null),
        lat: row.listing_lat !== null && row.listing_lat !== undefined ? parseFloat(row.listing_lat) : (row.farmer_lat !== null && row.farmer_lat !== undefined ? parseFloat(row.farmer_lat) : null),
        lng: row.listing_lng !== null && row.listing_lng !== undefined ? parseFloat(row.listing_lng) : (row.farmer_lng !== null && row.farmer_lng !== undefined ? parseFloat(row.farmer_lng) : null),
      },
      timestamps: {
        orderedAt: row.created_at,
        paidAt: row.paid_at || (rawPayment === 'paid' ? row.updated_at || row.created_at : null),
        deliveredAt: rawStatus === 'delivered' ? row.updated_at : null,
      },
      timeline,
    };

    res.json({
      success: true,
      data: detail,
      orderId: detail.orderId,
      status: detail.status,
      produce: detail.produce,
      payment: detail.payment,
      buyer: detail.buyer,
      seller: detail.seller,
      location: detail.location,
      timestamps: detail.timestamps,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/orders
const createOrder = async (req, res, next) => {
  try {
    const { listingId, offerId, farmerId, buyerId, crop, quantity, unit, agreedPrice, status, paymentStatus, timeline } = req.body;

    const qty = parseFloat(quantity);
    const price = parseFloat(agreedPrice);
    const totalAmount = qty * price;

    const todayStr = new Date().toISOString().split('T')[0];
    const initialTimeline = timeline || [
      { step: 'Order Created', date: todayStr, done: true },
      { step: 'Pickup Scheduled', date: '', done: false },
      { step: 'In Transit', date: '', done: false },
      { step: 'Delivered', date: '', done: false },
      { step: 'Payment Released', date: '', done: false }
    ];

    const result = await query(`
      INSERT INTO orders (
        listing_id, offer_id, farmer_id, buyer_id, crop, quantity, unit,
        agreed_price, total_amount, status, payment_status, timeline
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
      RETURNING *;
    `, [
      listingId || null,
      offerId || null,
      farmerId,
      buyerId,
      crop,
      qty,
      unit || 'kg',
      price,
      totalAmount,
      status || 'confirmed',
      paymentStatus || 'pending',
      JSON.stringify(initialTimeline)
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// PUT /api/v1/orders/:id
const updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus, timeline } = req.body;

    const existingRes = await query('SELECT * FROM orders WHERE id = $1;', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const previousOrder = existingRes.rows[0];

    const fields = [];
    const values = [];

    if (status !== undefined) { values.push(status); fields.push(`status = $${values.length}`); }
    if (paymentStatus !== undefined) { values.push(paymentStatus); fields.push(`payment_status = $${values.length}`); }
    if (timeline !== undefined) { values.push(JSON.stringify(timeline)); fields.push(`timeline = $${values.length}::jsonb`); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields provided for update' });
    }

    values.push(id);
    const updateSql = `
      UPDATE orders
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING *;
    `;

    const result = await query(updateSql, values);
    const updatedOrder = result.rows[0];

    // Trigger FCM push and in-app notifications if status changed
    if (status && status !== previousOrder.status) {
      const emoji = status === 'delivered' ? '📦' : status === 'cancelled' ? '❌' : '🚚';
      const statusTitleEn = `Order Status: ${status.replace(/_/g, ' ').toUpperCase()}`;
      const statusTitleHi = `ऑर्डर स्थिति अपडेट (${status})`;
      const bodyMsg = `ऑर्डर #${id.slice(0, 8)} (${updatedOrder.crop || previousOrder.crop || 'Produce'}) की स्थिति अब '${status}' है।`;

      const notifData = {
        event: 'order_status_change',
        orderId: updatedOrder.id,
        crop: updatedOrder.crop || previousOrder.crop,
        previousStatus: previousOrder.status,
        newStatus: status,
      };

      // Notify Buyer
      const targetBuyerId = updatedOrder.buyer_id || previousOrder.buyer_id;
      if (targetBuyerId) {
        sendNotification({
          userId: targetBuyerId,
          type: 'order',
          title: statusTitleHi,
          titleEn: statusTitleEn,
          body: bodyMsg,
          emoji,
          data: notifData,
        }).catch(err => console.warn('[Order Buyer Notification Error]:', err.message));
      }

      // Notify Farmer
      const targetFarmerId = updatedOrder.farmer_id || previousOrder.farmer_id;
      if (targetFarmerId) {
        sendNotification({
          userId: targetFarmerId,
          type: 'order',
          title: statusTitleHi,
          titleEn: statusTitleEn,
          body: bodyMsg,
          emoji,
          data: notifData,
        }).catch(err => console.warn('[Order Farmer Notification Error]:', err.message));
      }
    }

    res.json({ success: true, data: updatedOrder });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/v1/orders/:id
const deleteOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM orders WHERE id = $1 RETURNING id;', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
};
