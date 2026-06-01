import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createApiError } from "./features/canvas/api-errors";
import {
  apiFetch,
  clearEmbeddedSessionToken,
  ensureEmbeddedStorageAccess,
  rememberEmbeddedSessionToken
} from "./features/canvas/embed-session";
import { InternalLoginScreen, type InternalSessionResponse } from "./features/canvas/InternalLoginScreen";
import { loginEmailForSession, resetLoginEmail } from "./features/canvas/login-email-state";
import { useI18n } from "./i18n";

type SessionState = "checking" | "anonymous" | "authenticated";

const LazyCanvasApp = lazy(async () => {
  const [{ loadCanvasStyles }, module] = await Promise.all([
    import("./features/canvas/load-canvas-styles"),
    import("./features/canvas/CanvasApp")
  ]);
  await loadCanvasStyles();
  return { default: module.App };
});

function notifyMuxingWorkbenchReady(): void {
  if (window.parent === window) {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      window.parent.postMessage(
        {
          source: "muxing-tool",
          type: "muxing:tool-ready",
          tool: "image-canvas"
        },
        "*"
      );
    });
  });
}

function useMuxingWorkbenchReady(enabled: boolean): void {
  const didNotifyRef = useRef(false);

  useEffect(() => {
    if (!enabled || didNotifyRef.current) {
      return;
    }

    didNotifyRef.current = true;
    notifyMuxingWorkbenchReady();
  }, [enabled]);
}

function CanvasReadySignal() {
  useMuxingWorkbenchReady(true);
  return null;
}

export function App() {
  const { locale, t } = useI18n();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useMuxingWorkbenchReady(sessionState === "anonymous");

  const applySession = useCallback((session: InternalSessionResponse): boolean => {
    const hasSession = Boolean(session.authenticated && session.email);
    if (hasSession) {
      rememberEmbeddedSessionToken(session);
    } else {
      clearEmbeddedSessionToken();
    }

    setLoginEmail(loginEmailForSession(session));
    return hasSession;
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInternalSession(): Promise<void> {
      setSessionState("checking");
      setLoginError("");

      try {
        const response = await apiFetch("/api/internal-session", { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Session check failed with ${response.status}`);
        }

        const session = (await response.json()) as InternalSessionResponse;
        if (controller.signal.aborted) {
          return;
        }

        setSessionState(applySession(session) ? "authenticated" : "anonymous");
      } catch {
        if (!controller.signal.aborted) {
          clearEmbeddedSessionToken();
          setLoginEmail((current) => resetLoginEmail(current));
          setSessionState("anonymous");
          setLoginError("无法检查登录状态，请稍后重试。");
        }
      }
    }

    void loadInternalSession();

    return () => {
      controller.abort();
    };
  }, [applySession]);

  const loginInternalUser = useCallback(async (): Promise<void> => {
    const email = loginEmail.trim().toLowerCase();
    setLoginError("");

    if (!email.endsWith("@muxing.cfd")) {
      setLoginError("请输入 @muxing.cfd 邮箱地址。");
      return;
    }

    setIsSubmitting(true);
    try {
      await ensureEmbeddedStorageAccess();
      const response = await apiFetch("/api/internal-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        throw await createApiError(response, locale, t);
      }

      const session = (await response.json()) as InternalSessionResponse;
      if (!session.authenticated || !session.email) {
        throw new Error("登录状态未生效，请重试。");
      }

      applySession(session);
      setLoginError("");
      setSessionState("authenticated");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }, [applySession, locale, loginEmail, t]);

  const loginGuestUser = useCallback(async (): Promise<void> => {
    setLoginError("");
    setIsSubmitting(true);
    try {
      await ensureEmbeddedStorageAccess();
      const response = await apiFetch("/api/guest-login", {
        method: "POST"
      });

      if (!response.ok) {
        throw await createApiError(response, locale, t);
      }

      const session = (await response.json()) as InternalSessionResponse;
      if (!session.authenticated || !session.email) {
        throw new Error("Guest 会话未创建成功，请重试。");
      }

      applySession(session);
      setLoginError("");
      setSessionState("authenticated");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Guest 登录失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }, [applySession, locale, t]);

  if (sessionState === "authenticated") {
    return (
      <Suspense
        fallback={
          <InternalLoginScreen
            email={loginEmail}
            error=""
            isLoading={true}
            isSubmitting={true}
            onEmailChange={setLoginEmail}
            onGuestSubmit={() => undefined}
            onSubmit={() => undefined}
          />
        }
      >
        <LazyCanvasApp />
        <CanvasReadySignal />
      </Suspense>
    );
  }

  return (
    <InternalLoginScreen
      email={loginEmail}
      error={loginError}
      isLoading={sessionState === "checking"}
      isSubmitting={isSubmitting}
      onEmailChange={setLoginEmail}
      onGuestSubmit={loginGuestUser}
      onSubmit={loginInternalUser}
    />
  );
}
