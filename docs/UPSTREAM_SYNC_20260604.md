# Upstream Sync — Verified Migration Matrix — 2026-06-04

Branch: `codex/canvas-upstream-full-merge-20260604`
Base: `ad52b7d` (`feat: support responses env openai provider`) → `0e35a2e` (prior triage doc)
Upstream synced from: `mrslimslim/gpt-image-canvas` @ `upstream/main` = `c62a01e` (`fix: store increase error`)
Merge-base with upstream: `17f0387` (fork and upstream diverged here)
Commits reviewed: all 41 in `17f0387..upstream/main`

## Outcome

This run **manually ported the one upstream behavior that was genuinely missing and
reliably portable**, and verified every other upstream commit with code-level proof.
Unlike the prior triage (which deferred all 41 and contained several false
"subsystem absent" claims), every disposition below is backed by a `git grep` /
`git show <ref>:<path>` against the fork base `0e35a2e` and the upstream commit.

| Disposition | Count |
|---|---|
| **Implemented** (ported this run) | **1** — `eb4ad5b` requested-output-count preservation |
| Already equivalent (fork has it / inapplicable subsystem) | 36 |
| Blocked, with code-level proof | 4 — `6885edc` prompt pool + its 3 dependents |
| **Total** | **41** |

Method: per-commit read-only analysis of upstream diff vs the fork's committed code,
followed by adversarial verification of the one actionable finding (confirmed
portable: genuinely absent + isolatable without touching protected Muxing files).

## Corrections to the prior triage (`docs` @ `0e35a2e`)

The prior doc deferred everything and justified several deferrals with claims that
are factually wrong. Re-verified facts:

- **`0adf543` is NOT "inapplicable because the codex-image-provider subsystem is
  absent."** The subsystem exists: `apps/api/src/infrastructure/providers/codex-image-provider.ts`,
  `apps/api/src/domain/providers/image-provider-selection.ts`,
  `apps/api/src/domain/providers/provider-config.ts`,
  `apps/web/src/features/provider-config/ProviderConfigDialog.tsx`. The correct reason
  it needs no port: the fix is **already fully applied** in the fork (see matrix).
- **`051803a` is NOT "inapplicable because SIZE_PRESETS is absent."** The fork
  imports and uses `SIZE_PRESETS` (`packages/shared/src/image.ts`) throughout
  `CanvasApp.tsx`, and **already contains `portrait-4k`** in both `image.ts` and the
  i18n `sizePresetLabels`.
- **`84cc805` is NOT "inapplicable because canvas.css is absent."** The fork has
  `apps/web/src/styles/canvas.css` and its blob already equals this commit's post-image.
- **`eb4ad5b` is NOT "already present."** The fork has `evaluatePlannerAttemptOutput`
  but lacked the requested-output-count guard — this run ported it.

## Migration matrix (all 41 commits)

Fork refs are `0e35a2e:<path>`. "equivalent" = fork already implements the behavior;
"inapplicable" = the targeted subsystem/bug does not exist in the fork.

### Implemented this run

| Commit | Subject | Fork state | Action |
|---|---|---|---|
| `eb4ad5b` | feat: update agent mode | **missing** (the requested-output-count guard) | **Ported** — see "Implemented" below |

### Low-risk fixes — already equivalent (verified)

| Commit | Subject | Fork state | Evidence (fork base `0e35a2e`) |
|---|---|---|---|
| `0adf543` | fix: codex login error | equivalent | `infrastructure/providers/codex-image-provider.ts` has `responsesModel`/`imageModel` split (:20-21), `getCodexResponsesModel` (:47), `action`/`output_format` (:62-66), `store:false`+`instructions` (:70-72), `codexHttpProviderErrorFromResponse` (:193,:307), `sanitizeCodexErrorDetail` (:343); `image-provider-selection.ts:59-60` passes both models. Codex provider is separate from the env `OPENAI_IMAGE_API_MODE=responses` provider. |
| `ed7a962` | feat: reload keep generate | equivalent | Server: `project-store.ts:285` uses `records.map` (no empty-output drop) + ownerEmail isolation; async tasks in `generation-tasks.ts`, polling routes `images.ts` (`GET/POST /api/generations/:id`), `clientRequestId` in `validation.ts`+shared. Client restore: `CanvasApp.tsx` `recoverActiveGenerationPolling` + `pollGenerationUntilComplete`. |
| `05d3ee1` | fix: agent 400 error | equivalent | `planner.ts:67` `GENERATION_JOB_ROLE_ALIASES` (~70 entries) + `parseJobRole` (:2322-2333) identical (exact match → normalized alias). The other 22 files are the skill-store feature, not a 400 fix. |
| `c62a01e` | fix: store increase error | inapplicable | `git grep 'tryWriteProjectSnapshotBackup|pruneProjectSnapshotBackups|PROJECT_SNAPSHOT_BACKUP|backedUpSnapshotHashes|backupExists' 0e35a2e` → nothing. Fork persists via drizzle to DB tables (no rotated filesystem backup dir to bound). |
| `2151ef4` | feat: agent optimize | equivalent | Arbitrary job count 1..16 already present: `executor.ts:655` `isExecutableGenerationCount` = `value>0 && value<=MAX_GENERATION_PLAN_IMAGES`; `planner.ts:2295-2297` `parseGenerationCount` (no enum check); `MAX_GENERATION_PLAN_IMAGES=16`. Legacy enum `[1,2,4,8,16]` is UI-only. |
| `7ade90f` | feat: optimize agent | equivalent | Pending-question preservation present byte-identical: shared `pendingUserText`, `conversation-store.ts:268-271`, `websocket-session.ts:560-590`,`644`,`776`, `resolvedConversationUserText`/`isShortClarificationResponse`; `shouldAcceptPlannerUserQuestion` (:491-501). |

