// @ts-nocheck
// 定义上游API的基础URL和酷我音乐的主机名正则
const API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$/i;
// 定义安全的响应头白名单
const SAFE_RESPONSE_HEADERS = ["content-type", "cache-control", "accept-ranges", "content-length", "content-range", "etag", "last-modified", "expires"];

// --- 新增工具函数：获取歌曲的唯一键 ---
// 根据歌曲信息生成一个唯一的字符串键，用于KV缓存。格式为 "来源:ID"。
function getSongKey(song) {
  if (!song || !song.id || !song.source) {
    return null;
  }
  return `${song.source}:${song.id}`;
}

// --- 新增核心功能：在后台验证歌曲有效性 ---
// 这个函数会在后台运行，不会阻塞对用户的响应。
// 它会遍历歌曲列表，验证每首歌是否能获取到播放链接，并将结果存入KV。
async function validateSongsInBackground(songs, kv) {
  if (!Array.isArray(songs) || songs.length === 0 || !kv) {
    return;
  }

  // 创建一个包含所有验证任务的Promise数组
  const validationPromises = songs.map(song => {
    const key = getSongKey(song);
    if (!key) {
      return Promise.resolve({ key: null, status: 'invalid' });
    }
    // 使用最低音质(128)进行快速验证
    const validationUrl = `${API_BASE_URL}?types=url&id=${song.id}&source=${song.source}&br=128`;

    return fetch(validationUrl)
      .then(res => res.json())
      .then(data => ({
        key,
        // 如果能获取到有效的url，则歌曲有效
        status: data && data.url ? 'valid' : 'invalid'
      }))
      .catch(() => ({
        key,
        status: 'invalid'
      }));
  });

  try {
    // 等待所有验证完成
    const results = await Promise.allSettled(validationPromises);

    // 遍历验证结果，并将状态写入KV缓存
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.key) {
        const { key, status } = result.value;
        // 将验证状态存入KV，有效期为24小时 (86400秒)
        await kv.put(key, status, { expirationTtl: 86400 });
      }
    }
    console.log(`后台歌曲状态验证完成，处理了 ${songs.length} 首歌曲。`);
  } catch (error) {
    console.error('后台歌曲验证任务失败:', error);
  }
}


// 创建带有CORS头的响应头对象
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

// 代理上游API请求
async function proxyApiRequest(url: URL, request: Request, context: any): Promise<Response> { // <-- 修改点：增加 context 参数
  const apiUrl = new URL(API_BASE_URL);
  url.searchParams.forEach((value, key) => {
    if (key === "target" || key === "callback") {
      return;
    }
    apiUrl.searchParams.set(key, value);
  });

  const requestType = apiUrl.searchParams.get("types");

  if (!requestType) {
    return new Response("Missing types", { status: 400 });
  }

  const upstream = await fetch(apiUrl.toString(), {
    headers: {
      "User-Agent": request.headers.get("User-Agent") ?? "Mozilla/5.0",
      "Accept": "application/json",
    },
  });

  const headers = createCorsHeaders(upstream.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  // --- 修改点：对搜索请求进行特殊处理 ---
  if (requestType === "search" && upstream.ok) {
    // 克隆响应，因为body只能被读取一次
    const upstreamClone = upstream.clone();
    try {
      // 立即将原始搜索结果返回给前端
      const originalSongs = await upstreamClone.json();

      // 使用 waitUntil 启动后台验证任务，不阻塞当前响应
      if (context.env.SONG_STATUS_KV) {
        context.waitUntil(validateSongsInBackground(originalSongs, context.env.SONG_STATUS_KV));
      } else {
        console.warn('KV 命名空间 "SONG_STATUS_KV" 未绑定，无法进行后台歌曲验证。');
      }

      // 将原始数据（可能包含无效歌曲）返回给前端
      return new Response(JSON.stringify(originalSongs), {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });

    } catch (e) {
      // 如果解析失败，则返回原始响应体
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    }
  }
  // --- 修改结束 ---

  // 对于非搜索请求，保持原有逻辑
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

// 主处理函数
export async function onRequest(context: any): Promise<Response> { // <-- 修改点：直接使用 context
  const { request } = context; // 从 context 中解构 request

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

  return proxyApiRequest(url, request, context); // <-- 修改点：传递 context
}
