const Queue = require('bull');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// single download queue instance
const downloadQueue = new Queue('downloads', REDIS_URL);

module.exports = { downloadQueue };
