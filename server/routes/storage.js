/**
 * 存储接口 —— 移植自 functions/api/storage.ts
 * GET  /api/storage          读取（全量或指定 keys）
 * GET  /api/storage?status=1 D1 可用性检查
 * POST /api/storage          批量写入
 * DELETE /api/storage        批量删除
 */

const { Router } = require('express');
const db = require('../db');

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(res, body, status = 200) {
  return res.status(status).set(JSON_HEADERS).json(body);
}

// 路由级认证：即使挂载顺序被改动，也强制校验登录 cookie（与 routes/auth.js 逻辑一致）
function requireAuth(req, res, next) {
  const password = process.env.PASSWORD;
  if (typeof password !== 'string') return next(); // 未配置密码时保持开放访问设计

  const cookieAuth = req.cookies && req.cookies.auth;
  const expected = Buffer.from(password).toString('base64'); // 等价于 btoa(password)
  if (cookieAuth && cookieAuth === expected) return next();

  return jsonResponse(res, { error: 'Unauthorized', message: 'Login required' }, 401);
}

module.exports = function createStorageRouter() {
  const router = Router();

  // CORS preflight
  router.options('/', (req, res) => {
    res.status(204).set(JSON_HEADERS).end();
  });

  router.use(requireAuth);

  // GET /api/storage
  router.get('/', (req, res) => {
    const { status, keys: keysParam } = req.query;

    // 可用性检查
    if (status !== undefined) {
      return jsonResponse(res, { d1Available: true });
    }

    const keys = keysParam
      ? String(keysParam).split(',').map(k => k.trim()).filter(Boolean)
      : [];

    try {
      const data = keys.length > 0 ? db.getMany(keys) : db.getAll();
      return jsonResponse(res, { d1Available: true, data });
    } catch (err) {
      console.error('[Storage GET]', err);
      return jsonResponse(res, { error: 'Internal error' }, 500);
    }
  });

  // POST /api/storage
  router.post('/', (req, res) => {
    const body = req.body || {};
    const payload = body.data && typeof body.data === 'object' && !Array.isArray(body.data)
      ? body.data
      : null;

    if (!payload) {
      return jsonResponse(res, { error: 'Invalid payload' }, 400);
    }

    const entries = Object.entries(payload).filter(([key]) => Boolean(key));
    if (entries.length === 0) {
      return jsonResponse(res, { d1Available: true, updated: 0 });
    }

    try {
      const updated = db.setMany(entries);
      return jsonResponse(res, { d1Available: true, updated });
    } catch (err) {
      console.error('[Storage POST]', err);
      return jsonResponse(res, { error: 'Internal error' }, 500);
    }
  });

  // DELETE /api/storage
  router.delete('/', (req, res) => {
    const body = req.body || {};
    const keys = Array.isArray(body.keys)
      ? body.keys.filter(k => typeof k === 'string' && Boolean(k))
      : [];

    if (keys.length === 0) {
      return jsonResponse(res, { d1Available: true, deleted: 0 });
    }

    try {
      const deleted = db.deleteMany(keys);
      return jsonResponse(res, { d1Available: true, deleted });
    } catch (err) {
      console.error('[Storage DELETE]', err);
      return jsonResponse(res, { error: 'Internal error' }, 500);
    }
  });

  return router;
};
