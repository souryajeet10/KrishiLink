const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { validate } = require('../middlewares/validate');
const {
  listBuyerProfiles,
  getBuyerProfileById,
  createBuyerProfile,
  updateBuyerProfile,
  deleteBuyerProfile,
} = require('../controllers/buyerProfileController');

const router = express.Router();

router.get(
  '/',
  validate([
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  listBuyerProfiles
);

router.get(
  '/:id',
  getBuyerProfileById
);

router.post(
  '/',
  validate([
    body('userId').isUUID().withMessage('Valid user ID is required'),
    body('company').optional().trim(),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
  ]),
  createBuyerProfile
);

router.put(
  '/:id',
  validate([
    body('rating').optional().isFloat({ min: 0, max: 5 }),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
  ]),
  updateBuyerProfile
);

router.delete(
  '/:id',
  deleteBuyerProfile
);

module.exports = router;
