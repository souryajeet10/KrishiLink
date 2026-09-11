/**
 * KrishiLink – Razorpay Standard Checkout Integration Tests
 * ==========================================================
 * Automated test suite covering:
 * 1. GET /api/payment/config (and /api/v1/payment/config)
 * 2. POST /api/create-order input validation (< 100 paise -> 400)
 * 3. POST /api/create-order order creation via Razorpay API (returns order_id)
 * 4. POST /api/verify-payment missing fields validation (400)
 * 5. POST /api/verify-payment forged/invalid signature rejection (400)
 * 6. POST /api/verify-payment valid HMAC-SHA256 signature verification (200)
 */

'use strict';

require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const { app } = require('./server');

const TEST_PORT = 14321;
let server;
let baseUrl;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      method: method.toUpperCase(),
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Accept': 'application/json',
        ...(postData ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        } : {}),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed,
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('\n🚀 Starting KrishiLink Razorpay Standard Checkout Tests...\n');

  // Start ephemeral test server
  server = app.listen(TEST_PORT);
  baseUrl = `http://localhost:${TEST_PORT}`;

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAILED: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Test GET /api/payment/config
    console.log('--- 1. Testing GET /api/payment/config ---');
    const cfgRes = await request('GET', '/api/payment/config');
    assert(cfgRes.statusCode === 200, 'GET /api/payment/config returns 200 OK');
    assert(cfgRes.data.success === true, 'Response contains success: true');
    assert(
      cfgRes.data.keyId === process.env.RAZORPAY_KEY_ID,
      'Response returns matching RAZORPAY_KEY_ID'
    );

    // Test alias GET /api/v1/payment/config
    const cfgV1Res = await request('GET', '/api/v1/payment/config');
    assert(cfgV1Res.statusCode === 200, 'GET /api/v1/payment/config returns 200 OK');

    // 2. Test Amount Validation (< 100 paise)
    console.log('\n--- 2. Testing Order Creation Validation (< 100 paise) ---');
    const lowAmountRes = await request('POST', '/api/create-order', {
      amount: 50, // 50 paise (< 100 paise minimum)
      currency: 'INR',
    });
    assert(
      lowAmountRes.statusCode === 400,
      'POST /api/create-order returns 400 for amount < 100 paise'
    );
    assert(
      lowAmountRes.data.error && lowAmountRes.data.error.includes('100 paise'),
      'Error message clarifies minimum amount requirement'
    );

    const zeroAmountRes = await request('POST', '/api/create-order', {
      amount: 0,
    });
    assert(zeroAmountRes.statusCode === 400, 'POST /api/create-order rejects zero amount');

    // 3. Test Order Creation via Razorpay API (Live Test Keys)
    console.log('\n--- 3. Testing Order Creation via Live Razorpay API ---');
    const orderPayload = {
      amount: 50000, // ₹500 in paise
      currency: 'INR',
      receipt: `rcpt_test_${Date.now()}`,
      notes: {
        crop: 'Tomato',
        quantity: 20,
        unit: 'kg',
      },
    };

    // Live Razorpay API call with provided test credentials
    const createRes = await request('POST', '/api/create-order', orderPayload);
    assert(
      createRes.statusCode === 201,
      `POST /api/create-order returns 201 Created (got ${createRes.statusCode})`
    );
    assert(createRes.data.success === true, 'create-order response has success: true');
    assert(
      typeof createRes.data.order_id === 'string' &&
        createRes.data.order_id.startsWith('order_'),
      `Generated Razorpay order ID starts with order_ (${createRes.data.order_id})`
    );
    assert(createRes.data.amount === 50000, 'Returned amount matches requested paise (50000)');
    assert(createRes.data.currency === 'INR', 'Currency is INR');
    assert(
      createRes.data.key_id === process.env.RAZORPAY_KEY_ID,
      'create-order returns public RAZORPAY_KEY_ID'
    );

    // Test alias POST /api/v1/create-order
    const createV1Res = await request('POST', '/api/v1/create-order', {
      amount: 25000, // ₹250
      currency: 'INR',
    });
    assert(createV1Res.statusCode === 201, 'POST /api/v1/create-order returns 201 Created');
    assert(
      createV1Res.data.order_id && createV1Res.data.order_id.startsWith('order_'),
      'Alias returned valid Razorpay order_id'
    );

    const createdRazorpayOrderId = createRes.data.order_id;

    // 4. Test Payment Verification - Missing Parameters
    console.log('\n--- 4. Testing Verification Validation (Missing Parameters) ---');
    const missingParamsRes = await request('POST', '/api/verify-payment', {
      razorpay_order_id: createdRazorpayOrderId,
      // missing payment_id and signature
    });
    assert(
      missingParamsRes.statusCode === 400,
      'POST /api/verify-payment returns 400 on missing parameters'
    );

    // 5. Test Payment Verification - Forged / Invalid Signature
    console.log('\n--- 5. Testing Verification - Forged / Invalid Signature ---');
    const forgedPaymentId = 'pay_fake1234567890';
    const fakeSignature = 'badf00d_invalid_hmac_signature_9876543210abcdef';

    const forgedRes = await request('POST', '/api/verify-payment', {
      razorpay_order_id: createdRazorpayOrderId,
      razorpay_payment_id: forgedPaymentId,
      razorpay_signature: fakeSignature,
    });
    assert(
      forgedRes.statusCode === 400,
      'POST /api/verify-payment returns 400 for forged signature'
    );
    assert(
      forgedRes.data.error && forgedRes.data.error.includes('mismatch'),
      'Error message notes signature mismatch'
    );

    // 6. Test Payment Verification - Genuine HMAC-SHA256 Signature
    console.log('\n--- 6. Testing Verification - Valid HMAC-SHA256 Signature ---');
    const validPaymentId = `pay_mock_${Date.now()}`;
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${createdRazorpayOrderId}|${validPaymentId}`)
      .digest('hex');

    const validVerifyRes = await request('POST', '/api/verify-payment', {
      razorpay_order_id: createdRazorpayOrderId,
      razorpay_payment_id: validPaymentId,
      razorpay_signature: generatedSignature,
      crop: 'Tomato',
      quantity: 20,
      unit: 'kg',
      agreedPrice: 25,
      totalAmount: 500,
      farmerId: '11111111-1111-1111-1111-111111111111',
      buyerId: '33333333-3333-3333-3333-333333333333',
    });

    assert(
      validVerifyRes.statusCode === 200,
      `POST /api/verify-payment returns 200 OK for authentic signature`
    );
    assert(validVerifyRes.data.success === true, 'Verification returns success: true');
    assert(
      validVerifyRes.data.payment_id === validPaymentId,
      'Verification returns payment_id'
    );
    assert(
      validVerifyRes.data.order_id === createdRazorpayOrderId,
      'Verification returns order_id'
    );

    console.log(`\n========================================`);
    console.log(`Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Unexpected test exception:', err);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests();
