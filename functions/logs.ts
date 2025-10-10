import { Env } from "./lib/logging";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function createCorsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Cache-Control": "no-store",
  };
}

function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(),
  });
}

type QueryParam = string | null;

function parseLimit(value: QueryParam): number {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function parseOffset(value: QueryParam): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function parseStatus(value: QueryParam): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function isIsoDate(value: QueryParam): value is string {
  if (!value) return false;
  return !Number.isNaN(Date.parse(value));
}

interface ProxyLogRow {
  id: number;
  source: string;
  request_method: string;
  request_url: string;
  target_url: string | null;
  request_body: string | null;
  response_status: number;
  response_body: string | null;
  duration_ms: number | null;
  created_at: string;
}

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: createCorsHeaders(),
    });
  }

  if (!env.SOLARA_DB || typeof (env.SOLARA_DB as { prepare?: unknown }).prepare !== "function") {
    const body = {
      error: "D1 database binding SOLARA_DB is not configured.",
      hint:
        "请在 Cloudflare Pages → Settings → Functions → D1 Databases 中添加名为 SOLARA_DB 的 D1 绑定，并重新部署当前环境。不要在 Environment Variables 中创建字符串变量。",
    };
    return new Response(JSON.stringify(body), {
      status: 500,
      headers: {
        ...createCorsHeaders(),
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  const url = new URL(request.url);
  const { searchParams } = url;
  const limit = parseLimit(searchParams.get("limit"));
  const offset = parseOffset(searchParams.get("offset"));
  const status = parseStatus(searchParams.get("status"));
  const source = searchParams.get("source");
  const query = searchParams.get("q");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (source) {
    conditions.push("source = ?");
    bindings.push(source);
  }

  if (status !== null) {
    conditions.push("response_status = ?");
    bindings.push(status);
  }

  if (isIsoDate(from)) {
    conditions.push("created_at >= ?");
    bindings.push(new Date(from).toISOString());
  }

  if (isIsoDate(to)) {
    conditions.push("created_at <= ?");
    bindings.push(new Date(to).toISOString());
  }

  if (query) {
    conditions.push("(request_url LIKE ? OR request_body LIKE ? OR response_body LIKE ?)");
    const like = `%${query}%`;
    bindings.push(like, like, like);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const baseSql = `SELECT id, source, request_method, request_url, target_url, request_body, response_status, response_body, duration_ms, created_at FROM proxy_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  const statement = env.SOLARA_DB.prepare(baseSql).bind(...bindings, limit, offset);
  const results = await statement.all<ProxyLogRow>();
  const rows = results?.results ?? [];

  const responseBody = JSON.stringify({
    data: rows,
    pagination: {
      limit,
      offset,
      count: rows.length,
      hasMore: rows.length === limit,
    },
    filters: {
      source: source ?? null,
      status,
      query: query ?? null,
      from: isIsoDate(from) ? new Date(from).toISOString() : null,
      to: isIsoDate(to) ? new Date(to).toISOString() : null,
    },
  });

  return new Response(responseBody, {
    headers: {
      ...createCorsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
