/**
 * KrishiLink – Razorpay Payment Controller
 * =========================================
 * Handles order creation, signature verification, and Razorpay configuration.
 */

'use strict';

const crypto = require('crypto');
const Razorpay = require('razorpay');
const { query } = require('../config/db');
const { sendNotification } = require('../services/notificationService');

/**
 * Initialize Razorpay instance safely using environment variables
 */
function getRazorpayInstance() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error('Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) not configured.');
  }

  return new Razorpay({
    key_id: key_id.trim(),
    key_secret: key_secret.trim(),
  });
}

/**
 * GET /api/payment/config or /api/config
 * Returns public Razorpay key ID for client-side checkout
 */
const getPaymentConfig = (req, res) => {
  const keyId = (process.env.RAZORPAY_KEY_ID || '').trim();
  res.json({
    success: true,
    keyId: keyId,
  });
};

/**
 * POST /api/create-order or /api/payment/create-order
 * Request body: { amount (paise), currency, receipt, notes }
 * Minimum amount: 100 paise (₹1)
 * Return: { order_id, amount, currency, key_id }
 */
const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount < 100) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be at least 100 paise (₹1)',
      });
    }

    let rzp;
    try {
      rzp = getRazorpayInstance();
    } catch (cfgErr) {
      return res.status(500).json({
        success: false,
        error: cfgErr.message,
      });
    }

    const orderPayload = {
      amount: numAmount,
      currency: (currency || 'INR').toUpperCase(),
      receipt: receipt || `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      notes: notes || {},
    };

    const order = await rzp.orders.create(orderPayload);
    return res.status(201).json({
      success: true,
      order_id: order.id,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('Razorpay create-order error:', err);
    if (
      err.statusCode === 401 ||
      (err.error && err.error.code === 'BAD_REQUEST_ERROR' && err.error.description?.toLowerCase().includes('auth'))
    ) {
      return res.status(401).json({
        success: false,
        error: 'Razorpay authentication failed. Verify API credentials.',
      });
    }
    return res.status(500).json({
      success: false,
      error: err.description || err.error?.description || err.message || 'Failed to create Razorpay order',
    });
  }
};

/**
 * POST /api/verify-payment or /api/payment/verify-payment
 * Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
 * Compare generated signature with razorpay_signature
 * Return success only if signatures match
 */
const verifyPaymentSignature = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      // Optional order details to record order in KrishiLink
      listingId,
      farmerId,
      buyerId,
      crop,
      quantity,
      unit,
      agreedPrice,
      totalAmount,
    } = req.body;

    // Validate required verification fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
      });
    }

    const keySecret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
    if (!keySecret) {
      return res.status(500).json({
        success: false,
        error: 'Razorpay Key Secret is not configured on the server.',
      });
    }

    // HMAC-SHA256 calculation
    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    // Secure string comparison
    const sigBuf = Buffer.from(razorpay_signature, 'utf-8');
    const expBuf = Buffer.from(expectedSignature, 'utf-8');
    const isMatch = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'Payment signature verification failed. Signature mismatch.',
      });
    }

    // Payment successfully verified!
    let createdOrder = null;

    // If order creation details were passed, create the order in KrishiLink DB
    if (farmerId && buyerId && crop && quantity && agreedPrice) {
      try {
        const qty = parseFloat(quantity);
        const price = parseFloat(agreedPrice);
        const total = totalAmount ? parseFloat(totalAmount) : qty * price;
        const todayStr = new Date().toISOString().split('T')[0];
        const timeline = [
          { step: 'Order Created', date: todayStr, done: true },
          { step: 'Payment Escrowed (Razorpay)', date: todayStr, done: true },
          { step: 'Pickup Scheduled', date: '', done: false },
          { step: 'In Transit', date: '', done: false },
          { step: 'Delivered', date: '', done: false },
        ];

        const insertRes = await query(
          `
          INSERT INTO orders (
            listing_id, farmer_id, buyer_id, crop, quantity, unit,
            agreed_price, total_amount, status, payment_status, timeline
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
          RETURNING *;
        `,
          [
            listingId || null,
            farmerId,
            buyerId,
            crop,
            qty,
            unit || 'kg',
            price,
            total,
            'confirmed',
            'paid',
            JSON.stringify(timeline),
          ]
        );
        createdOrder = insertRes.rows[0];

        // Send notifications
        sendNotification({
          userId: farmerId,
          title: '💰 Produce Sold & Paid!',
          body: `Direct purchase for ${crop} (${qty} ${unit || 'kg'}) completed via Razorpay. Order #${createdOrder.id.slice(0, 8)}`,
          type: 'order',
          data: { orderId: createdOrder.id, paymentId: razorpay_payment_id },
        }).catch(e => console.warn('Notification notice:', e.message));

        sendNotification({
          userId: buyerId,
          title: '✅ Payment Successful',
          body: `Your payment of ₹${total.toLocaleString('en-IN')} for ${crop} was confirmed. Order #${createdOrder.id.slice(0, 8)}`,
          type: 'order',
          data: { orderId: createdOrder.id, paymentId: razorpay_payment_id },
        }).catch(e => console.warn('Notification notice:', e.message));
      } catch (dbErr) {
        console.warn('Order DB persistence notice:', dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      order: createdOrder,
    });
  } catch (err) {
    console.error('Verify payment error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error verifying payment',
    });
  }
};

module.exports = {
  getPaymentConfig,
  createRazorpayOrder,
  verifyPaymentSignature,
};
