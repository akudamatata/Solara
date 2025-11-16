import { maybeRedirectToLogin } from "./lib/password-gate";

export async function onRequest(context: any) {
  const redirectResponse = maybeRedirectToLogin(context);
  if (redirectResponse) {
    return redirectResponse;
  }
  return context.next();
}
