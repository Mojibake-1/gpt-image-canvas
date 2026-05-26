import type { InternalSessionResponse } from "./InternalLoginScreen";

export function loginEmailForSession(session: InternalSessionResponse): string {
  if (!session.authenticated || !session.email || session.isGuest) {
    return "";
  }

  return session.email;
}

export function resetLoginEmail(_currentEmail: string): string {
  return "";
}
