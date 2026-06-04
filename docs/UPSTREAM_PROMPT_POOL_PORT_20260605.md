# Upstream Prompt Pool — Dedicated Port — 2026-06-05

Branch: `codex/prompt-pool-port-20260605`
Base: `0a6679d` (`Replace upstream-sync doc with verified migration matrix`)
Upstream source refs (used as references, **not** cherry-picked):

| Commit | Subject |
|---|---|
| `6885edc` | feat: v0.4.0 add prompt pool |
| `c12237d` | feat: style update |
| `7e0d2f6` | update style |
| `6d0ce77` | chore: release v0.4.0 |

## Why this exists

The verified migration matrix (`docs/UPSTREAM_SYNC_20260604.md`) marked these four
commits **Blocked**: the user-facing feature was a ~488-line interleave into
`CanvasApp.tsx` (the host of the protected `shell-theme-bridge` / `embed-session` /
`InternalLoginScreen` contracts), and the favorites backend was global +
unauthenticated. Its own guidance was: *"scope it as a dedicated port that
re-implements the UI against the fork's shell + embed/theme contracts, not a
cherry-pick."* This run did exactly that.

## Outcome

All four commits are now **ported** as fork-native code. Nothing was cherry-picked or
merged; upstream files were read as references and re-implemented (or materialized
verbatim only where they are standalone and contract-neutral).

## What was built

### Backend (owner-scoped)

- **Shared types** — `packages/shared/src/prompt-pool.ts`, `prompt-favorites.ts`
  (verbatim from upstream; pure types) exported via the package barrel and re-exported
  through `apps/api/src/domain/contracts.ts`.
- **Prompt pool loader** — `apps/api/src/domain/prompt-pool/prompt-pool.ts`: read-only,
  file-backed (`prompts-all.json` + `summary.json`, nested `data/` layout accepted),
  mtime-cached, and **degrades to `{ available: false }` on missing/invalid data**
  instead of throwing to the client. The data directory resolves from
  `PROMPT_POOL_DIR` (`apps/api/src/infrastructure/runtime.ts`), defaulting to a
  **gitignored** `./prompt-pool-data`. A `promptPoolDirOverride` parameter makes the
  loader unit-testable.
- **Prompt favorites domain** — `apps/api/src/domain/prompt-favorites/prompt-favorites.ts`:
  ported from upstream but **owner-scoped throughout**. Every public function takes
  `ownerEmail` as its first argument, and every Drizzle `select`/`update`/`delete`
  filters by `eq(table.ownerEmail, ownerEmail)` (mirroring the gallery's
  owner-isolation pattern).
- **Routes** — `apps/api/src/server/routes/prompt-pool.ts` (`GET /api/pool`) and
  `apps/api/src/server/routes/prompt-favorites.ts` (`/api/prompt-favorites*`,
  `/api/prompt-favorite-groups*`). Every favorites handler derives the owner via
  `requireInternalUserEmail(c)` and threads it into the domain. Both are registered in
  `app.ts` **after** the internal-auth middleware (so they sit behind the session) and
  **before** the `/api/*` 404 + SPA fallback.
- **Schema / DB** — `prompt_favorite_groups` and `prompt_favorites` added to
  `schema.ts` (Drizzle) and `database.ts` (raw DDL). Both carry
  **`owner_email TEXT NOT NULL`**. Indexes are owner-scoped, including a
  **`UNIQUE (owner_email, source_type, source_id)`** index so two owners can favorite
  the same pool item while remaining isolated.

### Owner-isolation divergence from upstream

Upstream favorites are global and unauthenticated, keyed off a single default group
with the literal primary key `id = "default"`. That collides once favorites are
owner-scoped. This port derives a **per-owner default group id**,
`default-<sha256(ownerEmail)>` (hex — within the existing `normalizeId` charset, so it
round-trips through the API). `isDefault` is computed by comparing a row's id to its
owner's derived default id. The fork's pool-page / favorites UI already keys off the
`isDefault` flag (never a hardcoded `"default"` string), so it is compatible unchanged.

### Frontend

- **Standalone pool page** — `apps/web/src/features/pool/PromptPoolPage.tsx` and
  `promptFavoritesApi.ts` ported, then routed through the fork's embed-session
  **`apiFetch`** so `/api/pool` and `/api/prompt-favorites*` carry the embedded bearer
  session token (matches `GalleryPage`; works inside the workbench iframe where cookies
  may be blocked).
- **Styles** — `pool.css` + `prompt-favorites.css` use only fork-native design tokens
  (with self-scoped `--pool-column-count` / `--pool-image-ratio` fallbacks), imported
  via `canvas-app.css` just before `dark.css` so the dark-theme override still cascades.
- **i18n** — 75 prompt-pool / favorites / nav keys added to both `zh-CN` and `en`
  catalogs (type-checked: `enMessages` must satisfy `typeof zhMessages`).
- **Canvas routing** — minimal append-style edits to `CanvasApp.tsx` following the
  existing `GalleryPage` lazy-route pattern: `AppRoute` gains `pool`; `routeFromLocation`
  / `pathForRoute` map `/pool`; a `BookOpenCheck` nav link preloads the lazy module on
  hover; `LazyPromptPoolPage` renders behind the same `InternalLoginScreen` shell; the
  `reusePromptPoolItem` handler fills the composer prompt and navigates to canvas.
