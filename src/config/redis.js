const Redis = require('ioredis');
require('dotenv').config();

let redisClient = null;
let isRedisConnected = false;

// In-memory fallback cache if Redis server is offline
const memoryCache = new Map();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const defaultTTL = parseInt(process.env.REDIS_CACHE_TTL || '10800', 10); // 3 hours

try {
  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      // Retry once then pause to prevent unhandled reconnection spam in local dev
      if (times > 2) {
        return null;
      }
      return Math.min(times * 1000, 2000);
    },
    enableOfflineQueue: false,
    connectTimeout: 2000,
  });

  redisClient.on('connect', () => {
    isRedisConnected = true;
    console.log('⚡ Connected to Redis cache.');
  });

  redisClient.on('error', (err) => {
    if (isRedisConnected) {
      console.warn('⚠️ Redis error:', err.message);
    }
    isRedisConnected = false;
  });
} catch (err) {
  console.warn('ℹ️ Redis initialization note:', err.message);
}

/**
 * Get cached value by key
 * @param {string} key 
 * @returns {Promise<any|null>}
 */
async function getCache(key) {
  if (isRedisConnected && redisClient) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      console.warn(`Redis getCache error for "${key}":`, err.message);
    }
  }

  // Memory fallback check
  const entry = memoryCache.get(key);
  if (entry) {
    if (Date.now() < entry.expiry) {
      return entry.data;
    }
    memoryCache.delete(key);
  }

  return null;
}

/**
 * Set cached value with TTL in seconds
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttlSeconds 
 */
async function setCache(key, value, ttlSeconds = defaultTTL) {
  const serialized = JSON.stringify(value);

  if (isRedisConnected && redisClient) {
    try {
      await redisClient.set(key, serialized, 'EX', ttlSeconds);
      return;
    } catch (err) {
      console.warn(`Redis setCache error for "${key}":`, err.message);
    }
  }

  // Memory fallback cache
  memoryCache.set(key, {
    data: value,
    expiry: Date.now() + (ttlSeconds * 1000),
  });
}

/**
 * Delete cached key
 * @param {string} key 
 */
async function deleteCache(key) {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.del(key);
    } catch (err) {}
  }
  memoryCache.delete(key);
}

/**
 * Check if Redis is currently connected
 */
function isRedisAvailable() {
  return isRedisConnected;
}

/**
 * Cleanly close Redis connection
 */
async function closeRedis() {
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch {}
  }
}

module.exports = {
  redisClient,
  getCache,
  setCache,
  deleteCache,
  isRedisAvailable,
  closeRedis,
};
