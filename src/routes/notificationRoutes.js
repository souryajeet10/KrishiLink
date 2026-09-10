const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { validate } = require('../middlewares/validate');
const { verifyFirebaseAuth } = require('../middlewares/auth');
const {
  listNotifications,
  getNotificationById,
  createNotification,
  updateNotification,
  markAllAsRead,
  deleteNotification,
  registerDeviceToken,
} = require('../controllers/notificationController');

const router = express.Router();

router.use(verifyFirebaseAuth);

router.get(
  '/',
  validate([
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('userId').optional().isUUID(),
  ]),
  (req, res, next) => {
    // Automatically scope notifications to authenticated user unless admin
    if (!req.query.userId && req.user && req.user.role !== 'admin') {
      req.query.userId = req.user.id;
    }
    listNotifications(req, res, next);
  }
);

router.get(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid notification ID format')]),
  getNotificationById
);

router.post(
  '/',
  validate([
    body('userId').isUUID().withMessage('Valid user ID is required'),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('body').trim().notEmpty().withMessage('Body text is required'),
  ]),
  createNotification
);

// Register FCM Device Token for push notifications
router.post(
  ['/fcm-token', '/register-token'],
  validate([
    body('token').optional().isString().notEmpty().withMessage('Token must be a non-empty string'),
    body('fcmToken').optional().isString().notEmpty().withMessage('fcmToken must be a non-empty string'),
  ]),
  registerDeviceToken
);

router.patch(
  '/mark-all-read',
  (req, res, next) => {
    if (!req.body.userId && req.user) {
      req.body.userId = req.user.id;
    }
    markAllAsRead(req, res, next);
  }
);

router.patch(
  '/:id/read',
  validate([param('id').isUUID().withMessage('Invalid notification ID format')]),
  updateNotification
);

router.put(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid notification ID format')]),
  updateNotification
);

router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid notification ID format')]),
  deleteNotification
);

module.exports = router;
