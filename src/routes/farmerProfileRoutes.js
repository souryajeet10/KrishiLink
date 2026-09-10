const express = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const { validate } = require('../middlewares/validate');
const {
  listFarmerProfiles,
  getFarmerProfileById,
  createFarmerProfile,
  updateFarmerProfile,
  deleteFarmerProfile,
} = require('../controllers/farmerProfileController');

const router = express.Router();

router.get(
  '/',
  validate([
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  listFarmerProfiles
);

router.get(
  '/:id',
  getFarmerProfileById
);

router.post(
  '/',
  validate([
    body('userId').isUUID().withMessage('Valid user ID is required'),
    body('landAcres').optional().isFloat({ min: 0 }).withMessage('Land acres must be positive'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  ]),
  createFarmerProfile
);

router.put(
  '/:id',
  validate([
    body('landAcres').optional().isFloat({ min: 0 }).withMessage('Land acres must be positive'),
    body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('Rating must be between 0 and 5'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
  ]),
  updateFarmerProfile
);

router.delete(
  '/:id',
  deleteFarmerProfile
);

module.exports = router;
