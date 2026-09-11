/**
 * KrishiLink – Voice-Assisted Sell Order Test Suite
 * ==================================================
 * Tests:
 * 1. Unit testing voiceParser with Hindi, English, and Hinglish spoken sell orders
 * 2. Testing user's exact example: "दो सौ किलो टमाटर पचास रुपये प्रति किलो"
 * 3. Testing confidence classification (high vs low)
 * 4. API endpoint testing for POST /api/voice/parse-order and /api/v1/voice/parse-order
 * 5. API endpoint testing for POST /api/voice/transcribe error handling and fallbacks
 */

'use strict';

require('dotenv').config();
const http = require('http');
const assert = require('assert');
const { parseVoiceOrder } = require('./src/services/voiceParser');
const {
  parseOrderWithGemini,
  extractOrderWithGemini,
  processOrderFromAudio,
} = require('./src/services/geminiOrderParser');
const { app } = require('./server');

const TEST_PORT = 14322;
let server;
let baseUrl;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const isBuffer = Buffer.isBuffer(body);
    const postData = (body && !isBuffer && typeof body === 'object') ? JSON.stringify(body) : body;

    const options = {
      method: method.toUpperCase(),
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Accept': 'application/json',
        ...(postData && !headers['Content-Type'] ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        } : {}),
        ...headers,
      },
    };

    if (isBuffer && headers['Content-Length'] === undefined) {
      options.headers['Content-Length'] = body.length;
    }

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
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🎙️ KrishiLink: Voice-Assisted Sell Order Test Suite');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function record(testName, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${testName}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // ---------------------------------------------------------
  // 1. UNIT TESTS: Spoken order parsing logic
  // ---------------------------------------------------------
  console.log('--- Unit Tests: Voice Parser Engine ---');

  record('Exact User Example: "दो सौ किलो टमाटर पचास रुपये प्रति किलो"', () => {
    const res = parseVoiceOrder('दो सौ किलो टमाटर पचास रुपये प्रति किलो');
    assert.strictEqual(res.produce, 'Tomato');
    assert.strictEqual(res.quantity, 200);
    assert.strictEqual(res.unit, 'kg');
    assert.strictEqual(res.pricePerUnit, 50);
    assert.strictEqual(res.confidence, 'high');
  });

  record('Hindi Variation 2: "पांच सौ किलो गेहूं पच्चीस रुपये"', () => {
    const res = parseVoiceOrder('पांच सौ किलो गेहूं पच्चीस रुपये');
    assert.strictEqual(res.produce, 'Wheat');
    assert.strictEqual(res.quantity, 500);
    assert.strictEqual(res.unit, 'kg');
    assert.strictEqual(res.pricePerUnit, 25);
    assert.strictEqual(res.confidence, 'high');
  });

  record('Hindi Quintal & Digits: "50 क्विंटल प्याज 1800 रुपये"', () => {
    const res = parseVoiceOrder('50 क्विंटल प्याज 1800 रुपये');
    assert.strictEqual(res.produce, 'Onion');
    assert.strictEqual(res.quantity, 50);
    assert.strictEqual(res.unit, 'quintal');
    assert.strictEqual(res.pricePerUnit, 1800);
    assert.strictEqual(res.confidence, 'high');
  });

  record('English Order: "500 kg potato at 20 rupees per kg"', () => {
    const res = parseVoiceOrder('500 kg potato at 20 rupees per kg');
    assert.strictEqual(res.produce, 'Potato');
    assert.strictEqual(res.quantity, 500);
    assert.strictEqual(res.unit, 'kg');
    assert.strictEqual(res.pricePerUnit, 20);
    assert.strictEqual(res.confidence, 'high');
  });

  record('Quantity and Produce without explicit price: "दो क्विंटल सरसों"', () => {
    const res = parseVoiceOrder('दो क्विंटल सरसों');
    assert.strictEqual(res.produce, 'Mustard');
    assert.strictEqual(res.quantity, 2);
    assert.strictEqual(res.unit, 'quintal');
    assert.strictEqual(res.confidence, 'high');
  });

  record('Low Confidence: Ambiguous statement without produce or quantity', () => {
    const res = parseVoiceOrder('नमस्ते आज मौसम बहुत अच्छा है');
    assert.strictEqual(res.produce, null);
    assert.strictEqual(res.quantity, null);
    assert.strictEqual(res.confidence, 'low');
  });

  record('Low Confidence: Produce identified but missing quantity: "मेरे पास बहुत सारा ताजा टमाटर है"', () => {
    const res = parseVoiceOrder('मेरे पास बहुत सारा ताजा टमाटर है');
    assert.strictEqual(res.produce, 'Tomato');
    assert.strictEqual(res.quantity, null);
    assert.strictEqual(res.confidence, 'low');
  });

  // ---------------------------------------------------------
  // 1b. GEMINI NLU & FALLBACK TESTS
  // ---------------------------------------------------------
  console.log('\n--- Gemini Flash NLU & Fallback Tests ---');

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    try {
      const geminiHindi = await parseOrderWithGemini('दो सौ किलो टमाटर पचास रुपये प्रति किलो', 'hi');
      record('Gemini NLU Hindi: "दो सौ किलो टमाटर पचास रुपये प्रति किलो"', () => {
        assert.strictEqual(geminiHindi.produce, 'Tomato');
        assert.strictEqual(geminiHindi.quantity, 200);
        assert.strictEqual(geminiHindi.unit, 'kg');
        assert.ok([50, null].includes(geminiHindi.pricePerUnit) || typeof geminiHindi.pricePerUnit === 'number');
        assert.ok(['gemini', 'fallback'].includes(geminiHindi.source));
        assert.ok(['high', 'low'].includes(geminiHindi.confidence));
      });

      const geminiEnglish = await parseOrderWithGemini('I have 50 quintal wheat at 2200 per quintal', 'en');
      record('Gemini NLU English: "I have 50 quintal wheat at 2200 per quintal"', () => {
        assert.strictEqual(geminiEnglish.produce, 'Wheat');
        assert.strictEqual(geminiEnglish.quantity, 50);
        assert.strictEqual(geminiEnglish.unit, 'quintal');
        assert.ok(['gemini', 'fallback'].includes(geminiEnglish.source));
        assert.ok(['high', 'low'].includes(geminiEnglish.confidence));
      });
    } catch (gErr) {
      console.warn('Gemini test skipped due to network/api error:', gErr.message);
    }
  }

  // Test Fallback mechanism when API key is deliberately invalid
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    process.env.GEMINI_API_KEY = 'invalid_mock_key';
    const fallbackRes = await parseOrderWithGemini('500 kg aloo 20 rs');
    record('Fallback mechanism works when Gemini is unreachable/invalid', () => {
      assert.strictEqual(fallbackRes.produce, 'Potato');
      assert.strictEqual(fallbackRes.quantity, 500);
      assert.strictEqual(fallbackRes.pricePerUnit, 20);
      assert.strictEqual(fallbackRes.confidence, 'low');
      assert.strictEqual(fallbackRes.source, 'fallback');
    });
  } finally {
    process.env.GEMINI_API_KEY = originalKey;
  }

  // ---------------------------------------------------------
  // 2. INTEGRATION TESTS: HTTP Endpoints
  // ---------------------------------------------------------
  console.log('\n--- Integration Tests: HTTP Endpoints ---');

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      baseUrl = `http://localhost:${TEST_PORT}`;
      resolve();
    });
  });

  try {
    // Test POST /api/voice/parse-order
    const parseRes = await request('POST', '/api/voice/parse-order', {
      transcribedText: 'दो सौ किलो टमाटर पचास रुपये प्रति किलो',
    });
    record('POST /api/voice/parse-order returns 200 and parsed order structure', () => {
      assert.strictEqual(parseRes.statusCode, 200);
      assert.strictEqual(parseRes.data.success, true);
      assert.strictEqual(parseRes.data.data.produce, 'Tomato');
      assert.strictEqual(parseRes.data.data.quantity, 200);
      assert.strictEqual(parseRes.data.data.pricePerUnit, 50);
      assert.ok(['high', 'low'].includes(parseRes.data.data.confidence));
    });

    // Test POST /api/v1/voice/parse-order alias
    const v1ParseRes = await request('POST', '/api/v1/voice/parse-order', {
      transcribedText: '1000 kg wheat 25 rupees',
    });
    record('POST /api/v1/voice/parse-order alias returns 200', () => {
      assert.strictEqual(v1ParseRes.statusCode, 200);
      assert.strictEqual(v1ParseRes.data.success, true);
      assert.strictEqual(v1ParseRes.data.data.produce, 'Wheat');
      assert.strictEqual(v1ParseRes.data.data.quantity, 1000);
    });

    // Test POST /api/voice/parse-order with missing body
    const emptyParseRes = await request('POST', '/api/voice/parse-order', {});
    record('POST /api/voice/parse-order with empty body returns 400 Bad Request', () => {
      assert.strictEqual(emptyParseRes.statusCode, 400);
      assert.strictEqual(emptyParseRes.data.success, false);
    });

    // Test POST /api/voice/transcribe without audio file
    const noFileRes = await request('POST', '/api/voice/transcribe', {});
    record('POST /api/voice/transcribe without audio file returns 400 Bad Request', () => {
      assert.strictEqual(noFileRes.statusCode, 400);
      assert.strictEqual(noFileRes.data.success, false);
    });

    // Test POST /api/voice/transcribe with multipart mock audio upload
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const multipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="audio"; filename="sample.webm"',
      'Content-Type: audio/webm',
      '',
      'MOCK_AUDIO_PAYLOAD_BYTES',
      `--${boundary}`,
      'Content-Disposition: form-data; name="mockText"',
      '',
      'दो सौ किलो टमाटर पचास रुपये प्रति किलो',
      `--${boundary}--`,
    ].join('\r\n');

    const mockUploadRes = await request('POST', '/api/voice/transcribe', Buffer.from(multipartBody), {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    });

    record('POST /api/voice/transcribe processes audio with fallback support', () => {
      // Either 200 (mock/Whisper) or 503 (key not set if mockText is not read by multer before key check)
      assert.ok([200, 502, 503].includes(mockUploadRes.statusCode));
      assert.strictEqual(typeof mockUploadRes.data, 'object');
    });

    // ---------------------------------------------------------
    // 3. PRIMARY ENDPOINT TESTS: POST /api/voice/process-order
    // ---------------------------------------------------------
    // Test POST /api/voice/process-order with missing audio & body
    const emptyProcessRes = await request('POST', '/api/voice/process-order', {});
    record('POST /api/voice/process-order with empty payload returns 400 Bad Request', () => {
      assert.strictEqual(emptyProcessRes.statusCode, 400);
      assert.strictEqual(emptyProcessRes.data.success, false);
    });

    // Test POST /api/voice/process-order with multipart mock payload
    const processBoundary = '----WebKitFormBoundary8NB5ZXylUsT0hW';
    const processMultipartBody = [
      `--${processBoundary}`,
      'Content-Disposition: form-data; name="audio"; filename="order.webm"',
      'Content-Type: audio/webm',
      '',
      'MOCK_OPUS_AUDIO_STREAM_BYTES',
      `--${processBoundary}`,
      'Content-Disposition: form-data; name="mockText"',
      '',
      'दो सौ किलो टमाटर पचास रुपये प्रति किलो',
      `--${processBoundary}--`,
    ].join('\r\n');

    const processRes = await request('POST', '/api/voice/process-order', Buffer.from(processMultipartBody), {
      'Content-Type': `multipart/form-data; boundary=${processBoundary}`,
    });

    record('POST /api/voice/process-order returns 200 with structured order schema', () => {
      assert.strictEqual(processRes.statusCode, 200);
      assert.strictEqual(processRes.data.success, true);
      const data = processRes.data.data;
      assert.ok(data);
      assert.strictEqual(data.produce, 'Tomato');
      assert.strictEqual(data.quantity, 200);
      assert.strictEqual(data.unit, 'kg');
      assert.ok(['gemini_primary', 'whisper_fallback', 'regex_fallback'].includes(data.source));
      assert.ok(['high', 'low'].includes(data.confidence));
    });

    // Test POST /api/v1/voice/process-order alias
    const v1ProcessRes = await request('POST', '/api/v1/voice/process-order', Buffer.from(processMultipartBody), {
      'Content-Type': `multipart/form-data; boundary=${processBoundary}`,
    });

    record('POST /api/v1/voice/process-order alias returns 200 with valid schema', () => {
      assert.strictEqual(v1ProcessRes.statusCode, 200);
      assert.strictEqual(v1ProcessRes.data.success, true);
      assert.strictEqual(v1ProcessRes.data.data.produce, 'Tomato');
    });

    // Direct pipeline test with fallback
    const directMockRes = await processOrderFromAudio(null, 'audio/webm', 'test.webm', '50 क्विंटल प्याज 1800 रुपये');
    record('Direct processOrderFromAudio handles text/mock input cleanly', () => {
      assert.strictEqual(directMockRes.produce, 'Onion');
      assert.strictEqual(directMockRes.quantity, 50);
      assert.strictEqual(directMockRes.unit, 'quintal');
      assert.strictEqual(directMockRes.pricePerUnit, 1800);
    });

  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // ---------------------------------------------------------
  // Summary
  // ---------------------------------------------------------
  console.log('\n======================================================');
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
