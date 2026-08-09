/**
 * Solara 独立 Node.js 服务器
 * 替代 wrangler pages dev，完全不依赖 Cloudflare/Wrangler
 *
 * 路由结构（与 Cloudflare Pages Functions 完全一致）：
 *   GET  /              → index.html（需要认证）
 *   GET  /login         → login.html（公开）
 *   POST /api/login     → 登录
 *   GET/POST/DELETE /api/storage → 数据持久化（SQLite）
 *   GET  /proxy         → 音乐 API 代理（带内存缓存）
 *   GET  /palette       → 专辑封面调色板分析（带内存缓存）
 *   *                   → 静态文件（css/, js/, favicon 等）
 */

'use strict';

const express     = require('express');
const cookieParser = require('cookie-parser');
const path        = require('path');

const createAuthMiddleware  = require('./routes/auth');
const createLoginRouter     = require('./routes/login');
const createStorageRouter   = require('./routes/storage');
const createProxyRouter     = require('./routes/proxy');
const createPaletteRouter   = require('./routes/palette');
const createDownloadRouter  = require('./routes/download');
const downloadQueueRoutes   = require('./routes/download_queue_routes');
const createQueueHealthRouter = require('./routes/queue_health');
const createDownloadEventsRouter = require('./routes/download_events');

const PORT     = parseInt(process.env.PORT  || '8787', 10);
const HOST     = process.env.HOST || '0.0.0.0';
const PASSWORD = process.env.PASSWORD || null;
const ROOT_DIR = path.join(__dirname, '..');  // 项目根目录（index.html, css/, js/ 等）

const app = express();

// ─── 基础中间件 ───────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// ─── 静态文件服务（css/, js/, favicon.png 等）──────────────────────────────────
// 放在认证中间件之前，确保样式/脚本等静态资源总是可访问并避免被认证重定向影响
app.use(express.static(ROOT_DIR, {
  index: false,          // 不自动提供 index.html（由认证中间件控制）
  dotfiles: 'ignore',    // 拒绝访问 .env, .git 等隐藏文件
}));

// ──�� 公开路由（在认证中间件之前）──────────────────────────────────────────────

// POST /api/login（登录接口，不需要认证）
app.use('/api/login', createLoginRouter(PASSWORD));

// GET /login → 提供 login.html
app.get('/login', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'login.html'));
});

// ─── 认证中间件（公开路径会被自动跳过，见 routes/auth.js）───────────────────
app.use(createAuthMiddleware(PASSWORD));

// ─── 受保护的 API 路由 ─────────────────────────────────────────────────────
app.use('/api/storage', createStorageRouter());
app.use('/proxy',       createProxyRouter());
app.use('/palette',     createPaletteRouter());
// Mount download router (handles POST / and GET /status/:id)
app.use('/api/download', createDownloadRouter());
// queue health (GET /api/queue/health)
app.use('/api/queue', createQueueHealthRouter());
// download events (SSE) mounted under /api/download/events
app.use('/api/download', createDownloadEventsRouter(require('./queue').downloadQueue));
// Also mount the queue helper routes (list / cancel) so frontend can call /api/download/list etc.
app.use('/api/download', downloadQueueRoutes);

// ─── 主页（index.html，需要已通过认证中间件）──────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// ─── 404 兜底 ─────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).send('Not Found');
});

// ─── 启动 ──────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  🌟 Solara Standalone Server');
  console.log('  ─────────────────────────────────────');
  console.log(`  Ready on http://${HOST}:${PORT}`);
  console.log(`  Password: ${PASSWORD ? '✓ configured' : '✗ not set (open access)'}`);
  console.log('  ─────────────────────────────────────');
  console.log('');
});
