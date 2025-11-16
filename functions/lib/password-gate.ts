import { getPasswordFromEnv } from "./get-password";

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

export function maybeRedirectToLogin(context: {
  request: Request;
  env: Record<string, unknown>;
}): Response | null {
  const password = getPasswordFromEnv(context?.env);
  if (typeof password !== "string") {
    return null;
  }

  const url = new URL(context.request.url);
  if (isPublicPath(url.pathname)) {
    return null;
  }

  const cookieHeader = context.request.headers.get("Cookie") || "";
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
    return null;
  }

  const loginUrl = new URL("/login", url);
  return Response.redirect(loginUrl.toString(), 302);
}
