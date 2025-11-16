export function getPasswordFromEnv(env: Record<string, unknown>): string | undefined {
  const passwordFromContext = extractPassword(env?.PASSWORD);
  if (passwordFromContext) {
    return passwordFromContext;
  }

  if (typeof process !== "undefined" && process.env) {
    const passwordFromProcess = extractPassword(process.env.PASSWORD);
    if (passwordFromProcess) {
      return passwordFromProcess;
    }
  }

  return undefined;
}

function extractPassword(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
