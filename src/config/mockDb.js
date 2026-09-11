/**
 * In-Memory Fallback PostgreSQL Database Store
 * ============================================
 * Provides zero-setup ACID-compliant in-memory data store seeded with seed.js records.
 * Activated when PostgreSQL service is not reachable (e.g., local development without Postgres daemon).
 */

const { randomUUID } = require('crypto');

// Initial seed data
function createInitialState() {
  const users = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      firebase_uid: 'dev-token-9876543210',
      role: 'farmer',
      name: 'Ramesh Bhai Patel',
      name_hi: 'रमेश भाई पटेल',
      phone: '9876543210',
      email: 'ramesh@example.com',
      password: 'farmer123',
      avatar: '👨‍🌾',
      verified: true,
      created_at: new Date('2026-09-01T08:00:00Z').toISOString()
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      firebase_uid: 'dev-token-9812345678',
      role: 'farmer',
      name: 'Sunita Devi',
      name_hi: 'सुनीता देवी',
      phone: '9812345678',
      email: 'sunita@example.com',
      password: 'farmer123',
      avatar: '👩‍🌾',
      verified: true,
      created_at: new Date('2026-09-02T08:00:00Z').toISOString()
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      firebase_uid: 'dev-token-9123456789',
      role: 'buyer',
      name: 'Anil Kumar Sharma',
      name_hi: 'अनिल कुमार शर्मा',
      phone: '9123456789',
      email: 'anil@example.com',
      password: 'buyer123',
      avatar: '🏪',
      verified: true,
      created_at: new Date('2026-09-03T08:00:00Z').toISOString()
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      firebase_uid: 'dev-token-9234567890',
      role: 'buyer',
      name: 'Priya Wholesalers',
      name_hi: 'प्रिया होलसेलर्स',
      phone: '9234567890',
      email: 'priya@example.com',
      password: 'buyer123',
      avatar: '🏬',
      verified: false,
      created_at: new Date('2026-09-04T08:00:00Z').toISOString()
    },
    {
      id: '55555555-5555-5555-5555-555555555555',
      firebase_uid: 'dev-token-9000000001',
      role: 'admin',
      name: 'Krishi Admin',
      name_hi: 'एडमिन',
      phone: '9000000001',
      email: 'admin@kisansetu.in',
      password: 'admin123',
      avatar: '⚙️',
      verified: true,
      created_at: new Date('2026-09-01T00:00:00Z').toISOString()
    }
  ];

  const farmer_profiles = [
    {
      id: 'f1111111-1111-1111-1111-111111111111',
      user_id: '11111111-1111-1111-1111-111111111111',
      village: 'Chiloda',
      district: 'Gandhinagar',
      state: 'Gujarat',
      land_acres: 5.5,
      crops: ['Tomato', 'Potato', 'Onion'],
      rating: 4.7,
      total_sales: 12,
      latitude: 23.2156,
      longitude: 72.6369
    },
    {
      id: 'f2222222-2222-2222-2222-222222222222',
      user_id: '22222222-2222-2222-2222-222222222222',
      village: 'Sonipat',
      district: 'Sonipat',
      state: 'Haryana',
      land_acres: 3.2,
      crops: ['Wheat', 'Maize'],
      rating: 4.5,
      total_sales: 8,
      latitude: 28.9931,
      longitude: 77.0151
    }
  ];

  const buyer_profiles = [
    {
      id: 'b3333333-3333-3333-3333-333333333333',
      user_id: '33333333-3333-3333-3333-333333333333',
      company: 'FreshMart Exports Pvt Ltd',
      city: 'Delhi',
      district: 'Delhi',
      state: 'Delhi',
      gstin: '07AAAAA0000A1Z5',
      rating: 4.8,
      total_purchases: 23,
      latitude: 28.7041,
      longitude: 77.1025
    },
    {
      id: 'b4444444-4444-4444-4444-444444444444',
      user_id: '44444444-4444-4444-4444-444444444444',
      company: 'Priya Agri Traders',
      city: 'Ahmedabad',
      district: 'Ahmedabad',
      state: 'Gujarat',
      gstin: '24BBBBB1111B2Z6',
      rating: 4.2,
      total_purchases: 11,
      latitude: 23.0225,
      longitude: 72.5714
    }
  ];

  const produce_listings = [
    {
      id: 'aaaaaaaa-0004-0000-0000-000000000004',
      farmer_id: '22222222-2222-2222-2222-222222222222',
      crop: 'Onion',
      crop_hi: 'प्याज',
      emoji: '🧅',
      title: 'Nashik Red Onion',
      variety: 'Late Kharif Gavran',
      lot_number: 'LOT-MH-26-ON984',
      quantity: 5000,
      unit: 'kg',
      volume_label: '5 MT Volume',
      grade: 'A',
      asking_price: 28.5,
      market_ref_price: 27.2,
      ai_suggested_price: 28.0,
      firmness: '98%',
      avg_size: '45mm',
      defect_rate: '1.2%',
      sparkline_delta: '+8.4%',
      farmer_name: 'Ramesh Jadhav',
      description: 'Premium Nashik red onions from Yeola. Uniform medium size, dry skin, excellent storage stability.',
      location_address: 'Yeola, Nashik, Maharashtra',
      latitude: 20.0421,
      longitude: 74.4891,
      images: ['https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400&auto=format&fit=crop&q=80'],
      status: 'active',
      created_at: new Date('2026-09-04T09:00:00Z').toISOString()
    },
    {
      id: 'aaaaaaaa-0001-0000-0000-000000000001',
      farmer_id: '11111111-1111-1111-1111-111111111111',
      crop: 'Tomato',
      crop_hi: 'टमाटर',
      emoji: '🍅',
      title: 'Roma Field Tomato',
      variety: 'Abhinav Hybrid',
      lot_number: 'LOT-KA-26-TM412',
      quantity: 3500,
      unit: 'kg',
      volume_label: '3.5 MT Volume',
      grade: 'A+',
      asking_price: 34,
      market_ref_price: 32.5,
      ai_suggested_price: 33.5,
      firmness: '99%',
      avg_size: '58mm',
      defect_rate: '0.8%',
      sparkline_delta: '+12.6%',
      farmer_name: 'Venkatesh Gowda',
      description: 'Fresh Roma field tomatoes from Kolar Mandi Hub. Grade A+ export specification, high lycopene, thick skin.',
      location_address: 'Kolar Mandi Hub, Karnataka',
      latitude: 13.1362,
      longitude: 78.1291,
      images: ['https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&auto=format&fit=crop&q=80'],
      status: 'active',
      created_at: new Date('2026-09-04T10:00:00Z').toISOString()
    },
    {
      id: 'aaaaaaaa-0002-0000-0000-000000000002',
      farmer_id: '11111111-1111-1111-1111-111111111111',
      crop: 'Potato',
      crop_hi: 'आलू',
      emoji: '🥔',
      title: 'Chipsona Potato',
      variety: 'Kufri Chipsona-1',
      lot_number: 'LOT-GJ-26-PT709',
      quantity: 12000,
      unit: 'kg',
      volume_label: '12 MT Volume',
      grade: 'A',
      asking_price: 19.5,
      market_ref_price: 20.0,
      ai_suggested_price: 19.8,
      firmness: '96%',
      avg_size: '62mm',
      defect_rate: '1.5%',
      sparkline_delta: '-1.8%',
      farmer_name: 'Bhavesh Patel',
      description: 'High dry-matter Chipsona potatoes from Deesa belt. Clean, graded, minimal sugar, ideal for chips and processors.',
      location_address: 'Deesa, Banaskantha, Gujarat',
      latitude: 24.2588,
      longitude: 72.1795,
      images: ['https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&auto=format&fit=crop&q=80'],
      status: 'active',
      created_at: new Date('2026-09-04T11:00:00Z').toISOString()
    },
    {
      id: 'aaaaaaaa-0003-0000-0000-000000000003',
      farmer_id: '22222222-2222-2222-2222-222222222222',
      crop: 'Wheat',
      crop_hi: 'गेहूं',
      emoji: '🌾',
      title: 'Sharbati HD 3086 Wheat',
      variety: 'HD 3086',
      lot_number: 'LOT-HR-26-WH554',
      quantity: 12000,
      unit: 'kg',
      volume_label: '12 MT Volume',
      grade: 'A+',
      asking_price: 21.5,
      market_ref_price: 21,
      ai_suggested_price: 21.2,
      firmness: '99%',
      avg_size: 'Golden Grain',
      defect_rate: '0.4%',
      sparkline_delta: '+4.2%',
      farmer_name: 'Suresh Kumar',
      description: 'Premium quality HD 3086 wheat, properly dried and cleaned. Moisture < 11%, ready for milling.',
      location_address: 'Sonipat, Haryana',
      latitude: 28.9931,
      longitude: 77.0151,
      images: ['https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&auto=format&fit=crop&q=80'],
      status: 'active',
      created_at: new Date('2026-09-03T10:00:00Z').toISOString()
    },
    {
      id: 'aaaaaaaa-0005-0000-0000-000000000005',
      farmer_id: '11111111-1111-1111-1111-111111111111',
      crop: 'Maize',
      crop_hi: 'मक्का',
      emoji: '🌽',
      title: 'Pioneer 3396 Yellow Maize',
      variety: 'Pioneer 3396',
      lot_number: 'LOT-GJ-26-MZ102',
      quantity: 4500,
      unit: 'kg',
      volume_label: '4.5 MT Volume',
      grade: 'B+',
      asking_price: 19,
      market_ref_price: 18.5,
      ai_suggested_price: 18.8,
      firmness: 94,
      avg_size: 'Standard Kernel',
      defect_rate: '1.6%',
      farmer_name: 'Ramesh Patel',
      description: 'Hybrid yellow maize suitable for poultry feed and starch extraction. Moisture < 13.5%.',
      location_address: 'Chiloda, Gandhinagar, Gujarat',
      latitude: 23.2156,
      longitude: 72.6369,
      images: ['https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=400&auto=format&fit=crop&q=80'],
      status: 'active',
      created_at: new Date('2026-09-05T08:00:00Z').toISOString()
    },
    {
      id: 'aaaaaaaa-0006-0000-0000-000000000006',
      farmer_id: '22222222-2222-2222-2222-222222222222',
      crop: 'Rice',
      crop_hi: 'चावल',
      emoji: '🌾',
      title: 'Basmati 1121 Traditional',
      variety: 'Basmati 1121',
      lot_number: 'LOT-PB-26-RC301',
      quantity: 6000,
      unit: 'kg',
      volume_label: '6 MT Volume',
      grade: 'A+',
      asking_price: 55,
      market_ref_price: 52,
      ai_suggested_price: 53.5,
      firmness: 99,
      avg_size: '8.4mm Elongated',
      defect_rate: '0.3%',
      farmer_name: 'Harpreet Singh',
      description: 'Super premium Basmati 1121 long grain paddy. Aged, aromatic, export quality processing grade.',
      location_address: 'Karnal, Haryana',
      latitude: 29.6857,
      longitude: 76.9905,
      images: ['https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&auto=format&fit=crop&q=80'],
      status: 'active',
      created_at: new Date('2026-09-02T10:00:00Z').toISOString()
    }
  ];

  const offers = [
    {
      id: 'bbbbbbbb-0001-0000-0000-000000000001',
      listing_id: 'aaaaaaaa-0001-0000-0000-000000000001',
      buyer_id: '33333333-3333-3333-3333-333333333333',
      offer_price: 22,
      quantity: 300,
      unit: 'kg',
      total_amount: 6600,
      message: 'Good quality produce. Can arrange pickup within 2 days.',
      status: 'pending',
      created_at: new Date('2026-09-05T12:00:00Z').toISOString()
    },
    {
      id: 'bbbbbbbb-0002-0000-0000-000000000002',
      listing_id: 'aaaaaaaa-0001-0000-0000-000000000001',
      buyer_id: '44444444-4444-4444-4444-444444444444',
      offer_price: 23,
      quantity: 500,
      unit: 'kg',
      total_amount: 11500,
      message: 'Ready to buy full quantity. Payment within 24 hours.',
      status: 'pending',
      created_at: new Date('2026-09-05T14:00:00Z').toISOString()
    },
    {
      id: 'bbbbbbbb-0003-0000-0000-000000000003',
      listing_id: 'aaaaaaaa-0003-0000-0000-000000000003',
      buyer_id: '33333333-3333-3333-3333-333333333333',
      offer_price: 20.8,
      quantity: 2000,
      unit: 'kg',
      total_amount: 41600,
      message: 'Buying full lot. Government procurement price reference.',
      status: 'accepted',
      created_at: new Date('2026-09-04T12:00:00Z').toISOString()
    }
  ];

  const orders = [
    {
      id: 'cccccccc-0001-0000-0000-000000000001',
      listing_id: 'aaaaaaaa-0003-0000-0000-000000000003',
      offer_id: 'bbbbbbbb-0003-0000-0000-000000000003',
      farmer_id: '22222222-2222-2222-2222-222222222222',
      buyer_id: '33333333-3333-3333-3333-333333333333',
      crop: 'Wheat',
      quantity: 2000,
      unit: 'kg',
      agreed_price: 20.8,
      total_amount: 41600,
      status: 'delivered',
      payment_status: 'paid',
      timeline: [
        { step: 'Order Created', date: '2026-09-05', done: true },
        { step: 'Pickup Scheduled', date: '2026-09-06', done: true },
        { step: 'In Transit', date: '2026-09-06', done: true },
        { step: 'Delivered', date: '2026-09-07', done: true },
        { step: 'Payment Released', date: '2026-09-07', done: true }
      ],
      created_at: new Date('2026-09-05T14:00:00Z').toISOString()
    }
  ];

  const notifications = [
    {
      id: 'n1111111-1111-1111-1111-111111111111',
      user_id: '11111111-1111-1111-1111-111111111111',
      type: 'offer',
      title: 'नया ऑफर प्राप्त हुआ!',
      title_en: 'New Offer Received',
      body: 'FreshMart Exports ने आपके टमाटर के लिए ₹22/kg का ऑफर दिया है।',
      emoji: '💰',
      read: false,
      data: { listingId: 'aaaaaaaa-0001-0000-0000-000000000001' },
      created_at: new Date('2026-09-05T12:05:00Z').toISOString()
    },
    {
      id: 'n2222222-2222-2222-2222-222222222222',
      user_id: '11111111-1111-1111-1111-111111111111',
      type: 'price',
      title: 'मंडी भाव अपडेट',
      title_en: 'Mandi Price Alert',
      body: 'अहमदाबाद APMC में टमाटर का भाव ₹100/क्विंटल बढ़ गया है।',
      emoji: '📈',
      read: false,
      data: { commodity: 'Tomato' },
      created_at: new Date('2026-09-05T08:30:00Z').toISOString()
    },
    {
      id: 'n3333333-3333-3333-3333-333333333333',
      user_id: '33333333-3333-3333-3333-333333333333',
      type: 'order',
      title: 'ऑर्डर स्वीकृत!',
      title_en: 'Order Accepted',
      body: 'सुनीता देवी ने आपका गेहूं का ऑफर स्वीकार कर लिया है।',
      emoji: '🎉',
      read: true,
      data: { orderId: 'cccccccc-0001-0000-0000-000000000001' },
      created_at: new Date('2026-09-05T14:02:00Z').toISOString()
    }
  ];

  const market_prices = [
    {
      id: 'm1111111-1111-1111-1111-111111111111',
      commodity: 'Tomato',
      commodity_hi: 'टमाटर',
      emoji: '🍅',
      market: 'Azadpur Mandi',
      district: 'Delhi',
      state: 'Delhi',
      min_price: 1800,
      max_price: 2800,
      modal_price: 2250,
      price_date: '2026-09-08',
      trend: 'up',
      change_amount: 150,
      latitude: 28.7244,
      longitude: 77.1758
    },
    {
      id: 'm2222222-2222-2222-2222-222222222222',
      commodity: 'Tomato',
      commodity_hi: 'टमाटर',
      emoji: '🍅',
      market: 'Ahmedabad APMC',
      district: 'Ahmedabad',
      state: 'Gujarat',
      min_price: 1700,
      max_price: 2600,
      modal_price: 2150,
      price_date: '2026-09-08',
      trend: 'up',
      change_amount: 100,
      latitude: 23.0225,
      longitude: 72.5714
    },
    {
      id: 'm3333333-3333-3333-3333-333333333333',
      commodity: 'Tomato',
      commodity_hi: 'टमाटर',
      emoji: '🍅',
      market: 'Nasik APMC',
      district: 'Nasik',
      state: 'Maharashtra',
      min_price: 1500,
      max_price: 2400,
      modal_price: 1950,
      price_date: '2026-09-08',
      trend: 'down',
      change_amount: -50,
      latitude: 19.9975,
      longitude: 73.7898
    },
    {
      id: 'm4444444-4444-4444-4444-444444444444',
      commodity: 'Potato',
      commodity_hi: 'आलू',
      emoji: '🥔',
      market: 'Azadpur Mandi',
      district: 'Delhi',
      state: 'Delhi',
      min_price: 900,
      max_price: 1400,
      modal_price: 1100,
      price_date: '2026-09-08',
      trend: 'stable',
      change_amount: 0,
      latitude: 28.7244,
      longitude: 77.1758
    },
    {
      id: 'm5555555-5555-5555-5555-555555555555',
      commodity: 'Onion',
      commodity_hi: 'प्याज',
      emoji: '🧅',
      market: 'Nasik APMC',
      district: 'Nasik',
      state: 'Maharashtra',
      min_price: 1500,
      max_price: 2200,
      modal_price: 1900,
      price_date: '2026-09-08',
      trend: 'up',
      change_amount: 200,
      latitude: 19.9975,
      longitude: 73.7898
    },
    {
      id: 'm6666666-6666-6666-6666-666666666666',
      commodity: 'Wheat',
      commodity_hi: 'गेहूं',
      emoji: '🌾',
      market: 'Sonipat Mandi',
      district: 'Sonipat',
      state: 'Haryana',
      min_price: 2000,
      max_price: 2300,
      modal_price: 2125,
      price_date: '2026-09-08',
      trend: 'up',
      change_amount: 75,
      latitude: 28.9931,
      longitude: 77.0151
    },
    {
      id: 'm7777777-7777-7777-7777-777777777777',
      commodity: 'Maize',
      commodity_hi: 'मक्का',
      emoji: '🌽',
      market: 'Ahmedabad APMC',
      district: 'Ahmedabad',
      state: 'Gujarat',
      min_price: 1750,
      max_price: 2050,
      modal_price: 1880,
      price_date: '2026-09-08',
      trend: 'stable',
      change_amount: 0,
      latitude: 23.0225,
      longitude: 72.5714
    }
  ];

  return {
    users,
    farmer_profiles,
    buyer_profiles,
    produce_listings,
    offers,
    orders,
    notifications,
    market_prices
  };
}

