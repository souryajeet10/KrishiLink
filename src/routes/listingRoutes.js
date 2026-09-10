const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { validate } = require('../middlewares/validate');
const { verifyFirebaseAuth, requireRole, optionalAuth } = require('../middlewares/auth');
const {
  listListings,
  getListingById,
  createListing,
  updateListing,
  deleteListing,
} = require('../controllers/listingController');

const router = express.Router();

// GET /api/v1/listings (Public or authenticated)
router.get(
  '/',
  optionalAuth,
  validate([
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('minPrice').optional().isFloat({ min: 0 }),
    queryValidator('maxPrice').optional().isFloat({ min: 0 }),
    queryValidator('lat').optional().isFloat({ min: -90, max: 90 }),
    queryValidator('lng').optional().isFloat({ min: -180, max: 180 }),
    queryValidator('radiusKm').optional().isFloat({ min: 1 }),
  ]),
  listListings
);

// GET /api/v1/listings/:id
router.get(
  '/:id',
  optionalAuth,
  validate([param('id').isUUID().withMessage('Invalid listing ID format')]),
  getListingById
);

// POST /api/v1/listings (Only Farmers or Admin)
router.post(
  '/',
  verifyFirebaseAuth,
  requireRole('farmer', 'admin'),
  validate([
    body('farmerId').optional().isUUID().withMessage('Valid farmer ID is required'),
    body('crop').trim().notEmpty().withMessage('Crop name is required'),
    body('quantity').isFloat({ min: 0.1 }).withMessage('Quantity must be greater than 0'),
    body('grade').isIn(['A', 'B', 'C', 'Other']).withMessage('Grade must be A, B, C, or Other'),
    body('askingPrice').isFloat({ min: 0 }).withMessage('Asking price must be a non-negative number'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
  ]),
  (req, res, next) => {
    // If farmerId not provided in body, default to logged in user id
    if (!req.body.farmerId && req.user) {
      req.body.farmerId = req.user.id;
    }
    createListing(req, res, next);
  }
);

// PUT /api/v1/listings/:id (Only Farmers or Admin)
router.put(
  '/:id',
  verifyFirebaseAuth,
  requireRole('farmer', 'admin'),
  validate([
    param('id').isUUID().withMessage('Invalid listing ID format'),
    body('quantity').optional().isFloat({ min: 0.1 }),
    body('askingPrice').optional().isFloat({ min: 0 }),
  ]),
  updateListing
);

// DELETE /api/v1/listings/:id (Only Farmers or Admin)
router.delete(
  '/:id',
  verifyFirebaseAuth,
  requireRole('farmer', 'admin'),
  validate([param('id').isUUID().withMessage('Invalid listing ID format')]),
  deleteListing
);

module.exports = router;
