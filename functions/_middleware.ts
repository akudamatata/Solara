const PUBLIC_PATH_PATTERNS = [/^\/login(?:\/|$)/, /^\/api\/login(?:\/|$)/];
const PUBLIC_FILE_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".png",
  ".svg",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".txt",
  ".map",
  ".json",
  ".woff",
  ".woff2",
]);

function hasPublicExtension(pathname: string): boolean {
  const lastDotIndex = pathname.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return false;
  }
  const extension = pathname.slice(lastDotIndex).toLowerCase();
  return PUBLIC_FILE_EXTENSIONS.has(extension);
}

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname)) ||
    hasPublicExtension(pathname)
  );
}

async function authMiddleware(context: any) {
  const { request, env } = context;
  const password = env.PASSWORD;

  if (typeof password !== "string") {
    return context.next();
  }

  const url = new URL(request.url);
  // 本地回环发起的内部请求（如 Docker 容器内 Node.js 转发给 Wrangler）直接放行
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    return context.next();
  }

  const pathname = url.pathname;
  if (isPublicPath(pathname)) {
    return context.next();
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) {
      cookies[key] = value;
    }
  });

  if (cookies.auth && cookies.auth === btoa(password)) {
    return context.next();
  }

  // API 路由未授权时返回 401 JSON，杜绝返回 HTML 重定向导致前端 JSON 解析崩溃
  if (pathname.startsWith("/proxy") || pathname.startsWith("/api/") || pathname.startsWith("/palette")) {
    return new Response(JSON.stringify({ error: "Unauthorized", message: "Login required" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const loginUrl = new URL("/login", url);
  return Response.redirect(loginUrl.toString(), 302);
}

async function i18nMiddleware(context: any) {
  const { env, next } = context;
  const response = await next();
  const language = env.language || env.LANGUAGE;
  
  if (language === "ENG" && response.headers.get("content-type")?.includes("text/html")) {
    return new HTMLRewriter().on("head", {
      element(element: any) {
        element.prepend(`<script>window.SITE_LANGUAGE = "ENG";</script>`, { html: true });
      }
    }).transform(response);
  }
  
  return response;
}

export const onRequest = [authMiddleware, i18nMiddleware];