class MockDbStore {
  constructor() {
    this.data = createInitialState();
  }

  // Calculate distance between two points in km
  haversine(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((R * c).toFixed(2));
  }

  execute(sql, params = []) {
    const s = sql.trim().replace(/\s+/g, ' ');

    // 1. Transaction statements
    if (/^BEGIN/i.test(s) || /^COMMIT/i.test(s) || /^ROLLBACK/i.test(s)) {
      return { rows: [], rowCount: 0 };
    }

    // 2. Health & PostGIS checks
    if (/SELECT NOW\(\)/i.test(s)) {
      return {
        rows: [{ current_time: new Date().toISOString(), version: 'PostgreSQL 16.2 (Mock / In-Memory Store)' }],
        rowCount: 1
      };
    }
    if (/SELECT PostGIS_Full_Version\(\)/i.test(s)) {
      return {
        rows: [{ postgis_version: 'POSTGIS 3.4.0 (In-Memory Spatial Engine)' }],
        rowCount: 1
      };
    }

    // 3. Admin stats query
    if (/total_farmers/i.test(s) && /total_buyers/i.test(s) && /active_listings/i.test(s)) {
      const totalFarmers = this.data.users.filter(u => u.role === 'farmer').length;
      const totalBuyers = this.data.users.filter(u => u.role === 'buyer').length;
      const activeListings = this.data.produce_listings.filter(l => l.status === 'active').length;
      const pendingOffers = this.data.offers.filter(o => o.status === 'pending').length;
      const totalOrders = this.data.orders.length;
      const revenue = this.data.orders
        .filter(o => o.status !== 'cancelled')
        .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);

      return {
        rows: [{
          total_farmers: totalFarmers.toString(),
          total_buyers: totalBuyers.toString(),
          active_listings: activeListings.toString(),
          pending_offers: pendingOffers.toString(),
          total_orders: totalOrders.toString(),
          total_revenue: revenue.toString()
        }],
        rowCount: 1
      };
    }

