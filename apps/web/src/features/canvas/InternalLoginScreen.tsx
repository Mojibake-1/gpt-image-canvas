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
      <section className="internal-login-card" aria-labelledby="internal-login-heading">
        {/* 四角制图 corner marks + 极细蛛网线：《蜘蛛在梦中织梦》的克制表达 */}
        <span className="internal-login-corner internal-login-corner--tl" aria-hidden="true" />
        <span className="internal-login-corner internal-login-corner--tr" aria-hidden="true" />
        <span className="internal-login-corner internal-login-corner--bl" aria-hidden="true" />
        <span className="internal-login-corner internal-login-corner--br" aria-hidden="true" />
        <svg className="internal-login-web" viewBox="0 0 120 120" fill="none" aria-hidden="true">
          <path d="M60 8 L60 112 M8 60 L112 60 M22 22 L98 98 M98 22 L22 98" />
          <path d="M60 30 A30 30 0 0 1 90 60 A30 30 0 0 1 60 90 A30 30 0 0 1 30 60 A30 30 0 0 1 60 30 Z" />
          <path d="M60 44 A16 16 0 0 1 76 60 A16 16 0 0 1 60 76 A16 16 0 0 1 44 60 A16 16 0 0 1 60 44 Z" />
        </svg>

        <header className="internal-login-head">
          <p className="internal-login-eyebrow">MUXING · ATELIER</p>
          <h1 className="internal-login-title" id="internal-login-heading">
            沐星画布
          </h1>
          <p className="internal-login-subtitle">AI 图像画布 · 摊开稿纸，开始创作</p>
        </header>

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
          <button className="internal-login-guest" disabled={isLoading || isSubmitting} type="button" onClick={onGuestSubmit}>
            {isLoading || isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UserRound className="size-4" aria-hidden="true" />}
            Guest 访客模式
          </button>
        </form>
      </section>
    </main>
  );
}
