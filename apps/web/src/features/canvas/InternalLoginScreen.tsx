import { Loader2, ShieldCheck, UserRound } from "lucide-react";

export interface InternalSessionResponse {
  authenticated: boolean;
  email?: string;
  isGuest?: boolean;
  sessionToken?: string;
}

export function InternalLoginScreen({
  email,
  error,
  isLoading,
  isSubmitting,
  onEmailChange,
  onSubmit,
  onGuestSubmit
}: {
  email: string;
  error: string;
  isLoading: boolean;
  isSubmitting: boolean;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
  onGuestSubmit: () => void;
}) {
  return (
    <main className="app-root internal-login-screen">
      <section className="internal-login-card">
        <div>
          <h1 className="internal-login-title">AI 创作画布</h1>
        </div>

        <form
          className="internal-login-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="internal-login-field">
            <span>邮箱</span>
            <input
              autoComplete="email"
              autoFocus
              disabled={isLoading || isSubmitting}
              inputMode="email"
              placeholder="name@muxing.cfd"
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
            />
          </label>

          {error ? <p className="internal-login-error" role="alert">{error}</p> : null}

          <button className="internal-login-submit" disabled={isLoading || isSubmitting} type="submit">
            {isLoading || isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
            进入画布
          </button>
          <button className="secondary-action h-11 w-full" disabled={isLoading || isSubmitting} type="button" onClick={onGuestSubmit}>
            {isLoading || isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserRound className="size-4" aria-hidden="true" />}
            Guest 访客模式
          </button>
        </form>
      </section>
    </main>
  );
}
