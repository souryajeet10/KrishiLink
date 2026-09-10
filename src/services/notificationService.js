const { query } = require('../config/db');
const { admin, firebaseInitialized } = require('../config/firebase');

// In-memory record of dispatched notifications for tests & development auditing
const sentNotifications = [];

/**
 * Register or update an FCM device token for a user
 * @param {string} userId
 * @param {string} token
 * @param {string} [deviceType='web']
 * @returns {Promise<boolean>}
 */
async function registerUserToken(userId, token, deviceType = 'web') {
  if (!userId || !token) return false;

  try {
    // 1. Update user primary token
    await query(
      'UPDATE users SET fcm_token = $1, device_type = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3;',
      [token, deviceType, userId]
    );

    // 2. Also record in user_device_tokens for multi-device support
    try {
      await query(`
        INSERT INTO user_device_tokens (user_id, token, device_type, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (token) DO UPDATE SET updated_at = CURRENT_TIMESTAMP, device_type = EXCLUDED.device_type;
      `, [userId, token, deviceType]);
    } catch {
      // If table doesn't exist yet in fallback/in-memory mode, safely ignore
    }

    return true;
  } catch (err) {
    console.warn(`[NotificationService] Error registering FCM token for user ${userId}:`, err.message);
    return false;
  }
}

/**
 * Send an FCM push notification and persist to database notifications table
 *
 * @param {Object} options
 * @param {string} options.userId - Recipient user ID
 * @param {string} [options.type='system'] - Event category (offer, order, alert, system)
 * @param {string} options.title - Notification title (Hindi or primary)
 * @param {string} [options.titleEn] - Notification title in English
 * @param {string} options.body - Notification body message
 * @param {string} [options.emoji='🔔'] - Display emoji
 * @param {Object} [options.data={}] - Additional metadata payload (orderId, offerId, status, etc.)
 * @returns {Promise<{ dbRecord: Object, fcmResult: Object|null }>}
 */
async function sendNotification({
  userId,
  type = 'system',
  title,
  titleEn = null,
  body,
  emoji = '🔔',
  data = {},
}) {
  if (!userId) {
    console.warn('[NotificationService] Missing userId in sendNotification');
    return { dbRecord: null, fcmResult: null };
  }

  let dbRecord = null;
  let fcmResult = null;

  // 1. Persist notification in database
  try {
    const insertRes = await query(`
      INSERT INTO notifications (user_id, type, title, title_en, body, emoji, read, data)
      VALUES ($1, $2, $3, $4, $5, $6, false, $7::jsonb)
      RETURNING *;
    `, [
      userId,
      type,
      title,
      titleEn,
      body,
      emoji,
      JSON.stringify(data || {})
    ]);
    dbRecord = insertRes.rows[0];
  } catch (dbErr) {
    console.warn(`[NotificationService] Could not persist notification in DB:`, dbErr.message);
  }

  // 2. Fetch user's registered FCM token(s)
  let fcmToken = null;
  try {
    const userRes = await query('SELECT fcm_token FROM users WHERE id = $1;', [userId]);
    if (userRes.rows.length > 0 && userRes.rows[0].fcm_token) {
      fcmToken = userRes.rows[0].fcm_token;
    }
  } catch (tokenFetchErr) {
    console.warn(`[NotificationService] Error fetching token for ${userId}:`, tokenFetchErr.message);
  }

  // Convert payload data values to strings as required by Firebase Cloud Messaging
  const stringData = {};
  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([k, v]) => {
      stringData[k] = typeof v === 'string' ? v : JSON.stringify(v);
    });
  }
  stringData.notificationId = dbRecord ? dbRecord.id : '';
  stringData.type = String(type);
  stringData.emoji = String(emoji);

  const payload = {
    userId,
    type,
    title,
    titleEn,
    body,
    emoji,
    data: stringData,
    token: fcmToken,
    timestamp: new Date().toISOString()
  };

  // Always keep in test/audit log
  sentNotifications.push(payload);

  // 3. Dispatch via Firebase Cloud Messaging if token is available
  if (fcmToken) {
    if (firebaseInitialized && admin && admin.messaging) {
      try {
        const fcmMessage = {
          token: fcmToken,
          notification: {
            title: titleEn || title,
            body: body,
          },
          data: stringData,
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'krishilink_alerts',
            },
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1,
              },
            },
          },
          webpush: {
            notification: {
              icon: '/logo.svg',
              badge: '/logo.svg',
            },
          },
        };

        const response = await admin.messaging().send(fcmMessage);
        fcmResult = { success: true, messageId: response };
        console.log(`📲 [FCM] Notification successfully sent to user ${userId}:`, response);
      } catch (fcmErr) {
        fcmResult = { success: false, error: fcmErr.message };
        console.warn(`⚠️ [FCM] Failed to send push message to user ${userId}:`, fcmErr.message);
      }
    } else {
      // Mock / Dev delivery
      fcmResult = { success: true, simulated: true, token: fcmToken };
      if (process.env.NODE_ENV !== 'test') {
        console.log(`🔔 [FCM Dev Mode] Simulated push notification for user ${userId} [${type}]: ${titleEn || title}`);
      }
    }
  } else {
    fcmResult = { skipped: true, reason: 'No FCM token registered for user' };
  }

  return { dbRecord, fcmResult };
}

/**
 * Retrieve test notifications queue
 */
function getSentNotifications() {
  return sentNotifications;
}

/**
 * Clear test notifications queue
 */
function clearSentNotifications() {
  sentNotifications.length = 0;
}

module.exports = {
  registerUserToken,
  sendNotification,
  getSentNotifications,
  clearSentNotifications,
};
