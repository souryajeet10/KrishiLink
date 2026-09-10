const { query, getClient } = require('../config/db');
const { verifyToken } = require('../config/firebase');

/**
 * Middleware to verify Firebase ID tokens on protected routes
 * and synchronize the verified user into PostgreSQL (create-if-not-exists)
 */
async function verifyFirebaseAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required: Missing or invalid Authorization header (Bearer <token>)',
      });
    }

    const idToken = authHeader.split('Bearer ')[1].trim();
    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required: Token is missing',
      });
    }

    // 1. Verify token with Firebase Admin
    let decoded;
    try {
      decoded = await verifyToken(idToken);
    } catch (tokenErr) {
      return res.status(401).json({
        success: false,
        message: `Authentication failed: ${tokenErr.message}`,
      });
    }

    const firebaseUid = decoded.uid;
    const email = decoded.email || req.body?.email || null;
    const phone = decoded.phone_number || req.body?.phone || null;

    // 2. Query PostgreSQL users table
    let dbUser = null;
    try {
      const userRes = await query(`
        SELECT u.id, u.firebase_uid, u.role, u.name, u.name_hi, u.phone, u.email, u.avatar, u.verified, u.created_at,
               fp.id AS farmer_profile_id, fp.village, fp.district AS farmer_district, fp.state AS farmer_state, fp.rating AS farmer_rating,
               bp.id AS buyer_profile_id, bp.company, bp.city AS buyer_city, bp.state AS buyer_state, bp.rating AS buyer_rating
        FROM users u
        LEFT JOIN farmer_profiles fp ON u.id = fp.user_id
        LEFT JOIN buyer_profiles bp ON u.id = bp.user_id
        WHERE u.firebase_uid = $1
           OR ($2::varchar IS NOT NULL AND u.phone = $2)
           OR ($3::varchar IS NOT NULL AND LOWER(u.email) = LOWER($3));
      `, [firebaseUid, phone, email]);
      dbUser = userRes.rows[0];
    } catch (dbErr) {
      // In dev/test environments without an active PostgreSQL instance, populate req.user from token
      if (process.env.FIREBASE_DEV_MODE === 'true' || process.env.NODE_ENV !== 'production') {
        const requestedRole = decoded.role || req.body?.role || 'farmer';
        req.user = {
          id: firebaseUid.includes('-') && firebaseUid.length === 36 ? firebaseUid : '11111111-1111-1111-1111-111111111111',
          firebase_uid: firebaseUid,
          role: requestedRole,
          name: decoded.name || 'Dev User',
          phone: phone || '9876543210',
          email: email || `${firebaseUid}@krishilink.app`,
          verified: true,
        };
        req.firebaseUser = decoded;
        return next();
      }
      throw dbErr;
    }

    // 3. User Sync: If user does not exist, create on first login/signup (Create-If-Not-Exists)
    if (!dbUser) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Determine user attributes from token or request body
        const requestedRole = req.body?.role || decoded.role || 'farmer';
        const role = ['farmer', 'buyer', 'admin'].includes(requestedRole) ? requestedRole : 'farmer';
        const name = req.body?.name || decoded.name || (email ? email.split('@')[0] : `User ${firebaseUid.slice(0, 6)}`);
        const nameHi = req.body?.nameHi || null;
        const userPhone = phone || req.body?.phone || `99${Date.now().toString().slice(-8)}`;
        const userEmail = email || null;
        const defaultAvatar = req.body?.avatar || (role === 'farmer' ? '👨‍🌾' : role === 'buyer' ? '🏪' : '⚙️');

        const insertUserRes = await client.query(`
          INSERT INTO users (firebase_uid, role, name, name_hi, phone, email, avatar, verified)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *;
        `, [firebaseUid, role, name, nameHi, userPhone, userEmail, defaultAvatar, false]);

        dbUser = insertUserRes.rows[0];

        // Create corresponding profile
        if (role === 'farmer') {
          const fpRes = await client.query(`
            INSERT INTO farmer_profiles (user_id, village, district, state, land_acres, crops)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, village, district, state, rating;
          `, [
            dbUser.id,
            req.body?.village || null,
            req.body?.district || null,
            req.body?.state || null,
            req.body?.landAcres || 0,
            req.body?.crops || []
          ]);
          dbUser.farmer_profile_id = fpRes.rows[0]?.id;
        } else if (role === 'buyer') {
          const bpRes = await client.query(`
            INSERT INTO buyer_profiles (user_id, company, city, district, state, gstin)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, company, city, state, rating;
          `, [
            dbUser.id,
            req.body?.company || null,
            req.body?.city || null,
            req.body?.district || null,
            req.body?.state || null,
            req.body?.gstin || null
          ]);
          dbUser.buyer_profile_id = bpRes.rows[0]?.id;
        }

        // Welcome notification
        await client.query(`
          INSERT INTO notifications (user_id, type, title, title_en, body, emoji)
          VALUES ($1, 'system', 'खाता सत्यापित', 'Firebase Account Linked', 'KrishiLink में आपका स्वागत है!', '🎉');
        `, [dbUser.id]);

        await client.query('COMMIT');
      } catch (syncErr) {
        await client.query('ROLLBACK');
        console.error('Error auto-syncing Firebase user to PostgreSQL:', syncErr);
        return res.status(500).json({
          success: false,
          message: 'Failed to synchronize user record with database',
        });
      } finally {
        client.release();
      }
    } else if (!dbUser.firebase_uid) {
      // Link existing phone/email record with new Firebase UID
      await query('UPDATE users SET firebase_uid = $1 WHERE id = $2;', [firebaseUid, dbUser.id]);
      dbUser.firebase_uid = firebaseUid;
    }

    req.user = dbUser;
    req.firebaseUser = decoded;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role-Based Access Control (RBAC) middleware
 * Ensures user has one of the allowed roles
 * @param  {...string} allowedRoles ('farmer', 'buyer', 'admin')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to role(s): [${allowedRoles.join(', ')}]. Your current role is "${req.user.role}".`,
      });
    }

    next();
  };
}

/**
 * Optional authentication middleware for public endpoints
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  try {
    const idToken = authHeader.split('Bearer ')[1].trim();
    if (!idToken) return next();

    const decoded = await verifyToken(idToken);
    try {
      const userRes = await query('SELECT * FROM users WHERE firebase_uid = $1;', [decoded.uid]);
      if (userRes.rows.length > 0) {
        req.user = userRes.rows[0];
        req.firebaseUser = decoded;
      }
    } catch {}
  } catch (err) {
    // Ignore token errors for optional auth
  }
  next();
}

module.exports = {
  verifyFirebaseAuth,
  requireRole,
  optionalAuth,
};
