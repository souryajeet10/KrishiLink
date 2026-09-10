const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { validate } = require('../middlewares/validate');
const {
  listMarketPrices,
  syncMarketPrices,
  getCommodities,
  getMarketPriceById,
  createMarketPrice,
  updateMarketPrice,
  deleteMarketPrice,
} = require('../controllers/marketPriceController');

const router = express.Router();

// GET /api/v1/market-prices
// Clean internal endpoint that aggregates from Redis -> data.gov.in AGMARKNET -> PostgreSQL
router.get(
  '/',
  validate([
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 200 }),
    queryValidator('lat').optional().isFloat({ min: -90, max: 90 }),
    queryValidator('lng').optional().isFloat({ min: -180, max: 180 }),
  ]),
  listMarketPrices
);

// POST /api/v1/market-prices/sync
// Explicitly trigger a refresh from data.gov.in AGMARKNET to Redis & PostgreSQL
router.post(
  '/sync',
  syncMarketPrices
);

router.get(
  '/commodities',
  getCommodities
);

router.get(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid market price ID format')]),
  getMarketPriceById
);

router.post(
  '/',
  validate([
    body('commodity').trim().notEmpty().withMessage('Commodity is required'),
    body('market').trim().notEmpty().withMessage('Market name is required'),
    body('minPrice').isFloat({ min: 0 }).withMessage('Min price must be >= 0'),
    body('maxPrice').isFloat({ min: 0 }).withMessage('Max price must be >= 0'),
    body('modalPrice').isFloat({ min: 0 }).withMessage('Modal price must be >= 0'),
  ]),
  createMarketPrice
);

router.put(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid market price ID format')]),
  updateMarketPrice
);

router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid market price ID format')]),
  deleteMarketPrice
);

module.exports = router;
