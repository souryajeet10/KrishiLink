require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { pool, checkConnection } = require('./src/config/db');
const apiRoutes = require('./src/routes/index');
const { notFoundHandler, errorHandler } = require('./src/middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 5173;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Prevent browser from caching stale frontend assets during development
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Health check endpoint
app.get(['/api/health', '/health'], async (req, res) => {
  const dbStatus = await checkConnection();
  const statusCode = dbStatus.connected ? 200 : 503;

  res.status(statusCode).json({
    status: dbStatus.connected ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    pool: {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    },
  });
});

// API Routes
app.use('/api/v1', apiRoutes);
app.use('/api', apiRoutes); // Alias for convenience

// Serve static frontend files from root directory
app.use(express.static(__dirname, {
  extensions: ['html', 'htm'],
}));

// Route fallback for SPA: serve app.html on unmatched GET requests not starting with /api
app.get('*', (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'app.html'));
});

// 404 & Centralized Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start server only when executed directly (not when imported in tests)
let server = null;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`\n  🌱 KrishiLink Express + PostgreSQL Backend Running:`);
    console.log(`  ➜ Local:       http://localhost:${PORT}/`);
    console.log(`  ➜ App:         http://localhost:${PORT}/app.html`);
    console.log(`  ➜ API Health:  http://localhost:${PORT}/api/health`);
    console.log(`  ➜ API Base:    http://localhost:${PORT}/api/v1/\n`);
  });
}

// Graceful Shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  if (server) {
    server.close(async () => {
      console.log('🔒 HTTP server closed.');
      try {
        await pool.end();
        console.log('🔒 PostgreSQL connection pool closed.');
        process.exit(0);
      } catch (err) {
        console.error('Error during pool termination:', err);
        process.exit(1);
      }
    });
  } else {
    await pool.end();
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server };