- **Favorites panel** — extracted into a self-contained
  `apps/web/src/features/prompt-favorites/PromptFavoritesPanel.tsx` (owns its data, UI
  state, tooltip, and CRUD) rather than dumping ~325 lines into the protected
  `CanvasApp.tsx`. The host adds only an import, the `PromptFavoriteItem` type, a small
  `reusePromptFavoriteItem` handler, and one canvas-route-gated mount line.

## Deliberate scope decisions

- **`GET /api/pool` sits behind the session middleware** (global read-only data, no
  owner filter) rather than being made separately public. The whole app is already
  behind `InternalLoginScreen`, so this preserves the fork's "everything behind login"
  contract while keeping the data global.
- **No "favorite this canvas output" action.** Upstream favorites are pool-sourced only
  (`source_type = "pool"`, `createPromptFavorite` takes a `promptPoolItemId`). A
  canvas-output source would require new backend surface and is not safely isolatable,
  so it was intentionally omitted.
- **No upstream version/changelog branding.** `package.json` files and `CHANGELOG.md`
  are untouched; the fork keeps its own release state (still `0.2.0`).

## Data handling

The 120k-line `prompt-pool-data/prompts-all.json` is **never committed**. `/prompt-pool-data/`
is gitignored and `PROMPT_POOL_DIR` is documented in `.env.example`. Operators point
`PROMPT_POOL_DIR` at an external dataset directory; absent that, the pool page renders
its empty/unavailable state.

## Protected Muxing contracts — confirmed intact

`git diff 0a6679d..HEAD` touches **no** protected file: `internal-auth.ts`,
`embed-session.ts`, `shell-theme-bridge.ts`, `InternalLoginScreen.tsx`,
`provider-config.ts`, `routes/gallery.ts`, and `test/openai-responses-provider.test.ts`
are all unchanged, as are all `package.json` files and `CHANGELOG.md`.

## Verification (HEAD of `codex/prompt-pool-port-20260605`)

All green (12/12):

- `pnpm --filter @gpt-image-canvas/shared build` — PASS
- `pnpm --filter @gpt-image-canvas/api typecheck` — PASS
- `pnpm --filter @gpt-image-canvas/api build` — PASS
- `pnpm --filter @gpt-image-canvas/web build` — PASS (PromptPoolPage emits as its own lazy chunk)
- `pnpm build` — PASS
- `tsx test/prompt-pool.test.ts` — PASS (missing / invalid / loaded / nested layouts)
- `tsx test/prompt-favorites.test.ts` — PASS (owner isolation: cross-owner read/mark/delete/rename all denied; per-owner default group undeletable)
- `tsx test/internal-auth.test.ts` — PASS (protected)
- `tsx test/openai-responses-provider.test.ts` — PASS (protected)
- `tsx test/provider-config-guest.test.ts` — PASS (protected)
- `tsx test/generation-task-init.test.ts` — PASS
- `pnpm --filter @gpt-image-canvas/api smoke:planner` — PASS

## Adversarial review (independent read-only auditors, 2026-06-05)

A three-agent review audited the port:

- **Owner isolation — PASS.** All favorites domain functions filter by `ownerEmail`; all
  route handlers derive the owner from `requireInternalUserEmail(c)` (never from the
  request body or URL); both tables are `owner_email TEXT NOT NULL` with a `UNIQUE
  (owner_email, source_type, source_id)` index; the per-owner default group id is
  collision-free. Nine constructed cross-owner attack scenarios are all rejected at the
  domain layer — matching the gallery isolation pattern.
- **Frontend integrity — PASS.** Every `/api` call goes through embed-aware `apiFetch`
  (no bare `fetch`); `embed-session.ts`, `InternalLoginScreen.tsx`, and
  `shell-theme-bridge.ts` are byte-identical; the CanvasApp edits are append-style; the
  favorites panel is a separate component.
- **Data externalization — one flagged "critical" was a FALSE POSITIVE, disproven with
  git evidence.** The auditor reported `prompt-pool-data/prompts-all.json` as "committed
  within the port range," but that file exists only in the *upstream* commit `6d0ce77`,
  which is **not** an ancestor of this branch (it is merely a fetched object referenced
  via `git show`):
  - `git merge-base --is-ancestor 6d0ce77 HEAD` → false (not in branch history)
  - `git cat-file -e HEAD:prompt-pool-data/prompts-all.json` → fails (not tracked)
  - `git ls-files -- prompt-pool-data/` → empty
  - `git log 0a6679d..HEAD -- prompt-pool-data/` → empty (no port commit touches it)

  The dataset is correctly external and gitignored; no large JSON is committed on this
  branch.

## Commits (local only — not pushed)

- `feat(prompt-pool): add owner-scoped backend services`
- `feat(prompt-pool): add standalone prompt pool frontend`
- `feat(prompt-pool): wire prompt pool into canvas shell`
- `feat(prompt-pool): add prompt favorites panel and canvas actions`
- `docs(prompt-pool): record upstream prompt pool port`