### Storage / gallery / persistence — already equivalent (verified)

| Commit | Subject | Fork state | Evidence |
|---|---|---|---|
| `9f0ee8d` | feat: add R2 & S3 storage | equivalent | `infrastructure/storage/asset-storage.ts`, `packages/shared/src/storage.ts`, `domain/storage/storage-config.ts` are byte-identical to upstream post-commit (`S3CompatibleAssetStorageAdapter`, `resolveS3ConfigForSave`/`buildR2Endpoint`, `S3EndpointMode`). `CloudStorageProvider="cos"|"s3"`; `@aws-sdk/client-s3` in `apps/api/package.json`. Protected R2 behavior lives here. |
| `6bd45b3` | feat: add quality of the loading | equivalent | Gallery ZIP export present + hardened with ownerEmail: `domain/assets/zip.ts` (`prepareZipFiles`/`createZipStream`), `routes/gallery.ts` `POST /api/gallery/export` (uses `requireInternalUserEmail`+ownerEmail), `GalleryPage.tsx` `exportSelectedItems`. Loading polish (`ChampagneParticleCanvas`) in `GenerationPlaceholderShape.tsx`. |

### Agent feature commits — already equivalent (fork is a superset)

| Commit | Subject | Fork state | Evidence |
|---|---|---|---|
| `f509d15` | Add agent config and WebSocket foundation | equivalent | `domain/agent/config.ts` (byte-identical logic, timeout 300000 ≥ upstream 60000), `schema.ts:63-72` `agentLlmConfigs`, `websocket-session.ts` `createAgentWebSocketEvents`. WS route fused with `internal-auth` (`requireInternalUserEmail` → ownerEmail). |
| `462aec6` | Add agent generation plan planner | equivalent | `planner.ts` (2459 lines) exports every upstream symbol; `validateGenerationPlan` byte-identical; fork adds extra planner backends + ecommerce skill. |
| `3f40fac` | Build agent tab UI | equivalent | Refactored into `features/canvas/CanvasApp.tsx` (`PanelTab`, `handleAgentServerEvent`, `ensureAgentSocket`, reference selection) + `styles/agent-panel.css`. |
| `bc3f20a` | Add agent plan node shape | equivalent | `features/agent/AgentPlanNodeShape.tsx` (836 lines) — `AgentPlanNodeShapeUtil`, helpers; registered in `CanvasApp.tsx` `shapeUtils`. |
| `f53ff27` | Add agent plan execution orchestration | equivalent | `domain/agent/executor.ts` (741 lines) — `executeGenerationPlan`, dependency walk, full emit suite; event literals in shared; threads ownerEmail. |
| `f2889eb` | feat: add ai agent (foundational) | equivalent | Planner symbols all present; image-gen `persistedReferenceAssetId`/`asset:` matching present and threaded with R2/ownerEmail. |
| `811f22e` | feat: add ai agent (dialog cleanup) | equivalent | The removed `provider-source-mini--agent-summary` is absent in the fork's independently-rewritten `ProviderConfigDialog.tsx`. |
| `c41bcde` | Document agent canvas generation | equivalent | The aria fix is exceeded: fork uses `inert` (`CanvasApp.tsx:6007`) instead of `aria-hidden`. README is upstream-branded. |
| `b0ea34c` | Stream direct agent planner output | equivalent | `assistant_thinking_delta` event/type + planner `onThinkingDelta`/`model.stream` reasoning extraction + WS emit + client consume — all present. |
| `6df4906` | Fix agent transcript streaming layout | equivalent | Autoscroll effect (`CanvasApp.tsx:3434`), stale-event guards `isAgentStreamEventForActiveRun`/`isStaleAgentRunEvent`/`runIdForAgentEvent`, per-message `runId` `appendAgentStreamDelta` — all present (fork superset). |
| `66edd7b` | Make agent plan details inspectable | equivalent | `AgentPlanNodeShape.tsx` `selectedJobId`, clickable job rows, `agent-plan-node__detail`, `AgentPlanDetailOutputSlots` — all present. |
| `e14887e` | feat: update agent stablity | equivalent | `resolveImplicitAgentContextReferences` + zh/en target detection + `context_resolved` event + `AgentContextResolvedEvent` all present; fused with ownerEmail. |
| `8ed1872` | feat: polyfill (agent history) | equivalent | `agent_conversations` table + `conversation-store.ts` + `routes/agent-conversations.ts` + WS `conversationId` + `AgentHistoryDialog` in `CanvasApp.tsx`. Fork superset (ownerEmail-guarded). |

