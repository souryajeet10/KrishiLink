const fs = require('fs');
const path = require('path');
require('dotenv').config();

let admin = null;
let firebaseInitialized = false;

try {
  admin = require('firebase-admin');

  // Check if service account file exists
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS 
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS) 
    : path.resolve(__dirname, '../../serviceAccountKey.json');

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseInitialized = true;
    console.log('🔥 Firebase Admin initialized via service account file.');
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
    firebaseInitialized = true;
    console.log('🔥 Firebase Admin initialized via environment variables.');
  } else {
    console.log('ℹ️ Firebase Admin credentials not found. Running in Development / Emulator mode.');
  }
} catch (err) {
  console.warn('⚠️ Firebase Admin initialization notice:', err.message);
}

/**
 * Verify a Firebase ID Token
 * @param {string} token 
 * @returns {Promise<{ uid: string, email?: string, phone_number?: string, name?: string, role?: string }>}
 */
async function verifyToken(token) {
  if (!token) {
    throw new Error('No token provided');
  }

  // 1. If Firebase Admin is initialized with live credentials, verify with Google servers
  if (firebaseInitialized && admin) {
    try {
      return await admin.auth().verifyIdToken(token);
    } catch (err) {
      // If live verification fails, check if dev mode allows mock fallback
      if (process.env.FIREBASE_DEV_MODE !== 'true') {
        throw err;
      }
    }
  }

  // 2. Dev / Test Mode token parser
  // Allows testing and local MVP development before user sets up Google Cloud Service Account
  if (process.env.FIREBASE_DEV_MODE === 'true' || process.env.NODE_ENV === 'test' || !firebaseInitialized) {
    if (token.startsWith('dev-token-')) {
      const parts = token.replace('dev-token-', '').split(':');
      // Format: dev-token-<uid>:<role>:<phoneOrEmail>
      const uid = parts[0] || 'dev_user_001';
      const role = parts[1] || 'farmer';
      const contact = parts[2] || '9876543210';
      const isEmail = contact.includes('@');

      return {
        uid,
        email: isEmail ? contact : `${uid}@krishilink.app`,
        phone_number: isEmail ? undefined : contact,
        name: parts[3] ? decodeURIComponent(parts[3]) : `Dev ${role.charAt(0).toUpperCase() + role.slice(1)}`,
        role,
        firebase: { sign_in_provider: 'custom' },
      };
    }

    // Try parsing base64 encoded JWT payload without external network request (for offline mock tokens)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.uid || payload.sub || payload.user_id) {
          return {
            uid: payload.uid || payload.sub || payload.user_id,
            email: payload.email,
            phone_number: payload.phone_number,
            name: payload.name,
            role: payload.role,
          };
        }
      }
    } catch {}
  }

  throw new Error('Firebase token verification failed: Invalid or unverified token');
}

module.exports = {
  admin,
  firebaseInitialized,
  verifyToken,
};
