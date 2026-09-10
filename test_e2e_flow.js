/**
 * End-to-End Demo Flow Automated Test for KrishiLink
 * 
 * Complete Demo & Integration Flow:
 *  1. Farmer Login (9876543210) & FCM Token Registration
 *  2. Farmer creates produce listing (POST /api/v1/listings)
 *  3. Buyer Login (9123456789) & FCM Token Registration
 *  4. Buyer views marketplace (GET /api/v1/listings) & fetches details
 *  5. Buyer submits offer -> Triggers FCM & DB notification to farmer (New Offer Received)
 *  6. Farmer accepts offer -> Generates order & triggers notification to buyer (Offer Accepted)
 *  7. Order status changed to 'in_transit' -> Triggers notification to buyer & farmer
 *  8. Buyer submits 2nd offer and Farmer rejects -> Triggers notification to buyer (Offer Rejected)
 *  9. Notifications & FCM payload audit verification
 * 10. Mandi prices & Nearby Mandis (GET /api/v1/market-prices)
 * 11. Admin dashboard & stats (GET /api/v1/admin/stats)
 */

const http = require('http');
const { app } = require('./server');
const { getSentNotifications, clearSentNotifications } = require('./src/services/notificationService');

function assert(cond, msg, data = null) {
  if (!cond) {
    console.error(`❌ FAILURE: ${msg}`, data ? JSON.stringify(data, null, 2) : '');
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
}

function makeReq(server, path, method = 'GET', token = null, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runE2E() {
  console.log('🚀 Starting KrishiLink Full E2E Demo & FCM Notification Flow Test...\n');
  clearSentNotifications();

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  console.log(`Ephemeral server listening on port ${port}\n`);

  try {
    // ── 1. Farmer Login & FCM Registration ───────────────────────────
    console.log('--- Step 1: Farmer Login (Ramesh Patel) & Register Device Token ---');
    const farmerToken = 'dev-token-farmer-ramesh:farmer:9876543210:Ramesh%20Patel';
    const farmerSync = await makeReq(server, '/api/v1/auth/sync', 'POST', farmerToken, {
      phoneOrEmail: '9876543210',
      role: 'farmer'
    });
    assert(farmerSync.status === 200 && farmerSync.data.success, 'Farmer sync succeeded');
    const farmerUser = farmerSync.data.user;
    assert(farmerUser.role === 'farmer', `User role is farmer (id: ${farmerUser.id})`);

    // Register Farmer FCM token
    const farmerFcmToken = 'fcm_token_farmer_ramesh_device_001';
    const farmerTokenReg = await makeReq(server, '/api/v1/notifications/fcm-token', 'POST', farmerToken, {
      token: farmerFcmToken,
      deviceType: 'android'
    });
    assert(farmerTokenReg.status === 200 && farmerTokenReg.data.success, 'Farmer successfully registered FCM device token');

    // ── 2. Farmer Creates Produce Listing ────────────────────────────
    console.log('\n--- Step 2: Farmer Adds Produce Listing ---');
    const createListingRes = await makeReq(server, '/api/v1/listings', 'POST', farmerToken, {
      farmerId: farmerUser.id,
      crop: 'Organic Cauliflower',
      cropHi: 'जैविक गोभी',
      variety: 'Snowball 16',
      quantity: 1200,
      unit: 'kg',
      askingPrice: 28,
      grade: 'A',
      locationAddress: 'Nashik Mandi Yard',
      description: 'Crisp, premium fresh snow-white organic cauliflower harvested today.'
    });
    assert(createListingRes.status === 201 && createListingRes.data.success, 'Farmer successfully created listing');
    const newListing = createListingRes.data.data;
    assert(newListing && newListing.id, `Listing created with ID: ${newListing.id}`);
    assert(newListing.crop === 'Organic Cauliflower', 'Listing crop name matches');

    // ── 3. Buyer Login & FCM Registration ────────────────────────────
    console.log('\n--- Step 3: Buyer Login (Anil Kumar Sharma) & Register Device Token ---');
    const buyerToken = 'dev-token-buyer-anil:buyer:9123456789:Anil%20Kumar%20Sharma';
    const buyerSync = await makeReq(server, '/api/v1/auth/sync', 'POST', buyerToken, {
      phoneOrEmail: '9123456789',
      role: 'buyer'
    });
    assert(buyerSync.status === 200 && buyerSync.data.success, 'Buyer sync succeeded');
    const buyerUser = buyerSync.data.user;
    assert(buyerUser.role === 'buyer', `User role is buyer (id: ${buyerUser.id})`);

    // Register Buyer FCM token
    const buyerFcmToken = 'fcm_token_buyer_anil_device_002';
    const buyerTokenReg = await makeReq(server, '/api/v1/notifications/fcm-token', 'POST', buyerToken, {
      token: buyerFcmToken,
      deviceType: 'web'
    });
    assert(buyerTokenReg.status === 200 && buyerTokenReg.data.success, 'Buyer successfully registered FCM device token');

    // ── 4. Buyer Browses Marketplace & Product Details ───────────────
    console.log('\n--- Step 4: Buyer Browses Marketplace ---');
    const marketRes = await makeReq(server, '/api/v1/listings', 'GET');
    assert(marketRes.status === 200 && marketRes.data.success, 'Marketplace listings retrieved');
    const listings = marketRes.data.data;
    assert(listings.length >= 1, `Found ${listings.length} listings in marketplace`);
    const found = listings.find(l => l.id === newListing.id);
    assert(Boolean(found), 'Newly created listing is visible in marketplace');

    const detailRes = await makeReq(server, `/api/v1/listings/${newListing.id}`, 'GET');
    assert(detailRes.status === 200 && detailRes.data.success, 'Product details retrieved');

    // ── 5. Buyer Submits Offer (FCM Trigger: New Offer Received) ─────
    console.log('\n--- Step 5: Buyer Submits Offer & Triggers Farmer FCM Notification ---');
    const offerRes = await makeReq(server, '/api/v1/offers', 'POST', buyerToken, {
      listingId: newListing.id,
      buyerId: buyerUser.id,
      offerPrice: 26,
      quantity: 1000,
      notes: 'Can arrange cold storage pickup within 24 hours.'
    });
    assert(offerRes.status === 201 && offerRes.data.success, 'Buyer offer submitted successfully');
    const createdOffer = offerRes.data.data;
    assert(createdOffer && createdOffer.id, `Offer created with ID: ${createdOffer.id}`);

    // Verify farmer received notification
    const farmerNotifs = await makeReq(server, `/api/v1/notifications?userId=${farmerUser.id}`, 'GET', farmerToken);
    assert(farmerNotifs.status === 200 && farmerNotifs.data.success, 'Farmer notifications retrieved');
    const offerNotif = farmerNotifs.data.data.find(n => n.type === 'offer' && n.title.includes('ऑफर'));
    assert(Boolean(offerNotif), 'Farmer received "New Offer Received" notification');

    // ── 6. Farmer Accepts Offer (FCM Trigger: Offer Accepted) ────────
    console.log('\n--- Step 6: Farmer Views & Accepts Offer ---');
    const acceptRes = await makeReq(server, `/api/v1/offers/${createdOffer.id}`, 'PUT', farmerToken, {
      status: 'accepted'
    });
    assert(acceptRes.status === 200 && acceptRes.data.success, 'Farmer accepted offer successfully');
    assert(acceptRes.data.data.status === 'accepted', 'Offer status updated to accepted');

    // Verify order was automatically generated
    const ordersRes = await makeReq(server, '/api/v1/orders', 'GET', buyerToken);
    assert(ordersRes.status === 200 && ordersRes.data.success, 'Orders retrieved');
    const generatedOrder = ordersRes.data.data.find(o => o.offer_id === createdOffer.id);
    assert(Boolean(generatedOrder), `Order generated automatically! Order ID: ${generatedOrder?.id}`);

    // Verify buyer received "Offer Accepted" notification
    const buyerNotifsAfterAccept = await makeReq(server, `/api/v1/notifications?userId=${buyerUser.id}`, 'GET', buyerToken);
    const acceptedNotif = buyerNotifsAfterAccept.data.data.find(n => n.type === 'order' && n.title.includes('स्वीकृत'));
    assert(Boolean(acceptedNotif), 'Buyer received "Offer Accepted" notification');

    // ── 7. Order Status Changed (FCM Trigger: Order Status Change) ───
    console.log('\n--- Step 7: Order Status Updated to In Transit ---');
    const updateOrderRes = await makeReq(server, `/api/v1/orders/${generatedOrder.id}`, 'PUT', farmerToken, {
      status: 'in_transit'
    });
    assert(updateOrderRes.status === 200 && updateOrderRes.data.success, 'Order status updated to in_transit');
    assert(updateOrderRes.data.data.status === 'in_transit', 'Order state confirmed as in_transit');

    // ── 8. Offer Rejection Flow (FCM Trigger: Offer Rejected) ────────
    console.log('\n--- Step 8: Second Offer Submission & Rejection Flow ---');
    const secondListingRes = await makeReq(server, '/api/v1/listings', 'POST', farmerToken, {
      farmerId: farmerUser.id,
      crop: 'Fresh Ginger',
      quantity: 500,
      unit: 'kg',
      grade: 'A',
      askingPrice: 80
    });
    const secondListing = secondListingRes.data.data;

    const secondOfferRes = await makeReq(server, '/api/v1/offers', 'POST', buyerToken, {
      listingId: secondListing.id,
      buyerId: buyerUser.id,
      offerPrice: 50,
      quantity: 200
    });
    const secondOffer = secondOfferRes.data.data;

    // Farmer rejects offer
    const rejectRes = await makeReq(server, `/api/v1/offers/${secondOffer.id}`, 'PUT', farmerToken, {
      status: 'rejected'
    });
    assert(rejectRes.status === 200 && rejectRes.data.success, 'Farmer rejected offer successfully');
    assert(rejectRes.data.data.status === 'rejected', 'Offer status updated to rejected');

    // ── 9. FCM Push Queue Audit ──────────────────────────────────────
    console.log('\n--- Step 9: FCM Delivery Audit & Verification ---');
    const sent = getSentNotifications();
    console.log(`Audited ${sent.length} push notification events in memory test queue.`);
    assert(sent.length >= 4, `At least 4 notification events triggered (found ${sent.length})`);
    const hasOfferCreated = sent.some(s => s.type === 'offer' && s.data.event === 'offer_created');
    const hasOfferAccepted = sent.some(s => s.type === 'order' && s.data.event === 'offer_accepted');
    const hasStatusChange = sent.some(s => s.type === 'order' && s.data.event === 'order_status_change');
    const hasOfferRejected = sent.some(s => s.type === 'offer' && s.data.event === 'offer_rejected');

    assert(hasOfferCreated, 'FCM triggered for: New offer received');
    assert(hasOfferAccepted, 'FCM triggered for: Offer accepted');
    assert(hasStatusChange, 'FCM triggered for: Order status change');
    assert(hasOfferRejected, 'FCM triggered for: Offer rejected');

    // ── 10. Mandi Prices Verification ────────────────────────────────
    console.log('\n--- Step 10: AGMARKNET Mandi Rates ---');
    const mandiRes = await makeReq(server, '/api/v1/market-prices?commodity=Tomato', 'GET');
    assert(mandiRes.status === 200 && mandiRes.data.success, 'Agmarknet mandi prices retrieved');
    assert(mandiRes.data.data.length >= 1, `Retrieved ${mandiRes.data.data.length} mandi price records`);

    // ── 11. Admin Dashboard Endpoints ────────────────────────────────
    console.log('\n--- Step 11: Admin Analytics & Users Check ---');
    const adminToken = 'dev-token-admin:admin:9000000000:Krishi%20Admin';
    const adminStatsRes = await makeReq(server, '/api/v1/admin/stats', 'GET', adminToken);
    assert(adminStatsRes.status === 200 && adminStatsRes.data.success, 'Admin stats retrieved');
    assert(adminStatsRes.data.data.totalFarmers !== undefined, 'Admin stats contains totalFarmers metric');

    const adminUsersRes = await makeReq(server, '/api/v1/users', 'GET', adminToken);
    assert(adminUsersRes.status === 200 && adminUsersRes.data.success, 'Admin users list retrieved');

    console.log('\n🎉 ALL 11 END-TO-END DEMO FLOW STEPS (INCLUDING ALL FCM TRIGGERS) PASSED PERFECTLY!\n');
  } finally {
    server.close();
    const { closeRedis } = require('./src/config/redis');
    await closeRedis();
  }
}

runE2E().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
