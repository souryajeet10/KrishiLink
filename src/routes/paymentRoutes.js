/**
 * KrishiLink – Razorpay Payment Routes
 * =====================================
 * Routes for Razorpay Standard Checkout:
 * - GET  /config          -> Returns public key ID
 * - POST /create-order    -> Creates order with Razorpay
 * - POST /verify-payment  -> Verifies HMAC-SHA256 signature
 */

'use strict';

const express = require('express');
const {
  getPaymentConfig,
  createRazorpayOrder,
  verifyPaymentSignature,
} = require('../controllers/paymentController');

const router = express.Router();

// Configuration endpoint (public key ID)
router.get('/config', getPaymentConfig);

// Order creation endpoint
router.post('/create-order', createRazorpayOrder);

// Payment verification endpoint
router.post('/verify-payment', verifyPaymentSignature);

module.exports = router;
