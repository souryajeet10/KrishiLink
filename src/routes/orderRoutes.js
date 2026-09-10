const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { validate } = require('../middlewares/validate');
const { verifyFirebaseAuth, requireRole } = require('../middlewares/auth');
const {
  listOrders,
  getOrderById,
  createOrder,
  updateOrder,
  deleteOrder,
} = require('../controllers/orderController');

const router = express.Router();

// All order operations require Firebase Authentication
router.use(verifyFirebaseAuth);

router.get(
  '/',
  validate([
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('status').optional().isIn(['pending', 'confirmed', 'pickup_scheduled', 'in_transit', 'delivered', 'cancelled']),
  ]),
  listOrders
);

router.get(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid order ID format')]),
  getOrderById
);

router.post(
  '/',
  validate([
    body('farmerId').isUUID().withMessage('Valid farmer ID is required'),
    body('buyerId').isUUID().withMessage('Valid buyer ID is required'),
    body('crop').trim().notEmpty().withMessage('Crop is required'),
    body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
    body('agreedPrice').isFloat({ min: 0.01 }).withMessage('Agreed price must be greater than 0'),
  ]),
  createOrder
);

router.put(
  '/:id',
  requireRole('farmer', 'buyer', 'admin'),
  validate([
    param('id').isUUID().withMessage('Invalid order ID format'),
    body('status').optional().isIn(['pending', 'confirmed', 'pickup_scheduled', 'in_transit', 'delivered', 'cancelled']),
    body('paymentStatus').optional().isIn(['pending', 'escrowed', 'paid', 'refunded']),
  ]),
  updateOrder
);

router.delete(
  '/:id',
  requireRole('admin'),
  validate([param('id').isUUID().withMessage('Invalid order ID format')]),
  deleteOrder
);

module.exports = router;
