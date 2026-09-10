const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { validate } = require('../middlewares/validate');
const { verifyFirebaseAuth, requireRole } = require('../middlewares/auth');
const {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} = require('../controllers/userController');

const router = express.Router();

router.use(verifyFirebaseAuth);

// GET /api/v1/users (Restricted to Admin)
router.get(
  '/',
  requireRole('admin'),
  validate([
    queryValidator('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    queryValidator('role').optional().isIn(['farmer', 'buyer', 'admin']).withMessage('Invalid role filter'),
  ]),
  listUsers
);

// GET /api/v1/users/:id
router.get(
  '/:id',
  validate([
    param('id').isUUID().withMessage('Invalid User ID format'),
  ]),
  getUserById
);

// POST /api/v1/users (Admin only direct creation)
router.post(
  '/',
  requireRole('admin'),
  validate([
    body('role').isIn(['farmer', 'buyer', 'admin']).withMessage('Role must be farmer, buyer, or admin'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').trim().matches(/^[0-9]{10,15}$/).withMessage('Valid phone number is required'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Must be a valid email'),
  ]),
  createUser
);

// PUT /api/v1/users/:id
router.put(
  '/:id',
  validate([
    param('id').isUUID().withMessage('Invalid User ID format'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Must be a valid email'),
    body('phone').optional().matches(/^[0-9]{10,15}$/).withMessage('Valid phone number is required'),
  ]),
  updateUser
);

// DELETE /api/v1/users/:id (Admin only)
router.delete(
  '/:id',
  requireRole('admin'),
  validate([
    param('id').isUUID().withMessage('Invalid User ID format'),
  ]),
  deleteUser
);

module.exports = router;