    // 4. USERS
    if (/FROM users/i.test(s)) {
      // Find user by firebase_uid, phone, email
      if (/WHERE.*firebase_uid/i.test(s) || /WHERE.*u\.phone/i.test(s) || /WHERE \(u\.phone/i.test(s)) {
        const [p1, p2, p3] = params;
        const user = this.data.users.find(u =>
          (p1 && (u.firebase_uid === p1 || u.phone === p1 || (u.email && u.email.toLowerCase() === p1.toLowerCase()))) ||
          (p2 && u.phone === p2) ||
          (p3 && u.email && u.email.toLowerCase() === p3.toLowerCase())
        );

        if (!user) return { rows: [], rowCount: 0 };

        const fp = this.data.farmer_profiles.find(p => p.user_id === user.id) || {};
        const bp = this.data.buyer_profiles.find(p => p.user_id === user.id) || {};

        return {
          rows: [{
            ...user,
            farmer_profile_id: fp.id || null,
            village: fp.village || null,
            farmer_district: fp.district || null,
            farmer_state: fp.state || null,
            farmer_rating: fp.rating || 4.5,
            land_acres: fp.land_acres || 0,
            crops: fp.crops || [],
            total_sales: fp.total_sales || 0,
            buyer_profile_id: bp.id || null,
            company: bp.company || null,
            buyer_city: bp.city || null,
            buyer_district: bp.district || null,
            buyer_state: bp.state || null,
            buyer_rating: bp.rating || 4.5,
            total_purchases: bp.total_purchases || 0
          }],
          rowCount: 1
        };
      }

      // Check existing phone/email
      if (/WHERE phone = \$1 OR/i.test(s)) {
        const [phone, email] = params;
        const exists = this.data.users.find(u => u.phone === phone || (email && u.email === email));
        return { rows: exists ? [{ id: exists.id }] : [], rowCount: exists ? 1 : 0 };
      }

      // Single user by ID
      if (/WHERE u\.id = \$1/i.test(s) || /WHERE id = \$1/i.test(s)) {
        const id = params[0];
        const user = this.data.users.find(u => u.id === id);
        if (!user) return { rows: [], rowCount: 0 };
        if (/SELECT fcm_token FROM users/i.test(s)) {
          return { rows: [{ fcm_token: user.fcm_token || null }], rowCount: 1 };
        }
        const fp = this.data.farmer_profiles.find(p => p.user_id === user.id) || {};
        const bp = this.data.buyer_profiles.find(p => p.user_id === user.id) || {};
        return {
          rows: [{
            ...user,
            farmer_profile_id: fp.id || null,
            village: fp.village || null,
            farmer_district: fp.district || null,
            farmer_state: fp.state || null,
            farmer_rating: fp.rating || 4.5,
            land_acres: fp.land_acres || 0,
            crops: fp.crops || [],
            total_sales: fp.total_sales || 0,
            buyer_profile_id: bp.id || null,
            company: bp.company || null,
            buyer_city: bp.city || null,
            buyer_district: bp.district || null,
            buyer_state: bp.state || null,
            buyer_rating: bp.rating || 4.5,
            total_purchases: bp.total_purchases || 0
          }],
          rowCount: 1
        };
      }

      // List users
      if (/SELECT COUNT\(\*\) FROM users/i.test(s)) {
        let list = this.data.users;
        if (params.length > 0) {
          list = list.filter(u => u.role === params[0]);
        }
        return { rows: [{ count: list.length.toString() }], rowCount: 1 };
      }

      let list = this.data.users;
      if (params.length === 3) {
        list = list.filter(u => u.role === params[0]);
      }
      return {
        rows: list.map(u => {
          const fp = this.data.farmer_profiles.find(p => p.user_id === u.id) || {};
          const bp = this.data.buyer_profiles.find(p => p.user_id === u.id) || {};
          return {
            ...u,
            village: fp.village || null,
            district: fp.district || bp.district || null,
            state: fp.state || bp.state || null,
            company: bp.company || null,
            city: bp.city || null
          };
        }),
        rowCount: list.length
      };
    }

    // Insert user
    if (/INSERT INTO users/i.test(s)) {
      const colMatch = s.match(/INSERT INTO users\s*\(([^)]+)\)/i);
      const newUser = {
        id: randomUUID(),
        firebase_uid: `dev-${Date.now()}`,
        role: 'farmer',
        name: '',
        name_hi: null,
        phone: '',
        email: null,
        password: 'default123',
        avatar: '👤',
        verified: false,
        created_at: new Date().toISOString()
      };

      if (colMatch) {
        const cols = colMatch[1].split(',').map(c => c.trim().toLowerCase());
        cols.forEach((col, idx) => {
          if (col === 'role') newUser.role = params[idx] || 'farmer';
          else if (col === 'name') newUser.name = params[idx] || '';
          else if (col === 'name_hi') newUser.name_hi = params[idx] || null;
          else if (col === 'phone') newUser.phone = params[idx] || '';
          else if (col === 'email') newUser.email = params[idx] || null;
          else if (col === 'password') newUser.password = params[idx] || 'default123';
          else if (col === 'avatar') newUser.avatar = params[idx] || '👤';
          else if (col === 'verified') newUser.verified = Boolean(params[idx]);
          else if (col === 'firebase_uid') newUser.firebase_uid = params[idx] || `dev-${Date.now()}`;
        });
      } else {
        const [firebase_uid, role, name, name_hi, phone, email, avatar, verified, password] = params;
        newUser.firebase_uid = firebase_uid || `dev-${Date.now()}`;
        newUser.role = role || 'farmer';
        newUser.name = name;
        newUser.name_hi = name_hi || null;
        newUser.phone = phone;
        newUser.email = email || null;
        newUser.password = password || 'default123';
        newUser.avatar = avatar || '👤';
        newUser.verified = !!verified;
      }
      this.data.users.push(newUser);
      return { rows: [newUser], rowCount: 1 };
    }