### UI / style / canvas / homepage — already equivalent (verified)

| Commit | Subject | Fork state | Evidence |
|---|---|---|---|
| `051803a` | feat: add 4k portrait | equivalent | `packages/shared/src/image.ts` SIZE_PRESETS already contains `portrait-4k` (2160×3840); i18n `sizePresetLabels` has `portrait-4k` (zh+en). |
| `89620f8` | feat: update canvas | equivalent | `CANVAS_DEFAULT_SNAP_MODE=true` + `CanvasSnapIndicator` + `isSnapMode` + `.canvas-snap-indicator` CSS; "Custom OpenAI"/"自定义" copy in i18n + provider-config + validation. |
| `84cc805` | feat: 优化效果 | equivalent | `styles/canvas.css` blob equals commit post-image (`container-type: inline-size`, `clamp(0.56rem,3.8cqw,0.72rem)`). |
| `c73aa2f` | feat: update homepage | equivalent | Part B (BrandMark→img, favicon.png, canvas-runtime brand-mark) present; Part A upstream marketing HomePage is inapplicable (fork goes embed→InternalLoginScreen→LazyCanvasApp). |
| `3bcdf23` | style: style update | equivalent | Motion tokens + `--image-outline` in `tokens.css`, `text-wrap`/`tabular-nums` in `base.css`, `.panel-tab-switcher::before` + `data-active-tab` — present. |
| `daee032` | style: fix style error | equivalent | `@keyframes app-view-fade-in` + `.app-shell.app-view:not([hidden])` in `base.css`; `.provider-config-tabs` position fix. |
| `a1c6cd4` | style: style update | equivalent | `.segmented-control.is-active:hover` in `generation.css` (light) + `dark.css` (dark). |
| `607f642` | fix: style update | equivalent | `.gallery-page.app-view:not([hidden])` fade in `gallery-cards.css`. |

### Docs / CI / refactor — already equivalent or inapplicable

| Commit | Subject | Fork state | Evidence |
|---|---|---|---|
| `a88d17a` | chore: update readme | equivalent | `CHANGELOG.md` v0.3.0 notes present; READMEs maintained independently. |
| `e5aa85c` | feat: refactor | equivalent | Pure structural reorg; fork already has the full `domain/`+`server/routes/`+`features/` layout (no net behavior change). |
| `e231773` | chore: add ghcr workflow | inapplicable | Fork deploys via Vercel, not Docker/GHCR. |
| `3936336` | chore: update readme | inapplicable | Upstream README version-string cleanup; no fork equivalent. |
| `7cd6d1f` | ci: publish docker image on push | inapplicable | Vercel deploy, not GHCR CI. |
| `5abc7c6` | Document native dependency rebuild note | equivalent | `AGENTS.md:33` has the exact `better-sqlite3` rebuild note. |
| `ce949a8` | Record agent streaming verification | equivalent | `.agents/tasks/prd-agent-streaming-plan-ui.json` AS-004 `done` + verificationNotes present. |

### Blocked — with code-level proof

| Commit | Subject | Why blocked (code-level) |
|---|---|---|
| `6885edc` | feat: v0.4.0 add prompt pool | Net-new feature. Backend (tables `prompt_favorite_groups`/`prompt_favorites`, `domain/prompt-pool`, `domain/prompt-favorites`, routes, shared types) is **absent** (`git grep -i 'prompt-pool|prompt-favorites|PromptPoolPage|promptFavorites' 0e35a2e -- :!docs/` → nothing; `styles/pool.css`/`prompt-favorites.css` `cat-file -e` → not a valid object). The **user-facing** feature is a 488-line interleave into `CanvasApp.tsx` (`AppRoute` routing switch, lazy-module registry, `TopNavigation`, a 180-line `PromptFavoritesFloatingPanel`). `CanvasApp.tsx` is the host of the protected `shell-theme-bridge.ts`/`embed-session.ts`/`InternalLoginScreen` contracts, so a 488-line 3-way merge there is not an isolatable slice. The backend-only slice is isolatable but yields dead routes with no UI → no observable capability. **Blocked as shipped.** |
| `c12237d` | feat: style update (favorites) | Strictly dependent on `6885edc`: edits `prompt-favorites.css` (absent — `cat-file -e` fails) and `PromptFavoritesFloatingPanel` (absent). No isolatable behavior. |
| `7e0d2f6` | update style (favorites) | Edits only `prompt-favorites.css` (absent). Dependent on the blocked `6885edc`. |
| `6d0ce77` | chore: release v0.4.0 | Functional parts (`PromptFavoriteTooltip` + handlers) extend the absent `PromptFavoritesFloatingPanel` / `prompt-favorites.css` / `prompt-pool-data`. Remainder is version/CHANGELOG bookkeeping (fork tracks its own release state). Dependent on the blocked `6885edc`. |

