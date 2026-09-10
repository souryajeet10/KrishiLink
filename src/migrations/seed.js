const { pool } = require('../config/db');

async function seed(closePool = true) {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting database seeding...');
    await client.query('BEGIN');

    // 1. Check if postgis extension is enabled
    const postgisCheck = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'postgis';");
    const hasPostgis = postgisCheck.rows.length > 0;

    // 2. Clear existing data
    console.log('🧹 Clearing previous table records...');
    await client.query('TRUNCATE notifications, orders, offers, produce_listings, buyer_profiles, farmer_profiles, users CASCADE;');

    // 3. Insert Users
    console.log('👤 Inserting Users...');
    const userInsertQuery = `
      INSERT INTO users (id, role, name, name_hi, phone, email, password, avatar, verified)
      VALUES 
        ('11111111-1111-1111-1111-111111111111', 'farmer', 'Ramesh Bhai Patel', 'रमेश भाई पटेल', '9876543210', 'ramesh@example.com', 'farmer123', '👨‍🌾', true),
        ('22222222-2222-2222-2222-222222222222', 'farmer', 'Sunita Devi', 'सुनीता देवी', '9812345678', 'sunita@example.com', 'farmer123', '👩‍🌾', true),
        ('33333333-3333-3333-3333-333333333333', 'buyer', 'Anil Kumar Sharma', 'अनिल कुमार शर्मा', '9123456789', 'anil@example.com', 'buyer123', '🏪', true),
        ('44444444-4444-4444-4444-444444444444', 'buyer', 'Priya Wholesalers', 'प्रिया होलसेलर्स', '9234567890', 'priya@example.com', 'buyer123', '🏬', false),
        ('55555555-5555-5555-5555-555555555555', 'admin', 'Krishi Admin', 'एडमिन', '9000000001', 'admin@kisansetu.in', 'admin123', '⚙️', true)
      ON CONFLICT (id) DO NOTHING;
    `;
    await client.query(userInsertQuery);

    // 4. Insert Farmer Profiles
    console.log('🌾 Inserting Farmer Profiles...');
    await client.query(`
      INSERT INTO farmer_profiles (user_id, village, district, state, land_acres, crops, rating, total_sales, latitude, longitude)
      VALUES
        ('11111111-1111-1111-1111-111111111111', 'Chiloda', 'Gandhinagar', 'Gujarat', 5.5, ARRAY['Tomato', 'Potato', 'Onion'], 4.7, 12, 23.2156, 72.6369),
        ('22222222-2222-2222-2222-222222222222', 'Sonipat', 'Sonipat', 'Haryana', 3.2, ARRAY['Wheat', 'Maize'], 4.5, 8, 28.9931, 77.0151);
    `);

    // 5. Insert Buyer Profiles
    console.log('🏢 Inserting Buyer Profiles...');
    await client.query(`
      INSERT INTO buyer_profiles (user_id, company, city, district, state, gstin, rating, total_purchases, latitude, longitude)
      VALUES
        ('33333333-3333-3333-3333-333333333333', 'FreshMart Exports Pvt Ltd', 'Delhi', 'Delhi', 'Delhi', '07AAAAA0000A1Z5', 4.8, 23, 28.7041, 77.1025),
        ('44444444-4444-4444-4444-444444444444', 'Priya Agri Traders', 'Ahmedabad', 'Ahmedabad', 'Gujarat', '24BBBBB1111B2Z6', 4.2, 11, 23.0225, 72.5714);
    `);

    // 6. Insert Produce Listings
    console.log('📦 Inserting Produce Listings...');
    await client.query(`
      INSERT INTO produce_listings (id, farmer_id, crop, crop_hi, emoji, variety, quantity, unit, grade, asking_price, market_ref_price, ai_suggested_price, description, location_address, latitude, longitude, images, status)
      VALUES
        ('aaaaaaaa-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Tomato', 'टमाटर', '🍅', 'Hybrid Red', 500, 'kg', 'A', 2400, 2250, 2350, 'Fresh hybrid tomatoes, Grade A quality, harvested 2 days ago. Suitable for export and local markets.', 'Chiloda, Gandhinagar, Gujarat', 23.2156, 72.6369, ARRAY['https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=600&auto=format&fit=crop&q=80'], 'active'),
        ('aaaaaaaa-0002-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Potato', 'आलू', '🥔', 'Kufri Jyoti', 800, 'kg', 'A', 1200, 1100, 1150, 'High starch content Kufri Jyoti potatoes. Clean, well-graded, minimal damage.', 'Chiloda, Gandhinagar, Gujarat', 23.2156, 72.6369, ARRAY['https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&auto=format&fit=crop&q=80'], 'active'),
        ('aaaaaaaa-0003-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'Wheat', 'गेहूं', '🌾', 'HD 3086', 2000, 'kg', 'A', 2150, 2100, 2120, 'Premium quality wheat, properly dried and cleaned. Ready for milling.', 'Sonipat, Haryana', 28.9931, 77.0151, ARRAY['https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=600&auto=format&fit=crop&q=80'], 'active'),
        ('aaaaaaaa-0004-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Onion', 'प्याज', '🧅', 'Nasik Red', 1200, 'kg', 'B', 1800, 1950, 1900, 'Nasik red onions, medium size, good shelf life. B grade due to slight size variation.', 'Sonipat, Haryana', 28.9931, 77.0151, ARRAY['https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=600&auto=format&fit=crop&q=80'], 'active'),
        ('aaaaaaaa-0005-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Maize', 'मक्का', '🌽', 'Pioneer 3396', 1500, 'kg', 'A', 1900, 1850, 1880, 'Hybrid maize suitable for poultry feed and starch industry. Moisture < 14%.', 'Chiloda, Gandhinagar, Gujarat', 23.2156, 72.6369, ARRAY['https://images.unsplash.com/photo-1551754655-cd27e38d2076?w=600&auto=format&fit=crop&q=80'], 'active'),
        ('aaaaaaaa-0006-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', 'Rice', 'चावल', '🌾', 'Basmati 1121', 600, 'kg', 'A', 5500, 5200, 5350, 'Premium Basmati 1121 paddy, long grain variety. Suitable for export quality processing.', 'Sonipat, Haryana', 28.9931, 77.0151, ARRAY['https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80'], 'sold');
    `);

    // 7. Insert Offers
    console.log('🤝 Inserting Offers...');
    await client.query(`
      INSERT INTO offers (id, listing_id, buyer_id, offer_price, quantity, unit, total_amount, message, status)
      VALUES
        ('bbbbbbbb-0001-0000-0000-000000000001', 'aaaaaaaa-0001-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 2200, 300, 'kg', 660000, 'Good quality produce. Can arrange pickup within 2 days.', 'pending'),
        ('bbbbbbbb-0002-0000-0000-000000000002', 'aaaaaaaa-0001-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 2300, 500, 'kg', 1150000, 'Ready to buy full quantity. Payment within 24 hours.', 'pending'),
        ('bbbbbbbb-0003-0000-0000-000000000003', 'aaaaaaaa-0003-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 2080, 2000, 'kg', 4160000, 'Buying full lot. Government procurement price reference.', 'accepted');
    `);

    // 8. Insert Orders
    console.log('📜 Inserting Orders...');
    await client.query(`
      INSERT INTO orders (id, listing_id, offer_id, farmer_id, buyer_id, crop, quantity, unit, agreed_price, total_amount, status, payment_status, timeline)
      VALUES
        ('cccccccc-0001-0000-0000-000000000001', 'aaaaaaaa-0003-0000-0000-000000000003', 'bbbbbbbb-0003-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'Wheat', 2000, 'kg', 2080, 4160000, 'delivered', 'paid', 
        '[
          {"step": "Order Created", "date": "2026-09-05", "done": true},
          {"step": "Pickup Scheduled", "date": "2026-09-06", "done": true},
          {"step": "In Transit", "date": "2026-09-06", "done": true},
          {"step": "Delivered", "date": "2026-09-07", "done": true},
          {"step": "Payment Released", "date": "2026-09-07", "done": true}
        ]'::jsonb);
    `);

    // 9. Insert Market Prices (e-NAM realistic APMC data)
    console.log('📊 Inserting Market Mandi Prices...');
    await client.query(`
      INSERT INTO market_prices (commodity, commodity_hi, emoji, market, district, state, min_price, max_price, modal_price, price_date, trend, change_amount, latitude, longitude)
      VALUES
        ('Tomato', 'टमाटर', '🍅', 'Azadpur Mandi', 'Delhi', 'Delhi', 1800, 2800, 2250, CURRENT_DATE, 'up', 150, 28.7244, 77.1758),
        ('Tomato', 'टमाटर', '🍅', 'Ahmedabad APMC', 'Ahmedabad', 'Gujarat', 1700, 2600, 2150, CURRENT_DATE, 'up', 100, 23.0225, 72.5714),
        ('Tomato', 'टमाटर', '🍅', 'Kolkata Market Yard', 'Kolkata', 'West Bengal', 2000, 3000, 2500, CURRENT_DATE, 'up', 200, 22.5726, 88.3639),
        ('Tomato', 'टमाटर', '🍅', 'Nasik APMC', 'Nasik', 'Maharashtra', 1500, 2400, 1950, CURRENT_DATE, 'down', -50, 19.9975, 73.7898),
        ('Potato', 'आलू', '🥔', 'Azadpur Mandi', 'Delhi', 'Delhi', 900, 1400, 1100, CURRENT_DATE, 'stable', 0, 28.7244, 77.1758),
        ('Potato', 'आलू', '🥔', 'Agra Market', 'Agra', 'Uttar Pradesh', 800, 1200, 950, CURRENT_DATE, 'down', -30, 27.1767, 78.0081),
        ('Potato', 'आलू', '🥔', 'Kolkata Market Yard', 'Kolkata', 'West Bengal', 1100, 1600, 1300, CURRENT_DATE, 'up', 80, 22.5726, 88.3639),
        ('Onion', 'प्याज', '🧅', 'Nasik APMC', 'Nasik', 'Maharashtra', 1500, 2200, 1900, CURRENT_DATE, 'up', 200, 19.9975, 73.7898),
        ('Onion', 'प्याज', '🧅', 'Azadpur Mandi', 'Delhi', 'Delhi', 1700, 2500, 2100, CURRENT_DATE, 'up', 150, 28.7244, 77.1758),
        ('Wheat', 'गेहूं', '🌾', 'Karnal Grain Market', 'Karnal', 'Haryana', 1950, 2300, 2100, CURRENT_DATE, 'stable', 10, 29.6857, 76.9905),
        ('Wheat', 'गेहूं', '🌾', 'Ludhiana Grain Market', 'Ludhiana', 'Punjab', 2000, 2350, 2150, CURRENT_DATE, 'up', 50, 30.9010, 75.8573),
        ('Rice', 'चावल', '🌾', 'Karnal Grain Market', 'Karnal', 'Haryana', 4800, 5800, 5200, CURRENT_DATE, 'up', 300, 29.6857, 76.9905),
        ('Maize', 'मक्का', '🌽', 'Davangere APMC', 'Davangere', 'Karnataka', 1600, 2100, 1850, CURRENT_DATE, 'stable', -20, 14.4644, 75.9218);
    `);

    // 10. Insert Notifications
    console.log('🔔 Inserting Notifications...');
    await client.query(`
      INSERT INTO notifications (user_id, type, title, title_en, body, emoji, read)
      VALUES
        ('11111111-1111-1111-1111-111111111111', 'offer', 'नया ऑफर मिला!', 'New Offer Received', 'अनिल कुमार ने टमाटर के लिए ₹2,200/kg का ऑफर दिया है।', '💰', false),
        ('11111111-1111-1111-1111-111111111111', 'price', 'भाव बढ़ा!', 'Price Alert', 'टमाटर का भाव आजादपुर मंडी में ₹150 बढ़ा – अब ₹2,250/क्विंटल', '📈', false),
        ('22222222-2222-2222-2222-222222222222', 'order', 'ऑर्डर डिलीवर हुआ', 'Order Delivered', 'गेहूं 2000 kg का ऑर्डर डिलीवर हो गया। भुगतान जल्द मिलेगा।', '✅', true),
        ('11111111-1111-1111-1111-111111111111', 'ai', 'AI सलाह', 'AI Advisory', 'प्याज का भाव इस हफ्ते और बढ़ सकता है – अभी बेचने का सही समय।', '🤖', true),
        ('11111111-1111-1111-1111-111111111111', 'system', 'प्रोफाइल सत्यापित', 'Profile Verified', 'आपकी किसान प्रोफाइल सत्यापित हो गई है। अब आप लिस्टिंग कर सकते हैं।', '🎉', true);
    `);

    // 11. If PostGIS is active, update location_geom from lat/lng
    if (hasPostgis) {
      console.log('🗺 Updating PostGIS geometry fields (ST_SetSRID(ST_MakePoint(lng, lat), 4326))...');
      await client.query(`
        UPDATE farmer_profiles SET location_geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
        UPDATE buyer_profiles SET location_geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
        UPDATE produce_listings SET location_geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
        UPDATE market_prices SET location_geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
      `);
    }

    await client.query('COMMIT');
    console.log('✅ Seeding completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
    throw err;
  } finally {
    if (closePool) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  seed(true).catch(err => {
    console.error('Fatal seed error:', err);
    process.exit(1);
  });
}

module.exports = { seed };