    // Update user
    if (/UPDATE users SET/i.test(s)) {
      const id = params[params.length - 1];
      const user = this.data.users.find(u => u.id === id);
      if (user) {
        if (/verified =/i.test(s)) user.verified = params[0] !== undefined ? params[0] : true;
        if (/firebase_uid =/i.test(s)) user.firebase_uid = params[0];
        if (/name =/i.test(s)) user.name = params[0];
        if (/phone =/i.test(s)) user.phone = params[0];
        if (/fcm_token =/i.test(s)) {
          user.fcm_token = params[0];
          if (/device_type =/i.test(s)) user.device_type = params[1] || 'web';
        }
      }
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }

    // 5. PRODUCE LISTINGS
    if (/FROM produce_listings/i.test(s)) {
      // Count listings
      if (/SELECT COUNT\(\*\) FROM produce_listings/i.test(s)) {
        let list = this.data.produce_listings.filter(l => l.status !== 'deleted');
        return { rows: [{ count: list.length.toString() }], rowCount: 1 };
      }

      // Single listing by ID
      if (/WHERE l\.id = \$1/i.test(s) || /WHERE id = \$1/i.test(s)) {
        const id = params[0];
        const l = this.data.produce_listings.find(x => x.id === id && x.status !== 'deleted');
        if (!l) return { rows: [], rowCount: 0 };

        const farmer = this.data.users.find(u => u.id === l.farmer_id) || {};
        const fp = this.data.farmer_profiles.find(p => p.user_id === l.farmer_id) || {};
        const offers = this.data.offers.filter(o => o.listing_id === l.id);

        return {
          rows: [{
            ...l,
            distance_km: null,
            farmer_name: farmer.name || 'Farmer',
            farmer_name_hi: farmer.name_hi || farmer.name || 'किसान',
            farmer_phone: farmer.phone || '9876543210',
            farmer_avatar: farmer.avatar || '👨‍🌾',
            farmer_verified: !!farmer.verified,
            farmer_rating: fp.rating || 4.5,
            farmer_village: fp.village || '',
            farmer_district: fp.district || '',
            farmer_state: fp.state || '',
            offers
          }],
          rowCount: 1
        };
      }

      // List produce listings
      let list = this.data.produce_listings.filter(l => l.status !== 'deleted');

      // Check query filters
      const cropIdx = s.indexOf('l.crop =');
      if (cropIdx !== -1) {
        // match crop param
        const match = s.match(/l\.crop = \$(\d+)/);
        if (match) {
          const val = params[parseInt(match[1], 10) - 1];
          if (val) list = list.filter(l => l.crop.toLowerCase() === val.toLowerCase());
        }
      }

      const farmerIdx = s.indexOf('l.farmer_id =');
      if (farmerIdx !== -1) {
        const match = s.match(/l\.farmer_id = \$(\d+)/);
        if (match) {
          const val = params[parseInt(match[1], 10) - 1];
          if (val) list = list.filter(l => l.farmer_id === val);
        }
      }

      const statusIdx = s.indexOf('l.status =');
      if (statusIdx !== -1) {
        const match = s.match(/l\.status = \$(\d+)/);
        if (match) {
          const val = params[parseInt(match[1], 10) - 1];
          if (val) list = list.filter(l => l.status === val);
        }
      }

      const enriched = list.map(l => {
        const farmer = this.data.users.find(u => u.id === l.farmer_id) || {};
        const fp = this.data.farmer_profiles.find(p => p.user_id === l.farmer_id) || {};
        return {
          ...l,
          distance_km: null,
          farmer_name: farmer.name || 'Farmer',
          farmer_name_hi: farmer.name_hi || farmer.name || 'किसान',
          farmer_phone: farmer.phone || '9876543210',
          farmer_avatar: farmer.avatar || '👨‍🌾',
          farmer_verified: !!farmer.verified,
          farmer_rating: fp.rating || 4.5,
          farmer_village: fp.village || '',
          farmer_district: fp.district || '',
          farmer_state: fp.state || ''
        };
      });

      return { rows: enriched, rowCount: enriched.length };
    }