## Implemented: `eb4ad5b` requested-output-count preservation

Commit on this branch: `0464c67`.

**Bug:** the agent planner could collapse a request for N images/variants into a
single output (count 1), ignoring the user's explicit count.

**Genuine fork gap (proof):** the fork has `evaluatePlannerAttemptOutput`
(`planner.ts:395`) but its body ended at `return {ok:true, plan:validated.plan}` with
no count guard, and both selected-reference fallbacks returned the raw `fallbackPlan`.
`git grep 'validateRequestedOutputCount|planSatisfiesRequestedOutputCount|finalOrVariationOutputCount|requestedOutputCountFromUserText|parseChineseCountToken|parseEnglishCountToken' 0e35a2e -- apps/api/src/`
returned nothing.

**Port (`apps/api/src/domain/agent/planner.ts`, +231/-7):** upstream-equivalent, faithful.
- Added `FALLBACK_VARIANT_DIRECTIONS` and 8 pure helpers (count parsing for digits,
  Chinese, and English numerals; `isLikelyReferenceCountMention` to ignore
  "combine the 3 selected images into one"; `validateRequestedOutputCount`,
  `planSatisfiesRequestedOutputCount`, `finalOrVariationOutputCount`). CJK code points
  verified byte-equivalent to upstream's `\u`-escaped source.
- `evaluatePlannerAttemptOutput` reflects/retries with `agent_requires_user_input`
  when `finalOrVariationOutputCount(plan) < requested`, and gates both fallbacks.
- `createSelectedReferenceEditFallbackPlan` builds multi-variant fallback plans;
  `buildPlannerUserMessage` injects the requested-count instruction.

All dependencies pre-existed in the fork: `MAX_GENERATION_PLAN_IMAGES`,
`AgentPlannerFailure`, `positiveIntegerValue` (accepts string digits),
`intent.requiresEverySelectedReference`, `selectedReferenceForFallbackJob`. **No
protected Muxing file is touched.**

**Tests (`apps/api/src/smoke/agent-planner-smoke.ts`, +111):** mirror upstream's two
smoke cases (variant fallback preserves explicit count; planner reflects on a dropped
explicit count) plus a detection check (English digit, Chinese numeral, and
reference-mention suppression). All pass.

## Verification (this branch @ `0464c67`)

- `pnpm --filter @gpt-image-canvas/shared build` — OK
- `pnpm --filter @gpt-image-canvas/api typecheck` — OK (0 errors)
- `pnpm --filter @gpt-image-canvas/api smoke:planner` — **PASS** (all cases incl. 3 new)
- `tsx test/openai-responses-provider.test.ts` — **PASS 1/1** (protected)
- `tsx test/internal-auth.test.ts` — **PASS 6/6** (protected)
- `tsx test/generation-task-init.test.ts` — PASS 1/1
- `tsx test/provider-config-guest.test.ts` — PASS 1/1 (guest mode)
- `pnpm build` (shared + web vite + api) — OK

## Protected Muxing customizations — confirmed intact

`internal-auth.ts`, `InternalLoginScreen.tsx`, `embed-session.ts`,
`shell-theme-bridge.ts`, guest mode, embed/login/session/theme bridge, Cloudflare R2
storage, gallery/custom service, ownerEmail history isolation, env
`OPENAI_IMAGE_API_MODE=responses` provider, and
`apps/api/test/openai-responses-provider.test.ts` — all unchanged. The only files
modified by this run are `apps/api/src/domain/agent/planner.ts` and
`apps/api/src/smoke/agent-planner-smoke.ts`.

## Guidance for future syncs

Treat `mrslimslim/gpt-image-canvas` as a reference, not a merge source — histories are
patch-incompatible. The fork is at parity or ahead on every area except the
prompt-pool feature (blocked: its UI is fused into the protected `CanvasApp.tsx`
shell). If prompt-pool is wanted, scope it as a dedicated port that re-implements the
UI against the fork's shell + embed/theme contracts, not a cherry-pick.
