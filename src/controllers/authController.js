const { query, getClient } = require('../config/db');

const login = async (req, res, next) => {
  try {
    const { phoneOrEmail, password } = req.body;
    const userRes = await query(
      `SELECT u.id, u.role, u.name, u.name_hi, u.phone, u.email, u.password, u.avatar, u.verified, u.created_at,
              fp.village, fp.district AS farmer_district, fp.state AS farmer_state, fp.land_acres, fp.crops, fp.rating AS farmer_rating, fp.total_sales,
              bp.company, bp.city AS buyer_city, bp.district AS buyer_district, bp.state AS buyer_state, bp.rating AS buyer_rating, bp.total_purchases
       FROM users u
       LEFT JOIN farmer_profiles fp ON u.id = fp.user_id
       LEFT JOIN buyer_profiles bp ON u.id = bp.user_id
       WHERE (u.phone = $1 OR LOWER(u.email) = LOWER($1))`,
      [phoneOrEmail]
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid phone/email or password' });
    }

    const user = userRes.rows[0];

    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid phone/email or password' });
    }

    delete user.password;
    res.json({
      success: true,
      message: 'Login successful',
      user,
    });
  } catch (err) {
    next(err);
  }
};

const register = async (req, res, next) => {
  const client = await getClient();
  try {
    const {
      role, name, nameHi, phone, email, password, avatar,
      village, district, state, landAcres, crops,
      company, city, gstin
    } = req.body;

    await client.query('BEGIN');

    // 1. Check existing phone
    const existing = await client.query('SELECT id FROM users WHERE phone = $1 OR (email IS NOT NULL AND email = $2);', [phone, email || null]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'User with this phone or email already exists' });
    }

    // 2. Insert User
    const defaultAvatar = avatar || (role === 'farmer' ? '👨‍🌾' : role === 'buyer' ? '🏪' : '⚙️');
    const userRes = await client.query(
      `INSERT INTO users (role, name, name_hi, phone, email, password, avatar, verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, role, name, name_hi, phone, email, avatar, verified, created_at;`,
      [role, name, nameHi || null, phone, email || null, password, defaultAvatar, false]
    );
    const newUser = userRes.rows[0];

    // 3. Create role-specific profile (Farmers are exempt from GSTIN under Indian agricultural law)
    if (role === 'farmer') {
      const cropsArray = Array.isArray(crops) ? crops : (crops ? [crops] : []);
      await client.query(
        `INSERT INTO farmer_profiles (user_id, village, district, state, land_acres, crops)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [newUser.id, village || null, district || null, state || null, landAcres || 0, cropsArray]
      );
    } else if (role === 'buyer') {
      await client.query(
        `INSERT INTO buyer_profiles (user_id, company, city, district, state, gstin)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [newUser.id, company || null, city || null, district || null, state || null, gstin || null]
      );
    }

    // Create a welcome notification
    await client.query(
      `INSERT INTO notifications (user_id, type, title, title_en, body, emoji)
       VALUES ($1, 'system', 'खाता बनाया गया', 'Account Created', 'KrishiLink में आपका स्वागत है!', '🎉');`,
      [newUser.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: newUser,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  login,
  register,
};
