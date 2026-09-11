/**
 * 认证中间件 —— 移植自 functions/_middleware.ts（authMiddleware 部分）
 *
 * 逻辑完全一致：
 *   - 公开路径（/login, /api/login, 静态资源文件）直接放行
 *   - 其余路径检查 cookie auth === btoa(PASSWORD)
 *   - 验证失败则重定向到 /login
 */

const PUBLIC_PATH_PATTERNS = [
  /^\/login(?:\/|$)/,
  /^\/api\/login(?:\/|$)/,
];

const PUBLIC_FILE_EXTENSIONS = new Set([
  '.css', '.js', '.png', '.svg', '.jpg', '.jpeg',
  '.gif', '.webp', '.ico', '.txt', '.map', '.json',
  '.woff', '.woff2',
]);

function hasPublicExtension(pathname) {
  const lastDotIndex = pathname.lastIndexOf('.');
  if (lastDotIndex === -1) return false;
  return PUBLIC_FILE_EXTENSIONS.has(pathname.slice(lastDotIndex).toLowerCase());
}

function isPublicPath(pathname) {
  return (
    PUBLIC_PATH_PATTERNS.some(pattern => pattern.test(pathname)) ||
    hasPublicExtension(pathname)
  );
}

/**
 * @param {string|null} password - 来自环境变量 PASSWORD
 * @returns {import('express').RequestHandler}
 */
module.exports = function createAuthMiddleware(password) {
  return (req, res, next) => {
    // 未配置密码时，全部放行
    if (typeof password !== 'string') return next();

    // 公开路径直接放行
    if (isPublicPath(req.path)) return next();

    // 验证 cookie（与 Cloudflare 版本完全一致：cookie auth = btoa(password)）
    const cookieAuth = req.cookies && req.cookies.auth;
    const expected = Buffer.from(password).toString('base64'); // 等价于 btoa(password)
    if (cookieAuth && cookieAuth === expected) return next();

    // 验证失败：API 请求返回 401 JSON，杜绝返回 HTML 导致前端 JSON 解析崩溃
    if (req.path.startsWith('/proxy') || req.path.startsWith('/api/') || req.path.startsWith('/palette')) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Login required' });
    }

    // 页面请求重定向到登录页
    return res.redirect(302, '/login');
  };
};