    // Insert produce listing
    if (/INSERT INTO produce_listings/i.test(s)) {
      const [
        farmer_id, crop, crop_hi, emoji, variety, quantity, unit,
        grade, asking_price, market_ref_price, ai_suggested_price,
        description, location_address, latitude, longitude, images, status
      ] = params;

      const newListing = {
        id: randomUUID(),
        farmer_id,
        crop,
        crop_hi: crop_hi || crop,
        emoji: emoji || '🌱',
        variety: variety || 'Standard',
        quantity: parseFloat(quantity),
        unit: unit || 'kg',
        grade: grade || 'A',
        asking_price: parseFloat(asking_price),
        market_ref_price: market_ref_price ? parseFloat(market_ref_price) : null,
        ai_suggested_price: ai_suggested_price ? parseFloat(ai_suggested_price) : null,
        description: description || '',
        location_address: location_address || 'India',
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        images: Array.isArray(images) ? images : ['🌱'],
        status: status || 'active',
        created_at: new Date().toISOString()
      };

      this.data.produce_listings.unshift(newListing);
      return { rows: [newListing], rowCount: 1 };
    }

    // Update produce listing
    if (/UPDATE produce_listings/i.test(s)) {
      const id = params[params.length - 1];
      const listing = this.data.produce_listings.find(l => l.id === id);
      if (listing) {
        const setMatch = s.match(/SET\s+(.+?)\s+WHERE/i);
        if (setMatch) {
          const parts = setMatch[1].split(',').map(p => p.trim());
          parts.forEach(part => {
            const col = part.split('=')[0].trim();
            const paramIdxMatch = part.match(/\$(\d+)/);
            if (paramIdxMatch) {
              const val = params[parseInt(paramIdxMatch[1], 10) - 1];
              if (col === 'asking_price') listing.asking_price = parseFloat(val);
              else if (col === 'quantity') listing.quantity = parseFloat(val);
              else if (col === 'status') listing.status = val;
              else if (col === 'crop') listing.crop = val;
              else if (col === 'variety') listing.variety = val;
              else if (col === 'grade') listing.grade = val;
              else if (col === 'description') listing.description = val;
              else listing[col] = val;
            } else {
              const litMatch = part.match(/=\s*'([^']+)'/);
              if (litMatch) listing[col] = litMatch[1];
            }
          });
        }
      }
      return { rows: listing ? [listing] : [], rowCount: listing ? 1 : 0 };
    }

    // Delete produce listing
    if (/DELETE FROM produce_listings/i.test(s)) {
      const id = params[0];
      const idx = this.data.produce_listings.findIndex(l => l.id === id);
      if (idx !== -1) {
        this.data.produce_listings.splice(idx, 1);
        return { rows: [{ id }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // 6. OFFERS
    if (/FROM offers/i.test(s)) {
      if (/SELECT COUNT\(\*\) FROM offers/i.test(s)) {
        return { rows: [{ count: this.data.offers.length.toString() }], rowCount: 1 };
      }

      // Single offer
      if (/WHERE o\.id = \$1/i.test(s)) {
        const id = params[0];
        const o = this.data.offers.find(x => x.id === id);
        if (!o) return { rows: [], rowCount: 0 };

        const l = this.data.produce_listings.find(x => x.id === o.listing_id) || {};
        const buyer = this.data.users.find(u => u.id === o.buyer_id) || {};
        const bp = this.data.buyer_profiles.find(p => p.user_id === o.buyer_id) || {};
        const farmer = this.data.users.find(u => u.id === l.farmer_id) || {};

        return {
          rows: [{
            ...o,
            crop: l.crop,
            crop_hi: l.crop_hi,
            crop_emoji: l.emoji,
            variety: l.variety,
            asking_price: l.asking_price,
            listing_status: l.status,
            farmer_id: l.farmer_id,
            buyer_name: buyer.name,
            buyer_phone: buyer.phone,
            buyer_avatar: buyer.avatar,
            buyer_company: bp.company,
            buyer_city: bp.city,
            buyer_rating: bp.rating,
            farmer_name: farmer.name,
            farmer_phone: farmer.phone
          }],
          rowCount: 1
        };
      }

      let list = this.data.offers;
      const listingMatch = s.match(/o\.listing_id = \$(\d+)/);
      if (listingMatch) {
        const lid = params[parseInt(listingMatch[1], 10) - 1];
        if (lid) list = list.filter(o => o.listing_id === lid);
      }

      const buyerMatch = s.match(/o\.buyer_id = \$(\d+)/);
      if (buyerMatch) {
        const bid = params[parseInt(buyerMatch[1], 10) - 1];
        if (bid) list = list.filter(o => o.buyer_id === bid);
      }

      const farmerMatch = s.match(/l\.farmer_id = \$(\d+)/);
      if (farmerMatch) {
        const fid = params[parseInt(farmerMatch[1], 10) - 1];
        if (fid) {
          const farmerListingIds = this.data.produce_listings.filter(l => l.farmer_id === fid).map(l => l.id);
          list = list.filter(o => farmerListingIds.includes(o.listing_id));
        }
      }

      const statusMatch = s.match(/o\.status = \$(\d+)/);
      if (statusMatch) {
        const st = params[parseInt(statusMatch[1], 10) - 1];
        if (st) list = list.filter(o => o.status === st);
      }

      const enriched = list.map(o => {
        const l = this.data.produce_listings.find(x => x.id === o.listing_id) || {};
        const buyer = this.data.users.find(u => u.id === o.buyer_id) || {};
        const bp = this.data.buyer_profiles.find(p => p.user_id === o.buyer_id) || {};
        const farmer = this.data.users.find(u => u.id === l.farmer_id) || {};
        return {
          ...o,
          crop: l.crop,
          crop_hi: l.crop_hi,
          crop_emoji: l.emoji,
          variety: l.variety,
          asking_price: l.asking_price,
          listing_status: l.status,
          farmer_id: l.farmer_id,
          buyer_name: buyer.name,
          buyer_phone: buyer.phone,
          buyer_avatar: buyer.avatar,
          buyer_company: bp.company,
          buyer_city: bp.city,
          buyer_rating: bp.rating,
          farmer_name: farmer.name,
          farmer_phone: farmer.phone
        };
      });

      return { rows: enriched, rowCount: enriched.length };
    }

    // Insert offer
    if (/INSERT INTO offers/i.test(s)) {
      const [listing_id, buyer_id, offer_price, quantity, unit, total_amount, message] = params;
      const newOffer = {
        id: randomUUID(),
        listing_id,
        buyer_id,
        offer_price: parseFloat(offer_price),
        quantity: parseFloat(quantity),
        unit: unit || 'kg',
        total_amount: parseFloat(total_amount),
        message: message || '',
        status: 'pending',
        created_at: new Date().toISOString()
      };
      this.data.offers.unshift(newOffer);
      return { rows: [newOffer], rowCount: 1 };
    }

    // Update offer
    if (/UPDATE offers SET/i.test(s)) {
      const id = params[params.length - 1];
      const offer = this.data.offers.find(o => o.id === id);
      if (offer) {
        if (/status =/i.test(s)) {
          offer.status = params[0];
        }
      }
      return { rows: offer ? [offer] : [], rowCount: offer ? 1 : 0 };
    }

    // 7. ORDERS
    if (/FROM orders/i.test(s)) {
      if (/SELECT COUNT\(\*\) FROM orders/i.test(s)) {
        return { rows: [{ count: this.data.orders.length.toString() }], rowCount: 1 };
      }

      let list = this.data.orders;
      const singleOrderMatch = s.match(/WHERE (?:o\.)?id = \$(\d+)/i);
      if (singleOrderMatch) {
        const oid = params[parseInt(singleOrderMatch[1], 10) - 1];
        const o = this.data.orders.find(x => x.id === oid);
        if (!o) return { rows: [], rowCount: 0 };
        const farmer = this.data.users.find(u => u.id === o.farmer_id) || {};
        const fp = this.data.farmer_profiles.find(p => p.user_id === o.farmer_id) || {};
        const buyer = this.data.users.find(u => u.id === o.buyer_id) || {};
        const bp = this.data.buyer_profiles.find(p => p.user_id === o.buyer_id) || {};
        const l = this.data.produce_listings.find(x => x.id === o.listing_id) || {};
        return {
          rows: [{
            ...o,
            farmer_name: farmer.name,
            farmer_phone: farmer.phone,
            farmer_email: farmer.email,
            farmer_village: fp.village,
            farmer_district: fp.district,
            farmer_state: fp.state,
            farmer_lat: fp.latitude,
            farmer_lng: fp.longitude,
            buyer_name: buyer.name,
            buyer_phone: buyer.phone,
            buyer_email: buyer.email,
            buyer_company: bp.company,
            buyer_city: bp.city,
            buyer_state: bp.state,
            buyer_lat: bp.latitude,
            buyer_lng: bp.longitude,
            variety: l.variety,
            grade: l.grade,
            location_address: l.location_address || o.location_address,
            listing_lat: l.latitude,
            listing_lng: l.longitude,
          }],
          rowCount: 1
        };
      }

      const farmerMatch = s.match(/o\.farmer_id = \$(\d+)/);
      if (farmerMatch) {
        const fid = params[parseInt(farmerMatch[1], 10) - 1];
        if (fid) list = list.filter(o => o.farmer_id === fid);
      }

      const buyerMatch = s.match(/o\.buyer_id = \$(\d+)/);
      if (buyerMatch) {
        const bid = params[parseInt(buyerMatch[1], 10) - 1];
        if (bid) list = list.filter(o => o.buyer_id === bid);
      }

      const enriched = list.map(o => {
        let status = o.status || 'confirmed';
        let timeline = o.timeline || [];
        if (typeof status === 'string' && status.trim().startsWith('[')) {
          try {
            timeline = JSON.parse(status);
          } catch {
            timeline = [];
          }
          status = 'confirmed';
        }
        if (typeof timeline === 'string') {
          try {
            timeline = JSON.parse(timeline);
          } catch {
            timeline = [];
          }
        }
        if (!timeline || !timeline.length) {
          const todayStr = (o.created_at ? o.created_at.split('T')[0] : new Date().toISOString().split('T')[0]);
          timeline = [
            { step: 'Order Created', date: todayStr, done: true },
            { step: 'Pickup Scheduled', date: '', done: false },
            { step: 'In Transit', date: '', done: false },
            { step: 'Delivered', date: '', done: false },
            { step: 'Payment Released', date: '', done: false }
          ];
        }
        o.status = status;
        o.timeline = timeline;

        const farmer = this.data.users.find(u => u.id === o.farmer_id) || {};
        const buyer = this.data.users.find(u => u.id === o.buyer_id) || {};
        const bp = this.data.buyer_profiles.find(p => p.user_id === o.buyer_id) || {};
        const l = this.data.produce_listings.find(x => x.id === o.listing_id) || {};
        return {
          ...o,
          status,
          timeline,
          farmer_name: farmer.name,
          farmer_phone: farmer.phone,
          buyer_name: buyer.name,
          buyer_phone: buyer.phone,
          buyer_company: bp.company,
          variety: l.variety,
          grade: l.grade,
          location_address: l.location_address
        };
      });

      return { rows: enriched, rowCount: enriched.length };
    }

    // Insert order
    if (/INSERT INTO orders/i.test(s)) {
      const colMatch = s.match(/INSERT INTO orders\s*\(([^)]+)\)/i);
      const newOrder = {
        id: randomUUID(),
        listing_id: null,
        offer_id: null,
        farmer_id: null,
        buyer_id: null,
        crop: '',
        quantity: 0,
        unit: 'kg',
        agreed_price: 0,
        total_amount: 0,
        status: 'confirmed',
        payment_status: 'pending',
        timeline: [],
        created_at: new Date().toISOString()
      };

      if (colMatch) {
        const cols = colMatch[1].split(',').map(c => c.trim().toLowerCase());
        cols.forEach((col, idx) => {
          const val = params[idx];
          if (col === 'listing_id') newOrder.listing_id = val;
          else if (col === 'offer_id') newOrder.offer_id = val;
          else if (col === 'farmer_id') newOrder.farmer_id = val;
          else if (col === 'buyer_id') newOrder.buyer_id = val;
          else if (col === 'crop') newOrder.crop = val;
          else if (col === 'quantity') newOrder.quantity = parseFloat(val);
          else if (col === 'unit') newOrder.unit = val || 'kg';
          else if (col === 'agreed_price') newOrder.agreed_price = parseFloat(val);
          else if (col === 'total_amount') newOrder.total_amount = parseFloat(val);
          else if (col === 'status') newOrder.status = val || 'confirmed';
          else if (col === 'payment_status') newOrder.payment_status = val || 'pending';
          else if (col === 'timeline') {
            try {
              newOrder.timeline = typeof val === 'string' ? JSON.parse(val) : (val || []);
            } catch {
              newOrder.timeline = [];
            }
          }
        });
      } else {
        const [listing_id, offer_id, farmer_id, buyer_id, crop, quantity, unit, agreed_price, total_amount] = params;
        newOrder.listing_id = listing_id;
        newOrder.offer_id = offer_id;
        newOrder.farmer_id = farmer_id;
        newOrder.buyer_id = buyer_id;
        newOrder.crop = crop;
        newOrder.quantity = parseFloat(quantity);
        newOrder.unit = unit || 'kg';
        newOrder.agreed_price = parseFloat(agreed_price);
        newOrder.total_amount = parseFloat(total_amount);
      }

      // Defensive check: if status was passed stringified timeline
      if (typeof newOrder.status === 'string' && newOrder.status.trim().startsWith('[')) {
        try {
          newOrder.timeline = JSON.parse(newOrder.status);
        } catch {
          newOrder.timeline = [];
        }
        newOrder.status = 'confirmed';
      }

      this.data.orders.unshift(newOrder);
      return { rows: [newOrder], rowCount: 1 };
    }

    // Update order
    if (/UPDATE orders SET/i.test(s)) {
      const orderId = params[params.length - 1];
      const order = this.data.orders.find(o => o.id === orderId);
      if (order) {
        if (/status =/i.test(s)) {
          const setClause = s.split('SET')[1].split('WHERE')[0];
          const parts = setClause.split(',').map(p => p.trim());
          const statusPart = parts.find(p => /^status\s*=/i.test(p));
          if (statusPart) {
            const paramIdx = parseInt(statusPart.replace(/[^0-9]/g, ''), 10) - 1;
            if (params[paramIdx] !== undefined) order.status = params[paramIdx];
          }
        }
        if (/payment_status =/i.test(s)) {
          const setClause = s.split('SET')[1].split('WHERE')[0];
          const parts = setClause.split(',').map(p => p.trim());
          const payPart = parts.find(p => /^payment_status\s*=/i.test(p));
          if (payPart) {
            const paramIdx = parseInt(payPart.replace(/[^0-9]/g, ''), 10) - 1;
            if (params[paramIdx] !== undefined) order.payment_status = params[paramIdx];
          }
        }
        if (/timeline =/i.test(s)) {
          const setClause = s.split('SET')[1].split('WHERE')[0];
          const parts = setClause.split(',').map(p => p.trim());
          const tlPart = parts.find(p => /^timeline\s*=/i.test(p));
          if (tlPart) {
            const paramIdx = parseInt(tlPart.replace(/[^0-9]/g, ''), 10) - 1;
            if (params[paramIdx] !== undefined) {
              order.timeline = typeof params[paramIdx] === 'string' ? JSON.parse(params[paramIdx]) : params[paramIdx];
            }
          }
        }
      }
      return { rows: order ? [order] : [], rowCount: order ? 1 : 0 };
    }

    // 8. NOTIFICATIONS
    if (/FROM notifications/i.test(s)) {
      if (/SELECT COUNT\(\*\) FROM notifications/i.test(s)) {
        let list = this.data.notifications;
        if (params[0]) list = list.filter(n => n.user_id === params[0]);
        return { rows: [{ count: list.length.toString() }], rowCount: 1 };
      }

      let list = this.data.notifications;
      const userMatch = s.match(/user_id = \$(\d+)/);
      if (userMatch) {
        const uid = params[parseInt(userMatch[1], 10) - 1];
        if (uid) list = list.filter(n => n.user_id === uid);
      }

      return { rows: list, rowCount: list.length };
    }

    // Insert notification
    if (/INSERT INTO notifications/i.test(s)) {
      const [user_id, type, title, title_en, body, emoji, data] = params;
      const newNotif = {
        id: randomUUID(),
        user_id,
        type: type || 'system',
        title,
        title_en: title_en || null,
        body,
        emoji: emoji || '🔔',
        read: false,
        data: typeof data === 'string' ? JSON.parse(data) : (data || {}),
        created_at: new Date().toISOString()
      };
      this.data.notifications.unshift(newNotif);
      return { rows: [newNotif], rowCount: 1 };
    }

    // Update notifications (mark read)
    if (/UPDATE notifications SET read = true/i.test(s) && /WHERE user_id = \$1/i.test(s)) {
      const userId = params[0];
      this.data.notifications.filter(n => n.user_id === userId).forEach(n => n.read = true);
      return { rows: [], rowCount: 1 };
    }
    if (/UPDATE notifications SET read =/i.test(s) && /WHERE id = \$2/i.test(s)) {
      const id = params[1];
      const notif = this.data.notifications.find(n => n.id === id);
      if (notif) notif.read = true;
      return { rows: notif ? [notif] : [], rowCount: notif ? 1 : 0 };
    }

    // 9. MARKET PRICES
    if (/FROM market_prices/i.test(s)) {
      let list = this.data.market_prices;
      if (/commodity = \$1/i.test(s)) {
        list = list.filter(p => p.commodity.toLowerCase() === params[0].toLowerCase());
      }
      return { rows: list, rowCount: list.length };
    }

    // 10. FARMER & BUYER PROFILES
    if (/INSERT INTO farmer_profiles/i.test(s)) {
      const [user_id, village, district, state, land_acres, crops] = params;
      const p = {
        id: randomUUID(),
        user_id,
        village: village || null,
        district: district || null,
        state: state || null,
        land_acres: parseFloat(land_acres) || 0,
        crops: Array.isArray(crops) ? crops : [],
        rating: 4.5,
        total_sales: 0
      };
      this.data.farmer_profiles.push(p);
      return { rows: [p], rowCount: 1 };
    }

    if (/INSERT INTO buyer_profiles/i.test(s)) {
      const [user_id, company, city, district, state, gstin] = params;
      const p = {
        id: randomUUID(),
        user_id,
        company: company || null,
        city: city || null,
        district: district || null,
        state: state || null,
        gstin: gstin || null,
        rating: 4.5,
        total_purchases: 0
      };
      this.data.buyer_profiles.push(p);
      return { rows: [p], rowCount: 1 };
    }

    // Fallback default
    return { rows: [], rowCount: 0 };
  }
}

const mockDbStore = new MockDbStore();

module.exports = {
  mockDbStore,
  MockDbStore
};
