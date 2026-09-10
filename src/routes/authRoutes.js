const express = require('express');
const { body } = require('express-validator');
const { validate } = require('../middlewares/validate');
const { verifyFirebaseAuth } = require('../middlewares/auth');
const { login, register } = require('../controllers/authController');

const router = express.Router();

// Synchronize Firebase user into PostgreSQL (called right after Firebase login/signup)
router.post(
  '/sync',
  verifyFirebaseAuth,
  (req, res) => {
    res.json({
      success: true,
      message: 'User synchronized successfully with PostgreSQL',
      user: req.user,
    });
  }
);

// Get current authenticated user profile
router.get(
  '/me',
  verifyFirebaseAuth,
  (req, res) => {
    res.json({
      success: true,
      user: req.user,
    });
  }
);

router.post(
  '/login',
  validate([
    body('phoneOrEmail').notEmpty().withMessage('Phone or email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ]),
  login
);

router.post(
  '/register',
  validate([
    body('role').isIn(['farmer', 'buyer', 'admin']).withMessage('Role must be farmer, buyer, or admin'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').trim().matches(/^[0-9]{10,15}$/).withMessage('Valid phone number (10-15 digits) is required'),
    body('password').isLength({ min: 4 }).withMessage('Password must be at least 4 characters'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Must be a valid email'),
  ]),
  register
);

module.exports = router;
