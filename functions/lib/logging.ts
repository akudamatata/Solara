const MAX_BODY_LENGTH = 8192;

export type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

export type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  run<T = unknown>(): Promise<T>;
  all<T = unknown>(): Promise<{ results: T[] } | null>;
};

export interface Env {
  SOLARA_DB?: D1Database;
}

export interface ProxyLogEntry {
  source: "api" | "kuwo" | string;
  requestMethod: string;
  requestUrl: string;
  targetUrl?: string | null;
  requestBody?: string | null;
  responseStatus: number;
  responseBody?: string | null;
  durationMs?: number;
  createdAt?: string;
}

export function truncateBody(body: string | null | undefined): string | null {
  if (body == null) {
    return body ?? null;
  }
  if (body.length <= MAX_BODY_LENGTH) {
    return body;
  }
  return `${body.slice(0, MAX_BODY_LENGTH)}...\n[truncated ${body.length - MAX_BODY_LENGTH} bytes]`;
}

export function isTextLike(contentType: string | null): boolean {
  if (!contentType) return false;
  const lowered = contentType.toLowerCase();
  return (
    lowered.startsWith("text/") ||
    lowered.includes("json") ||
    lowered.includes("xml") ||
    lowered.includes("javascript") ||
    lowered.includes("yaml")
  );
}

export async function readRequestBodySnippet(request: Request): Promise<string | null> {
  if (request.method === "GET" || request.method === "HEAD") {
    return null;
  }
  try {
    const contentType = request.headers.get("content-type");
    if (isTextLike(contentType)) {
      const text = await request.text();
      return truncateBody(text ?? "");
    }
    const buffer = await request.arrayBuffer();
    return `[binary body ${buffer.byteLength} bytes]`;
  } catch (error) {
    console.error("Failed to read request body", error);
    return null;
  }
}

export async function readResponseBodySnippet(response: Response): Promise<string | null> {
  try {
    const contentType = response.headers.get("content-type");
    if (isTextLike(contentType)) {
      const text = await response.text();
      return truncateBody(text ?? "");
    }
    const length = response.headers.get("content-length");
    return length ? `[binary body ${length} bytes]` : "[binary body]";
  } catch (error) {
    console.error("Failed to read response body", error);
    return null;
  }
}

export async function recordProxyLog(env: Env | undefined, entry: ProxyLogEntry): Promise<void> {
  if (!env?.SOLARA_DB) {
    return;
  }
  try {
    const statement = env.SOLARA_DB.prepare(
      `INSERT INTO proxy_logs (
        source,
        request_method,
        request_url,
        target_url,
        request_body,
        response_status,
        response_body,
        duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    await statement
      .bind(
        entry.source,
        entry.requestMethod,
        entry.requestUrl,
        entry.targetUrl ?? null,
        entry.requestBody ?? null,
        entry.responseStatus,
        entry.responseBody ?? null,
        entry.durationMs ?? null
      )
      .run();
  } catch (error) {
    console.error("Failed to record proxy log", error);
  }
}
