/**
 * 代理接口 —— 移植自 functions/proxy.ts
 * GET /proxy
 *
 * 核心缓存逻辑与 Cloudflare 版完全一致：
 *   - Cache HIT  → 直接返回缓存内容，不请求上游
 *   - Cache MISS → 请求上游，成功后写入本地内存缓存（5 分钟 TTL）
 *   - 搜索结果为空 / 包含错误 → 不缓存
 */

const { Router } = require('express');
const cache = require('../cache');

const API_BASE_URL = process.env.API_BASE_URL || 'https://music-api.gdstudio.xyz/api.php';
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$/i;

const SAFE_RESPONSE_HEADERS = [
  'content-type', 'cache-control', 'accept-ranges',
  'content-length', 'content-range', 'etag', 'last-modified', 'expires',
];

function isAllowedKuwoHost(hostname) {
  return hostname && KUWO_HOST_PATTERN.test(hostname);
}

function buildCacheKey(url) {
  // 过滤随机防缓存签名 s 以及 nocache 参数，以便重试成功后能更新同一个缓存项
  const u = new URL(url);
  u.searchParams.delete('s');
  u.searchParams.delete('nocache');
  return u.toString();
}

/** 代理酷我音频流（带 Range 支持） */
async function proxyKuwoAudio(targetUrl, req, res) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return res.status(400).send('Invalid target');
  }

  if (!isAllowedKuwoHost(parsed.hostname)) {
    return res.status(400).send('Invalid target');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).send('Invalid target');
  }
  parsed.protocol = 'http:';

  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    'Referer': 'https://www.kuwo.cn/',
  };
  if (req.headers['range']) headers['Range'] = req.headers['range'];

  const controller = new AbortController();
  req.on('close', () => {
    controller.abort();
  });

  try {
    const upstream = await fetch(parsed.toString(), {
      method: req.method,
      headers,
      signal: controller.signal
    });
    res.status(upstream.status);

    for (const h of SAFE_RESPONSE_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const { Readable } = require('node:stream');
    return Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('[Proxy Kuwo] Request aborted by client');
      return;
    }
    console.error('[Proxy Kuwo]', err);
    return res.status(502).send('Upstream error');
  }
}

/** 代理 music API 请求，带本地缓存 */
async function proxyApiRequest(reqUrl, req, res) {
  const cacheKey = buildCacheKey(reqUrl);
  const parsedReq = new URL(reqUrl);
  const bypassCache = parsedReq.searchParams.get('nocache') === 'true';

  // ── Cache HIT ──────────────────────────────────────────────────────────────
  if (!bypassCache) {
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${reqUrl}`);
      res.setHeader('Content-Type', cached.contentType || 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Cache-Status', 'HIT');
      res.setHeader('Access-Control-Expose-Headers', 'X-Cache-Status');
      return res.send(cached.body);
    }
  }

  // ── Cache MISS：请求上游 ────────────────────────────────────────────────────
  console.log(`[Cache MISS] Fetching from upstream: ${reqUrl}`);

  let upstream;
  let responseText;
  let contentType;

  if (process.env.WRANGLER_API_URL) {
    // 转发给内部 Wrangler，利用其 BoringSSL 绕过 Cloudflare 验证
    const wranglerUrl = new URL(process.env.WRANGLER_API_URL + '/proxy');
    parsedReq.searchParams.forEach((value, key) => {
      if (key === 'target' || key === 'callback' || key === 's' || key === 'nocache') return;
      wranglerUrl.searchParams.set(key, value);
    });

    const fetchHeaders = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
      'Accept': 'application/json',
    };
    if (process.env.PASSWORD) {
      fetchHeaders['Cookie'] = `auth=${Buffer.from(process.env.PASSWORD).toString('base64')}`;
    } else if (req.headers.cookie) {
      fetchHeaders['Cookie'] = req.headers.cookie;
    }

    try {
      upstream = await fetch(wranglerUrl.toString(), {
        headers: fetchHeaders,
        redirect: 'manual',
      });
      // 若出现重定向（如未授权重定向到登录页），说明认证异常，禁止将 HTML 作为 JSON 返回
      if (upstream.status >= 300 && upstream.status < 400) {
        console.error('[Proxy API via Wrangler] Upstream returned redirect status:', upstream.status);
        return res.status(502).send('Internal auth proxy redirect error');
      }
      responseText = await upstream.text();
      contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    } catch (err) {
      console.error('[Proxy API via Wrangler fetch]', err);
      return res.status(502).send('Upstream proxy error');
    }
  } else {
    // 原逻辑，未配置 WRANGLER_API_URL 时直接 fetch API_BASE_URL
    const apiUrl = new URL(API_BASE_URL);
    parsedReq.searchParams.forEach((value, key) => {
      if (key === 'target' || key === 'callback' || key === 's' || key === 'nocache') return;
      apiUrl.searchParams.set(key, value);
    });

    if (!apiUrl.searchParams.has('types')) {
      return res.status(400).send('Missing types');
    }

    try {
      upstream = await fetch(apiUrl.toString(), {
        headers: {
          'User-Agent': 'Meting/1.5.0',
          'Accept': 'application/json',
        },
      });
      responseText = await upstream.text();
      contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    } catch (err) {
      console.error('[Proxy API fetch]', err);
      return res.status(502).send('Upstream error');
    }
  }

  // ── 判断是否缓存（与 Cloudflare 版本逻辑完全一致） ──────────────────────────
  const isSearch = parsedReq.searchParams.get('types') === 'search';
  const isEmptyResult = responseText.trim() === '[]';
  const isError = responseText.includes('"error"') || responseText.includes('"status":0');

  let shouldCache = upstream.status === 200 && !isError && !bypassCache;
  if (isSearch && isEmptyResult) shouldCache = false;

  if (shouldCache) {
    cache.set(cacheKey, { body: responseText, contentType }, 300); // 缓存 5 分钟
    console.log(`[Cache PUT] Saved to cache: ${reqUrl}`);
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Cache-Status', 'MISS');
  res.setHeader('Access-Control-Expose-Headers', 'X-Cache-Status');
  res.setHeader('Cache-Control', shouldCache ? 'public, max-age=300' : 'no-store');

  return res.status(upstream.status).send(responseText);
}

module.exports = function createProxyRouter() {
  const router = Router();

  router.options('/', (req, res) => {
    res.status(204)
      .set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      })
      .end();
  });

  router.get('/', async (req, res) => {
    const target = req.query.target;

    if (target) {
      return proxyKuwoAudio(target, req, res);
    }

    // 重建完整 URL（含查询参数）给缓存 key 使用
    const fullUrl = `http://localhost${req.originalUrl}`;
    return proxyApiRequest(fullUrl, req, res);
  });

  return router;
};
