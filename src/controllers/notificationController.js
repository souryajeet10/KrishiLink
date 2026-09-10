const { query } = require('../config/db');
const { getPaginationParams, formatPaginatedResponse } = require('../utils/pagination');

// GET /api/v1/notifications
const listNotifications = async (req, res, next) => {
  try {
    const { page, limit, offset } = getPaginationParams(req);
    const { userId, read, type } = req.query;

    let whereClauses = [];
    let params = [];

    if (userId) {
      params.push(userId);
      whereClauses.push(`user_id = $${params.length}`);
    }

    if (read !== undefined) {
      params.push(read === 'true');
      whereClauses.push(`read = $${params.length}`);
    }

    if (type) {
      params.push(type);
      whereClauses.push(`type = $${params.length}`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) FROM notifications ${whereSql};`, params);
    const totalCount = countRes.rows[0].count;

    const dataParams = [...params, limit, offset];
    const dataSql = `
      SELECT *
      FROM notifications
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length};
    `;

    const dataRes = await query(dataSql, dataParams);
    res.json(formatPaginatedResponse(dataRes.rows, totalCount, page, limit));
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/notifications/:id
const getNotificationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM notifications WHERE id = $1;', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/notifications
const createNotification = async (req, res, next) => {
  try {
    const { userId, type, title, titleEn, body, emoji, data } = req.body;
    const result = await query(`
      INSERT INTO notifications (user_id, type, title, title_en, body, emoji, read, data)
      VALUES ($1, $2, $3, $4, $5, $6, false, $7::jsonb)
      RETURNING *;
    `, [
      userId,
      type || 'system',
      title,
      titleEn || null,
      body,
      emoji || '🔔',
      JSON.stringify(data || {})
    ]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/notifications/:id/read or PUT /api/v1/notifications/:id
const updateNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { read } = req.body;

    const result = await query(
      'UPDATE notifications SET read = $1 WHERE id = $2 RETURNING *;',
      [read !== undefined ? read : true, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/notifications/mark-all-read
const markAllAsRead = async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    await query('UPDATE notifications SET read = true WHERE user_id = $1;', [userId]);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/v1/notifications/:id
const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM notifications WHERE id = $1 RETURNING id;', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/notifications/fcm-token
const registerDeviceToken = async (req, res, next) => {
  try {
    const { registerUserToken } = require('../services/notificationService');
    const { token, fcmToken, deviceType } = req.body;
    const tokenToSave = token || fcmToken;
    const userId = req.body.userId || req.user?.id;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }
    if (!tokenToSave) {
      return res.status(400).json({ success: false, message: 'FCM token is required' });
    }

    const success = await registerUserToken(userId, tokenToSave, deviceType || 'web');
    if (!success) {
      return res.status(500).json({ success: false, message: 'Failed to register device token' });
    }

    res.json({
      success: true,
      message: 'FCM device token registered successfully',
      data: { userId, token: tokenToSave, deviceType: deviceType || 'web' },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  markAllAsRead,
  deleteNotification,
  registerDeviceToken,
};

