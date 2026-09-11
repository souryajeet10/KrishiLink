/**
 * Automated Verification Script for KrishiLink API & Firebase Auth / RBAC
 */

const http = require('http');
const { app } = require('./server');
const { getPaginationParams, formatPaginatedResponse } = require('./src/utils/pagination');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const req = http.request({ ...options, port, host: '127.0.0.1' }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('\n--- 1. Testing Pagination Utility ---');
  const mockReq = { query: { page: '2', limit: '15' } };
  const params = getPaginationParams(mockReq);
  assert(params.page === 2, 'Page should parse correctly to 2');
  assert(params.limit === 15, 'Limit should parse correctly to 15');
  assert(params.offset === 15, 'Offset should be 15 for page 2 with limit 15');

  const paginatedRes = formatPaginatedResponse([1, 2, 3], 35, 2, 10);
  assert(paginatedRes.success === true, 'Response success should be true');
  assert(paginatedRes.pagination.totalPages === 4, 'Total pages for 35 items with limit 10 should be 4');
  assert(paginatedRes.pagination.hasNext === true, 'hasNext should be true');
  assert(paginatedRes.pagination.hasPrev === true, 'hasPrev should be true');

  console.log('\n--- 2. Starting Ephemeral Test Server ---');
  const testServer = http.createServer(app);
  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const port = testServer.address().port;
  console.log(`Test server running on port ${port}`);

  try {
    console.log('\n--- 3. Testing API Health Endpoint ---');
    const health = await makeRequest(testServer, { path: '/api/health', method: 'GET' });
    assert(health.data && typeof health.data.status === 'string', '/api/health returned valid health payload');
    assert(health.data.database !== undefined, '/api/health contains database connectivity report');

    console.log('\n--- 4. Testing 404 Handler ---');
    const notFound = await makeRequest(testServer, { path: '/api/v1/non-existent-resource', method: 'GET' });
    assert(notFound.status === 404, 'Unmatched API endpoint returns 404');
    assert(notFound.data.success === false, '404 returns structured JSON error');

    console.log('\n--- 5. Testing Authentication Middleware (401 Rejections) ---');
    // Request without Authorization header
    const noToken = await makeRequest(testServer, {
      path: '/api/v1/offers',
      method: 'GET'
    });
    assert(noToken.status === 401, 'Protected route without token returns 401 Unauthorized');
    assert(noToken.data.success === false, '401 response contains success: false');

    // Request with invalid token
    const invalidToken = await makeRequest(testServer, {
      path: '/api/v1/offers',
      method: 'GET',
      headers: { 'Authorization': 'Bearer bad-invalid-token' }
    });
    assert(invalidToken.status === 401, 'Protected route with malformed token returns 401');

    console.log('\n--- 6. Testing Role-Based Access Control (403 Rejections) ---');
    // Test tokens
    const farmerToken = 'Bearer dev-token-testfarmer01:farmer:9876543210';
    const buyerToken  = 'Bearer dev-token-testbuyer01:buyer:9123456789';
    const adminToken  = 'Bearer dev-token-testadmin01:admin:9000000001';

    // Farmer attempting to create a Buyer offer -> 403 Forbidden
    const farmerForbiddenOffer = await makeRequest(testServer, {
      path: '/api/v1/offers',
      method: 'POST',
      headers: {
        'Authorization': farmerToken,
        'Content-Type': 'application/json'
      }
    }, { listingId: 'aaaaaaaa-0001-0000-0000-000000000001' });
    assert(farmerForbiddenOffer.status === 403, 'Farmer attempting to create offer receives 403 Forbidden');
    assert(farmerForbiddenOffer.data.message.includes('Forbidden'), '403 error states permission restriction');

    // Buyer attempting to create a Farmer produce listing -> 403 Forbidden
    const buyerForbiddenListing = await makeRequest(testServer, {
      path: '/api/v1/listings',
      method: 'POST',
      headers: {
        'Authorization': buyerToken,
        'Content-Type': 'application/json'
      }
    }, { crop: 'Tomato' });
    assert(buyerForbiddenListing.status === 403, 'Buyer attempting to create listing receives 403 Forbidden');

    // Non-admin attempting to access /api/v1/admin/stats -> 403 Forbidden
    const nonAdminStats = await makeRequest(testServer, {
      path: '/api/v1/admin/stats',
      method: 'GET',
      headers: { 'Authorization': farmerToken }
    });
    assert(nonAdminStats.status === 403, 'Non-admin accessing /admin/stats receives 403 Forbidden');

    console.log('\n--- 7. Testing Authorized Requests & Validation ---');
    // Farmer creating listing with missing required fields -> 400 Validation Error
    const invalidListing = await makeRequest(testServer, {
      path: '/api/v1/listings',
      method: 'POST',
      headers: {
        'Authorization': farmerToken,
        'Content-Type': 'application/json'
      }
    }, { crop: 'Tomato' });
    assert(invalidListing.status === 400, 'Authorized farmer submitting invalid payload returns 400');
    assert(invalidListing.data.errors.some(e => e.field === 'quantity'), 'Validation caught missing quantity');
    assert(invalidListing.data.errors.some(e => e.field === 'askingPrice'), 'Validation caught missing askingPrice');

    // Buyer creating offer with invalid UUID -> 400 Validation Error
    const invalidOffer = await makeRequest(testServer, {
      path: '/api/v1/offers',
      method: 'POST',
      headers: {
        'Authorization': buyerToken,
        'Content-Type': 'application/json'
      }
    }, { listingId: 'not-a-uuid' });
    assert(invalidOffer.status === 400, 'Authorized buyer submitting invalid offer UUID returns 400');
    assert(invalidOffer.data.errors.some(e => e.field === 'listingId'), 'Validation caught invalid UUID format');

    // Public endpoint: Listings GET should be accessible without token
    const publicListings = await makeRequest(testServer, {
      path: '/api/v1/listings',
      method: 'GET'
    });
    assert(publicListings.status !== 401, 'Public listings GET is accessible without 401 rejection');

    console.log('\n--- 8. Testing User Sync & /auth/me ---');
    const meRes = await makeRequest(testServer, {
      path: '/api/v1/auth/me',
      method: 'GET',
      headers: { 'Authorization': farmerToken }
    });
    assert(meRes.status === 200, 'GET /api/v1/auth/me returns 200 OK');
    assert(meRes.data.user.role === 'farmer', '/auth/me returns correct user role');

    const syncRes = await makeRequest(testServer, {
      path: '/api/v1/auth/sync',
      method: 'POST',
      headers: {
        'Authorization': buyerToken,
        'Content-Type': 'application/json'
      },
    }, { name: 'Anil Sharma', company: 'FreshMart' });
    assert(syncRes.status === 200, 'POST /api/v1/auth/sync returns 200 OK');
    assert(syncRes.data.user.role === 'buyer', 'Sync successfully recognized buyer role');

    console.log('\n--- 9. Testing AGMARKNET Mandi Price API & Redis Cache ---');
    const { getCache, setCache, closeRedis } = require('./src/config/redis');

    // Test Redis cache set/get
    const testCacheKey = 'test:cache:mandi:tomato';
    await setCache(testCacheKey, { commodity: 'Tomato', modalPrice: 2250 }, 60);
    const cachedVal = await getCache(testCacheKey);
    assert(cachedVal && cachedVal.modalPrice === 2250, 'Redis / Memory cache successfully stores and retrieves data');

    // Test internal endpoint GET /api/v1/market-prices
    const mandiPricesRes = await makeRequest(testServer, {
      path: '/api/v1/market-prices?commodity=Tomato',
      method: 'GET'
    });
    assert(mandiPricesRes.status === 200, 'GET /api/v1/market-prices returns 200 OK');
    assert(typeof mandiPricesRes.data.source === 'string', 'Market prices response contains source identifier');
    assert(mandiPricesRes.data.resourceId === '9ef84268-d588-465a-a308-a864a43d0070', 'Market prices references AGMARKNET resource id 9ef84268-d588-465a-a308-a864a43d0070');
    assert(Array.isArray(mandiPricesRes.data.data), 'Market prices returns data array');
    assert(mandiPricesRes.data.data.length > 0, 'Market prices returns records');
    assert(mandiPricesRes.data.data[0].commodity.toLowerCase().includes('tomato'), 'Filter correctly matched Tomato commodity');

    console.log('\n--- 10. Testing Auth Endpoints (Register & Login) ---');
    const testRegPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const regRes = await makeRequest(testServer, {
      path: '/api/v1/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      role: 'farmer',
      name: 'Integration Test Farmer',
      phone: testRegPhone,
      password: 'testpassword123',
      village: 'Kisan Nagar',
      district: 'Nashik',
      state: 'Maharashtra'
    });
    assert(regRes.status === 201 && regRes.data.success, 'POST /api/v1/auth/register creates new user');
    assert(regRes.data.user && regRes.data.user.role === 'farmer', 'Registered user has correct role');

    const loginRes = await makeRequest(testServer, {
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      phoneOrEmail: testRegPhone,
      password: 'testpassword123'
    });
    assert(loginRes.status === 200 && loginRes.data.success, 'POST /api/v1/auth/login succeeds with credentials');
    assert(loginRes.data.user.phone === testRegPhone, 'Logged in user matches phone');

    console.log('\n--- 11. Testing Produce Listings Endpoints (CRUD) ---');
    // Create listing
    const newListingRes = await makeRequest(testServer, {
      path: '/api/v1/listings',
      method: 'POST',
      headers: {
        'Authorization': farmerToken,
        'Content-Type': 'application/json'
      }
    }, {
      crop: 'Fresh Green Peas',
      variety: 'Arkel',
      quantity: 500,
      unit: 'kg',
      askingPrice: 45,
      grade: 'A',
      locationAddress: 'Pune Mandi Yard'
    });
    assert(newListingRes.status === 201 && newListingRes.data.success, 'POST /api/v1/listings creates produce listing');
    const testListingId = newListingRes.data.data.id;
    assert(Boolean(testListingId), `Listing created with ID ${testListingId}`);

    // Fetch listing by ID
    const getListingRes = await makeRequest(testServer, {
      path: `/api/v1/listings/${testListingId}`,
      method: 'GET'
    });
    assert(getListingRes.status === 200 && getListingRes.data.success, 'GET /api/v1/listings/:id retrieves listing details');
    assert(getListingRes.data.data.crop === 'Fresh Green Peas', 'Listing crop matches');

    // Update listing
    const updateListingRes = await makeRequest(testServer, {
      path: `/api/v1/listings/${testListingId}`,
      method: 'PUT',
      headers: {
        'Authorization': farmerToken,
        'Content-Type': 'application/json'
      }
    }, { askingPrice: 48, quantity: 450 });
    assert(updateListingRes.status === 200 && updateListingRes.data.success, 'PUT /api/v1/listings/:id updates listing');
    assert(parseFloat(updateListingRes.data.data.asking_price) === 48, 'Updated asking price reflected');

    console.log('\n--- 12. Testing Offers Endpoints ---');
    // Create offer
    const newOfferRes = await makeRequest(testServer, {
      path: '/api/v1/offers',
      method: 'POST',
      headers: {
        'Authorization': buyerToken,
        'Content-Type': 'application/json'
      }
    }, {
      listingId: testListingId,
      buyerId: syncRes.data.user.id,
      offerPrice: 44,
      quantity: 300,
      message: 'Can pick up tomorrow morning.'
    });
    assert(newOfferRes.status === 201 && newOfferRes.data.success, 'POST /api/v1/offers creates buyer offer');
    const testOfferId = newOfferRes.data.data.id;
    assert(Boolean(testOfferId), `Offer created with ID ${testOfferId}`);

    // Buyer attempting to list offers must receive 403 Forbidden
    const buyerListOffersRes = await makeRequest(testServer, {
      path: '/api/v1/offers',
      method: 'GET',
      headers: { 'Authorization': buyerToken }
    });
    assert(buyerListOffersRes.status === 403, 'GET /api/v1/offers returns 403 Forbidden for buyer role');

    // List offers with farmer token
    const listOffersRes = await makeRequest(testServer, {
      path: `/api/v1/offers?listingId=${testListingId}`,
      method: 'GET',
      headers: { 'Authorization': farmerToken }
    });
    assert(listOffersRes.status === 200 && listOffersRes.data.success, 'GET /api/v1/offers returns offers for farmer');
    assert(listOffersRes.data.data.length >= 1, 'Offers list contains newly created offer');

    // Get offer by ID
    const getOfferRes = await makeRequest(testServer, {
      path: `/api/v1/offers/${testOfferId}`,
      method: 'GET',
      headers: { 'Authorization': buyerToken }
    });
    assert(getOfferRes.status === 200 && getOfferRes.data.success, 'GET /api/v1/offers/:id retrieves offer');

    console.log('\n--- 13. Testing Orders Endpoints & Detailed View ---');
    // Create order directly
    const newOrderRes = await makeRequest(testServer, {
      path: '/api/v1/orders',
      method: 'POST',
      headers: {
        'Authorization': buyerToken,
        'Content-Type': 'application/json'
      }
    }, {
      listingId: testListingId,
      offerId: testOfferId,
      farmerId: meRes.data.user.id,
      buyerId: syncRes.data.user.id,
      crop: 'Fresh Green Peas',
      quantity: 200,
      unit: 'kg',
      agreedPrice: 44,
      status: 'confirmed'
    });
    assert(newOrderRes.status === 201 && newOrderRes.data.success, 'POST /api/v1/orders creates order');
    const testOrderId = newOrderRes.data.data.id;

    // List orders as Buyer: role-aware scoping
    const buyerOrdersRes = await makeRequest(testServer, {
      path: '/api/v1/orders',
      method: 'GET',
      headers: { 'Authorization': buyerToken }
    });
    assert(buyerOrdersRes.status === 200 && buyerOrdersRes.data.success, 'GET /api/v1/orders lists orders for buyer');
    const allBuyerOwned = buyerOrdersRes.data.data.every(o => o.buyer_id === syncRes.data.user.id);
    assert(allBuyerOwned, 'Buyer orders only contain current buyer_id');

    // List orders as Farmer: role-aware scoping
    const farmerOrdersRes = await makeRequest(testServer, {
      path: '/api/v1/orders',
      method: 'GET',
      headers: { 'Authorization': farmerToken }
    });
    assert(farmerOrdersRes.status === 200 && farmerOrdersRes.data.success, 'GET /api/v1/orders lists orders for farmer');
    const allFarmerOwned = farmerOrdersRes.data.data.every(o => o.farmer_id === meRes.data.user.id);
    assert(allFarmerOwned, 'Farmer orders only contain current farmer_id');

    // Get order by ID: verify full detailed structure
    const getOrderRes = await makeRequest(testServer, {
      path: `/api/v1/orders/${testOrderId}`,
      method: 'GET',
      headers: { 'Authorization': buyerToken }
    });
    assert(getOrderRes.status === 200 && getOrderRes.data.success, 'GET /api/v1/orders/:id retrieves order details');
    const orderData = getOrderRes.data.data;
    assert(orderData.orderId === testOrderId, 'Order detail includes orderId');
    assert(['Ordered', 'Paid', 'Packed', 'Delivered', 'Cancelled'].includes(orderData.status), `Status is normalized: ${orderData.status}`);
    assert(Boolean(orderData.produce && orderData.produce.name === 'Fresh Green Peas'), 'Produce section contains name');
    assert(Boolean(orderData.produce && orderData.produce.quantity === 200), 'Produce section contains quantity');
    assert(Boolean(orderData.produce && orderData.produce.pricePerUnit === 44), 'Produce section contains pricePerUnit');
    assert(Boolean(orderData.payment && orderData.payment.status && orderData.payment.method), 'Payment section contains status and method');
    assert(Boolean(orderData.buyer && orderData.buyer.id === syncRes.data.user.id), 'Buyer section contains buyer details');
    assert(Boolean(orderData.seller && orderData.seller.id === meRes.data.user.id), 'Seller section contains seller details');
    assert(Boolean(orderData.location && typeof orderData.location.pickupAddress === 'string'), 'Location section contains pickupAddress');
    assert(Boolean(orderData.timestamps && orderData.timestamps.orderedAt), 'Timestamps section contains orderedAt');

    // Access control test: unrelated user fetching order detail must receive 403 Forbidden
    const unrelatedToken = 'Bearer dev-token-unrelatedbuyer:buyer:9234567890';
    const unauthorizedOrderRes = await makeRequest(testServer, {
      path: `/api/v1/orders/${testOrderId}`,
      method: 'GET',
      headers: { 'Authorization': unrelatedToken }
    });
    assert(unauthorizedOrderRes.status === 403, 'GET /api/v1/orders/:id returns 403 Forbidden for unauthorized user');

    // Update order status
    const updateOrderRes = await makeRequest(testServer, {
      path: `/api/v1/orders/${testOrderId}`,
      method: 'PUT',
      headers: {
        'Authorization': buyerToken,
        'Content-Type': 'application/json'
      }
    }, { status: 'in_transit' });
    assert(updateOrderRes.status === 200 && updateOrderRes.data.success, 'PUT /api/v1/orders/:id updates order status');
    assert(updateOrderRes.data.data.status === 'in_transit', 'Order status updated to in_transit');

    console.log('\n--- 14. Testing Market Prices Additional Endpoints ---');
    const commoditiesRes = await makeRequest(testServer, {
      path: '/api/v1/market-prices/commodities',
      method: 'GET'
    });
    assert(commoditiesRes.status === 200 && commoditiesRes.data.success, 'GET /api/v1/market-prices/commodities returns 200 OK');
    assert(Array.isArray(commoditiesRes.data.data), 'Commodities list is an array');

    console.log('\n--- 15. Testing Notifications & FCM Device Token Registration ---');
    // Register FCM token
    const registerFcmRes = await makeRequest(testServer, {
      path: '/api/v1/notifications/fcm-token',
      method: 'POST',
      headers: {
        'Authorization': farmerToken,
        'Content-Type': 'application/json'
      }
    }, {
      token: 'fcm_test_device_token_abc123',
      deviceType: 'android'
    });
    assert(registerFcmRes.status === 200 && registerFcmRes.data.success, 'POST /api/v1/notifications/fcm-token registers FCM device token');

    // List notifications
    const notificationsRes = await makeRequest(testServer, {
      path: '/api/v1/notifications',
      method: 'GET',
      headers: { 'Authorization': farmerToken }
    });
    assert(notificationsRes.status === 200 && notificationsRes.data.success, 'GET /api/v1/notifications returns user notifications');

    // Mark all read
    const markReadRes = await makeRequest(testServer, {
      path: '/api/v1/notifications/mark-all-read',
      method: 'PATCH',
      headers: {
        'Authorization': farmerToken,
        'Content-Type': 'application/json'
      }
    });
    assert(markReadRes.status === 200 && markReadRes.data.success, 'PATCH /api/v1/notifications/mark-all-read succeeds');

    console.log('\n🎉 ALL AUTOMATED INTEGRATION TESTS COMPLETED SUCCESSFULLY!\n');
  } finally {
    testServer.close();
    const { closeRedis } = require('./src/config/redis');
    await closeRedis();
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
