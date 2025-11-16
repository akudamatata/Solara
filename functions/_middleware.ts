import { getPasswordFromEnv } from "./lib/get-password";

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

export async function onRequest(context: any) {
  const { request, env } = context;
  const password = getPasswordFromEnv(env);

  if (typeof password !== "string") {
    return context.next();
  }

  const url = new URL(request.url);
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

  const loginUrl = new URL("/login", url);
  return Response.redirect(loginUrl.toString(), 302);
}
