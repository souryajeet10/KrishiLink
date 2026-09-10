const express = require('express');
const { query } = require('../config/db');
const { verifyFirebaseAuth, requireRole } = require('../middlewares/auth');

const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const farmerProfileRoutes = require('./farmerProfileRoutes');
const buyerProfileRoutes = require('./buyerProfileRoutes');
const listingRoutes = require('./listingRoutes');
const offerRoutes = require('./offerRoutes');
const orderRoutes = require('./orderRoutes');
const marketPriceRoutes = require('./marketPriceRoutes');
const notificationRoutes = require('./notificationRoutes');

const router = express.Router();

// Mount Entity Endpoints
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/farmer-profiles', farmerProfileRoutes);
router.use('/buyer-profiles', buyerProfileRoutes);
router.use('/listings', listingRoutes);
router.use('/offers', offerRoutes);
router.use('/orders', orderRoutes);
router.use('/market-prices', marketPriceRoutes);
router.use('/notifications', notificationRoutes);

// Admin Analytics & Dashboard Overview (Strictly restricted to Admin role)
router.get(
  '/admin/stats',
  verifyFirebaseAuth,
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const statsRes = await query(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE role = 'farmer') AS total_farmers,
          (SELECT COUNT(*) FROM users WHERE role = 'buyer') AS total_buyers,
          (SELECT COUNT(*) FROM produce_listings WHERE status = 'active') AS active_listings,
          (SELECT COUNT(*) FROM offers WHERE status = 'pending') AS pending_offers,
          (SELECT COUNT(*) FROM orders) AS total_orders,
          COALESCE((SELECT SUM(total_amount) FROM orders WHERE status != 'cancelled'), 0) AS total_revenue;
      `);

      const row = statsRes.rows[0];
      res.json({
        success: true,
        data: {
          totalFarmers: parseInt(row.total_farmers, 10),
          totalBuyers: parseInt(row.total_buyers, 10),
          activeListings: parseInt(row.active_listings, 10),
          pendingOffers: parseInt(row.pending_offers, 10),
          totalOrders: parseInt(row.total_orders, 10),
          revenue: parseFloat(row.total_revenue),
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
