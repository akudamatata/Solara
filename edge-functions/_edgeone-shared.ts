import { maybeRedirectToLogin } from "../functions/lib/password-gate";

type EdgeContext = {
  request: Request;
  env?: Record<string, any> & {
    ASSETS?: { fetch: (request: Request) => Promise<Response> };
  };
  next?: () => Promise<Response>;
};

export async function handleEdgeOneRequest(context: EdgeContext) {
  const redirectResponse = maybeRedirectToLogin(context as any);
  if (redirectResponse) {
    return redirectResponse;
  }
  return continueRequest(context);
}

async function continueRequest(context: EdgeContext): Promise<Response> {
  if (typeof context.next === "function") {
    return context.next();
  }

  const assetNamespace = context.env?.ASSETS;
  if (assetNamespace && typeof assetNamespace.fetch === "function") {
    return assetNamespace.fetch(context.request);
  }

  return fetch(context.request);
}
