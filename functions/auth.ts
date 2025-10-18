const COOKIE_NAME = 'solara_auth';
const COOKIE_MAX_AGE = 60 * 60 * 12; // 12 hours

interface Env {
  ACCESS_PASSWORD?: string;
}

type JsonBody = {
  passwordRequired: boolean;
  authenticated: boolean;
  error?: string;
};

function jsonResponse(body: JsonBody, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) {
    return cookies;
  }
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [rawKey, ...rest] = pair.trim().split('=');
    if (!rawKey) continue;
    cookies[decodeURIComponent(rawKey)] = decodeURIComponent(rest.join('=') ?? '');
  }
  return cookies;
}

async function createToken(secret: string): Promise<string> {
  const data = new TextEncoder().encode(`solara:${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((value) => value.toString(16).padStart(2, '0')).join('');
}

function buildCookie(value: string, url: URL, options?: { expires?: Date; maxAge?: number }): string {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    `Max-Age=${options?.maxAge ?? COOKIE_MAX_AGE}`,
    'SameSite=Strict',
    'HttpOnly',
  ];
  if (url.protocol === 'https:') {
    parts.push('Secure');
  }
  if (options?.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  return parts.join('; ');
}

function clearCookie(url: URL): string {
  const pastDate = new Date(0);
  return buildCookie('', url, { expires: pastDate, maxAge: 0 });
}

export async function onRequest({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const password = env.ACCESS_PASSWORD;
  const url = new URL(request.url);

  if (!password) {
    return jsonResponse(
      {
        passwordRequired: false,
        authenticated: true,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const expectedToken = await createToken(password);
  const cookies = parseCookies(request.headers.get('Cookie'));
  const existingToken = cookies[COOKIE_NAME];
  const isAuthenticated = existingToken === expectedToken;

  if (request.method === 'GET') {
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });

    if (!isAuthenticated && existingToken) {
      headers.append('Set-Cookie', clearCookie(url));
    }

    return jsonResponse(
      {
        passwordRequired: true,
        authenticated: isAuthenticated,
      },
      { headers },
    );
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      {
        passwordRequired: true,
        authenticated: false,
        error: '不支持的请求方法。',
      },
      { status: 405 },
    );
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch (error) {
    console.error('[Solara] Failed to parse auth payload.', error);
    return jsonResponse(
      {
        passwordRequired: true,
        authenticated: false,
        error: '请求格式不正确。',
      },
      { status: 400 },
    );
  }

  const providedPassword =
    typeof (payload as { password?: unknown }).password === 'string'
      ? ((payload as { password: string }).password || '').trim()
      : '';

  if (!providedPassword) {
    return jsonResponse(
      {
        passwordRequired: true,
        authenticated: false,
        error: '请输入访问密码。',
      },
      { status: 400 },
    );
  }

  if (providedPassword !== password) {
    return jsonResponse(
      {
        passwordRequired: true,
        authenticated: false,
        error: '密码不正确。',
      },
      { status: 401 },
    );
  }

  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Set-Cookie': buildCookie(expectedToken, url),
  });

  return jsonResponse(
    {
      passwordRequired: true,
      authenticated: true,
    },
    { headers },
  );
}
