const API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$/i;
const SAFE_RESPONSE_HEADERS = ["content-type", "cache-control", "accept-ranges", "content-length", "content-range", "etag", "last-modified", "expires"];

function createCorsHeaders(init?: Headers): Headers {
  const headers = new Headers();
  if (init) {
    for (const [key, value] of init.entries()) {
      if (SAFE_RESPONSE_HEADERS.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }
  }
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "no-store");
  }
  headers.set("Access-Control-Allow-Origin", "*");
  return headers;
}

function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function isAllowedKuwoHost(hostname: string): boolean {
  if (!hostname) return false;
  return KUWO_HOST_PATTERN.test(hostname);
}

function normalizeKuwoUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (!isAllowedKuwoHost(parsed.hostname)) {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.protocol = "http:";
    return parsed;
  } catch {
    return null;
  }
}

async function proxyKuwoAudio(targetUrl: string, request: Request): Promise<Response> {
  const normalized = normalizeKuwoUrl(targetUrl);
  if (!normalized) {
    return new Response("Invalid target", { status: 400 });
  }

  const init: RequestInit = {
    method: request.method,
    headers: {
      "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
      "Referer": "https://www.kuwo.cn/",
    },
  };

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) {
    (init.headers as Record<string, string>)["Range"] = rangeHeader;
  }

  const upstream = await fetch(normalized.toString(), init);
  const headers = createCorsHeaders(upstream.headers);
  if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "public, max-age=3600");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function proxyApiRequest(url: URL, request: Request, waitUntil?: (promise: Promise<any>) => void): Promise<Response> {
  const cache = caches.default;
  
  // 构建缓存 Key（完整 URL 和原始方法，但过滤掉每次随机的防缓存签名 s）
  const cacheUrl = new URL(url.toString());
  cacheUrl.searchParams.delete("s");
  
  const cacheKey = new Request(cacheUrl.toString(), {
    method: request.method,
    headers: request.headers
  });

  // 如果是 GET 请求，尝试命中缓存
  if (request.method === "GET") {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        console.log(`[Cache HIT] ${url.toString()}`);
        const response = new Response(cachedResponse.body, cachedResponse);
        response.headers.set("X-Cache-Status", "HIT");
        response.headers.set("Access-Control-Expose-Headers", "X-Cache-Status");
        return response;
      }
    } catch (err) {
      console.warn(`[Cache ERROR] ${url.toString()}`, err);
    }
  }

  console.log(`[Cache MISS] Fetching from upstream: ${url.toString()}`);

  const apiUrl = new URL(API_BASE_URL);
  url.searchParams.forEach((value, key) => {
    if (key === "target" || key === "callback" || key === "s") {
      return;
    }
    apiUrl.searchParams.set(key, value);
  });

  if (!apiUrl.searchParams.has("types")) {
    return new Response("Missing types", { status: 400 });
  }

  const upstream = await fetch(apiUrl.toString(), {
    headers: {
      "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
      "Accept": "application/json",
    },
  });

  const responseText = await upstream.text();
  const headers = createCorsHeaders(upstream.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  headers.set("X-Cache-Status", "MISS");
  headers.set("Access-Control-Expose-Headers", "X-Cache-Status");

  // 判断是否应该缓存：必须是 200 状态，且内容不能是空数组或包含错误标识
  const isSearch = url.searchParams.get("types") === "search";
  const isEmptyResult = responseText.trim() === "[]";
  const isError = responseText.includes('"error"') || responseText.includes('"status":0');
  
  let shouldCache = upstream.status === 200 && request.method === "GET" && !isError;
  
  // 如果是搜索请求且结果为空，通常是 API 繁忙或异常，不建议长缓存
  if (isSearch && isEmptyResult) {
    shouldCache = false;
  }

  if (shouldCache) {
    headers.set("Cache-Control", "public, s-maxage=300, max-age=300");
  } else {
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }

  const response = new Response(responseText, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });

  // 写入缓存（不阻塞主流程）
  if (shouldCache && waitUntil) {
    waitUntil(cache.put(cacheKey, response.clone()));
    console.log(`[Cache PUT] Saved to cache: ${url.toString()}`);
  }

  return response;
}

export async function onRequest({ request, waitUntil }: { request: Request, waitUntil: (promise: Promise<any>) => void }): Promise<Response> {
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const target = url.searchParams.get("target");

  if (target) {
    return proxyKuwoAudio(target, request);
  }

  return proxyApiRequest(url, request, waitUntil);
}
