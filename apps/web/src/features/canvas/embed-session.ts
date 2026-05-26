type StorageAccessHooks = {
  hasStorageAccess?: () => Promise<boolean>;
  href?: string;
  requestStorageAccess?: () => Promise<unknown>;
};

type StorageAccessDocument = Document & {
  hasStorageAccess?: () => Promise<boolean>;
  requestStorageAccess?: () => Promise<unknown>;
};

type SessionTokenResponse = {
  sessionToken?: string | null;
};

const EMBEDDED_SESSION_TOKEN_KEY = "muxing_canvas_session_token";

export function isMuxingEmbedded(href: string): boolean {
  try {
    return new URL(href).searchParams.get("muxing-embed") === "1";
  } catch {
    return false;
  }
}

export async function ensureEmbeddedStorageAccess(hooks: StorageAccessHooks = {}): Promise<void> {
  const href = hooks.href ?? globalThis.window?.location?.href ?? "";
  if (!isMuxingEmbedded(href)) {
    return;
  }

  const storageDocument = typeof document === "undefined" ? undefined : (document as StorageAccessDocument);
  const hasStorageAccess = hooks.hasStorageAccess ?? storageDocument?.hasStorageAccess?.bind(storageDocument);
  const requestStorageAccess = hooks.requestStorageAccess ?? storageDocument?.requestStorageAccess?.bind(storageDocument);

  if (typeof requestStorageAccess !== "function") {
    return;
  }

  if (typeof hasStorageAccess === "function") {
    try {
      if (await hasStorageAccess()) {
        return;
      }
    } catch {
      // Fall through and attempt the explicit storage access request once.
    }
  }

  try {
    await requestStorageAccess();
  } catch {
    // Ignore denials and continue with the normal auth request path.
  }
}

export function rememberEmbeddedSessionToken(session: SessionTokenResponse): void {
  const token = typeof session.sessionToken === "string" ? session.sessionToken.trim() : "";
  if (!token) {
    return;
  }

  try {
    globalThis.sessionStorage?.setItem(EMBEDDED_SESSION_TOKEN_KEY, token);
  } catch {
    // Some embedded browsers disable sessionStorage; cookie auth remains the fallback.
  }
}

export function clearEmbeddedSessionToken(): void {
  try {
    globalThis.sessionStorage?.removeItem(EMBEDDED_SESSION_TOKEN_KEY);
  } catch {
    // Ignore storage denials.
  }
}

export function readEmbeddedSessionToken(): string | undefined {
  try {
    const token = globalThis.sessionStorage?.getItem(EMBEDDED_SESSION_TOKEN_KEY)?.trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

export function withEmbeddedSessionToken(rawUrl: string, token = readEmbeddedSessionToken()): string {
  if (!token) {
    return rawUrl;
  }

  try {
    const base = globalThis.window?.location?.href ?? "http://localhost/";
    const url = new URL(rawUrl, base);
    if (!url.pathname.startsWith("/api/")) {
      return rawUrl;
    }

    url.searchParams.set("muxing_session", token);
    return isAbsoluteUrl(rawUrl) ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return rawUrl;
  }
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = readEmbeddedSessionToken();
  if (!token || !isApiRequest(input)) {
    return fetch(input, init);
  }

  const headers = new Headers(init.headers ?? requestHeaders(input));
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers
  });
}

function isApiRequest(input: RequestInfo | URL): boolean {
  try {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const base = globalThis.window?.location?.href ?? "http://localhost/";
    return new URL(rawUrl, base).pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function requestHeaders(input: RequestInfo | URL): HeadersInit | undefined {
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.headers;
  }

  return undefined;
}

function isAbsoluteUrl(rawUrl: string): boolean {
  return /^[a-z][a-z\d+\-.]*:/iu.test(rawUrl);
}
