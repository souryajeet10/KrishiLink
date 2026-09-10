const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { validate } = require('../middlewares/validate');
const { verifyFirebaseAuth, requireRole } = require('../middlewares/auth');
const {
  listOffers,
  getOfferById,
  createOffer,
  updateOffer,
  deleteOffer,
} = require('../controllers/offerController');

const router = express.Router();

// All offer routes require Firebase Authentication
router.use(verifyFirebaseAuth);

// GET /api/v1/offers
router.get(
  '/',
  validate([
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
    queryValidator('status').optional().isIn(['pending', 'accepted', 'rejected', 'countered', 'cancelled']),
  ]),
  listOffers
);

// GET /api/v1/offers/:id
router.get(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid offer ID format')]),
  getOfferById
);

// POST /api/v1/offers (Only Buyers or Admin can make offers)
router.post(
  '/',
  requireRole('buyer', 'admin'),
  validate([
    body('listingId').isUUID().withMessage('Valid listing ID is required'),
    body('buyerId').optional().isUUID().withMessage('Valid buyer ID is required'),
    body('offerPrice').isFloat({ min: 0.01 }).withMessage('Offer price must be greater than 0'),
    body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be greater than 0'),
  ]),
  (req, res, next) => {
    if (!req.body.buyerId && req.user) {
      req.body.buyerId = req.user.id;
    }
    createOffer(req, res, next);
  }
);

// PUT /api/v1/offers/:id (Respond to / Accept / Reject offer)
router.put(
  '/:id',
  requireRole('farmer', 'buyer', 'admin'),
  validate([
    param('id').isUUID().withMessage('Invalid offer ID format'),
    body('status').optional().isIn(['pending', 'accepted', 'rejected', 'countered', 'cancelled']),
  ]),
  updateOffer
);

// DELETE /api/v1/offers/:id
router.delete(
  '/:id',
  validate([param('id').isUUID().withMessage('Invalid offer ID format')]),
  deleteOffer
);

module.exports = router;
