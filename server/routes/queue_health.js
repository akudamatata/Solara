const express = require('express');
const IORedis = require('ioredis');

const router = express.Router();

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

router.get('/health', async (req, res) => {
  let client;
  try {
    client = new IORedis(REDIS_URL, { connectTimeout: 2000, maxRetriesPerRequest: 0 });
    const pong = await client.ping();
    res.json({ ok: pong === 'PONG', redis: true });
  } catch (err) {
    console.warn('[queue health] redis ping failed', err && err.message);
    res.status(503).json({ ok: false, redis: false, error: err && err.message });
  } finally {
    if (client) client.disconnect();
  }
});

module.exports = router;
