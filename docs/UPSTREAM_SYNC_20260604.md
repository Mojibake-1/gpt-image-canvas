# Upstream Sync Review — 2026-06-04

Branch: `codex/canvas-upstream-sync-20260604`
Base commit: `ad52b7d` (`feat: support responses env openai provider`)
Upstream reviewed: `mrslimslim/gpt-image-canvas` @ `upstream/main` = `c62a01e` (`fix: store increase error`)
Merge-base with upstream: `17f0387`

## Decision

**No upstream commit was backported.** After full triage, none of the 41 upstream
commits in `17f0387..upstream/main` is simultaneously (a) valuable, (b) applicable to
this fork, and (c) safely hand-portable without duplicating or destabilizing the
Muxing customizations. All upstream changes are **deferred** and recorded below.

This branch therefore preserves the Muxing server exactly as of `ad52b7d`. The only
change introduced by this review is this document.

## Why a merge/cherry-pick is not viable

The Muxing fork and upstream diverged at `17f0387` and then re-developed overlapping
feature areas (agent canvas, storage, gallery, provider layer) in parallel with
*different commit identity*. Measured facts:

| Probe | Result |
|---|---|
| `git cherry ad52b7d c62a01e` | **0 of 41** upstream commits are patch-equivalent to ours (all `+`) |
| Files changed by upstream (`17f0387..upstream/main`) | 149 |
| Files changed by us (`17f0387..ad52b7d`) | 157 |
| Files changed by **both** (direct conflict surface) | **132** |
| `git merge-tree` cherry-pick simulation onto `ad52b7d` | **41 of 41 conflict** (incl. every 1-file commit) |

Because our versions of the shared files diverged so far, no upstream patch applies in
context — even a 1-line CSS commit conflicts. A full `git merge upstream/main` would
raise conflicts across ~132 files and risk silently clobbering Muxing-specific layers.
"Backport" here can only mean *manual* re-implementation, so each commit was judged on
whether a manual port is worth the risk.

## Triage methodology

1. Computed divergence (merge-base, commit lists, file overlap, patch-equivalence).
2. Simulated every cherry-pick in-memory with `git merge-tree` (no worktree mutation).
3. Ran a read-only multi-agent triage over all 41 upstream commits, classifying each
   into the risk phases below with a port/defer recommendation.
4. **Independently verified by hand** every commit that the triage flagged as
   containing a "genuine fix" — confirming each is either inapplicable or already
   present in this fork (see "Verified fix candidates").

## Upstream commits grouped by phase (all deferred)

### Phase 1 — low-risk bugfix / provider compatibility
| Commit | Subject | Disposition |
|---|---|---|
| `0adf543d` | fix: codex login error | Defer — patches `codex-image-provider.ts` / `image-provider-selection.ts`, a provider subsystem **absent** from this fork (we use the env-based `OPENAI_IMAGE_API_MODE=responses` provider). No target to port into. |

### Phase 2 — storage / project persistence
| Commit | Subject | Disposition |
|---|---|---|
| `9f0ee8d6` | feat: add R2 & S3 storage | Defer — fork **already has** Cloudflare R2 storage; 26-file/2600-line feature whose `CanvasApp.tsx` delta sits adjacent to protected embed/theme files. |
| `c62a01e` | fix: store increase error | Defer — the real fix bounds project-**snapshot-backup** growth, but that backup scaffolding (`PROJECT_SNAPSHOT_BACKUP_*`, `tryWriteProjectSnapshotBackup`, `pruneProjectSnapshotBackups`) **does not exist** in this fork, so the bug cannot occur. Also entangled with a 758-line planner rewrite + new LangGraph dependency. |

### Phase 3 — prompt pool / favorites
| Commit | Subject | Disposition |
|---|---|---|
| `6885edc9` | feat: v0.4.0 add prompt pool | Defer — net-new feature across 26 files incl. a ~120K-line data blob, new DB schema/routes, and 484 lines interleaved into the most-diverged file (`CanvasApp.tsx`). Not a duplicate, but too entangled to port safely now. |
| `c12237d9` | feat: style update (favorites) | Defer — `prompt-favorites.css` absent in fork; cosmetic only. |
| `7e0d2f6b` | update style (favorites) | Defer — cosmetic CSS on absent file. |
| `6d0ce777` | chore: release v0.4.0 | Defer — version bumps + prompt-pool data churn; no standalone capability. |

### Phase 4 — agent updates (only if they don't break Muxing embed/login)
| Commit | Subject | Disposition |
|---|---|---|
| `f509d157` | Add agent config and WebSocket foundation | Defer — fork has its own divergent agent config/WS stack. |
| `462aec63` | Add agent generation plan planner | Defer — 2034-line planner w/ LangChain/deepagents; duplicates fork planner. |
| `3f40fac5` | Build agent tab UI | Defer — ~1500-line agent UI built from scratch; fork already ships its own. |
| `bc3f20ac` | Add agent plan node shape | Defer — fork's `features/agent/AgentPlanNodeShape.tsx` is larger/ahead. |
| `f53ff275` | Add agent plan execution orchestration | Defer — 699-line DAG executor; conflicts with fork executor contract. |
| `c41bcde8` | Document agent canvas generation | Defer — docs + 1-line aria change; feature already implemented divergently. |
| `b0ea34c7` | Stream direct agent planner output | Defer — DeepSeek streaming rework fused into diverged planner/WS. |
| `6df4906e` | Fix agent transcript streaming layout | Defer — genuine autoscroll/stale-event fixes buried in 2289-line UI redesign. |
| `66edd7bc` | Make agent plan details inspectable | Defer — multi-file agent UI feature over heavily-diverged files. |
| `5abc7c6f` | Document native dependency rebuild note | Defer — single-line AGENTS.md dev note. |
| `ce949a8b` | Record agent streaming verification | Defer — internal task-tracking JSON only. |
| `f2889eb2` | feat: add ai agent | Defer — upstream's foundational agent feature (4838 ins/23 files); fork has full divergent agent layer. |
| `811f22e4` | feat: add ai agent | Defer — provider-dialog UI cleanup over diverged component. |
| `2151ef4e` | feat: agent optimize | Defer — job count 1–16 (nice, but spread across diverged planner/executor/shared). |
| `ed7a9623` | feat: reload keep generate | Defer — async-polling rework; its `flatMap→map` history fix is **already present** in our `project-store.ts`. |
| `e14887e5` | feat: update agent stablity | Defer — server-side agent memory refactor across 8 diverged files. |
| `8ed18727` | feat: polyfill | Defer — agent-history persistence feature (new table + 533-line dialog) over diverged agent area. |
| `05d3ee17` | fix: agent 400 error | Defer — `parseJobRole` alias fuzzy-match is **already present and more complete** in our planner; the rest is a 3400-line skill-store feature. |
| `7ade90fd` | feat: optimize agent | Defer — "preserve pending question" UX inside diverged planner/WS. |
| `eb4ad5b3` | feat: update agent mode | Defer — multi-image output-count fix (`evaluatePlannerAttemptOutput`) is **already present** in our planner; bundled with 550-line `CanvasApp.tsx` rewrite over Muxing-sensitive layout. |

### Out of scope — docs / CI / pure-style / structural refactor
| Commit | Subject | Disposition |
|---|---|---|
| `a88d17a9` | chore: update readme | Defer — docs only. |
| `e5aa85c7` | feat: refactor | Defer — ~17K-line structural reorg across 76 files; fork diverged past it; touches files our embed/auth/theme layers depend on. |
| `051803a7` | feat: add 4k portrait | Defer — `SIZE_PRESETS` array absent in fork (canvas sizing handled divergently). |
| `3bcdf232` | style: style update | Defer — cosmetic CSS + docs dump (36 files). |
| `daee0326` | style: fix style error | Defer — cosmetic CSS polish. |
| `89620f8a` | feat: update canvas | Defer — i18n copy pass + snap indicator (snap already implemented divergently). |
| `c73aa2f4` | feat: update homepage | Defer — upstream homepage redesign + brand assets; fork has its own branding. |
| `a1c6cd48` | style: style update | Defer — cosmetic hover CSS on absent files. |
| `6bd45b35` | feat: add quality of the loading | Defer — cosmetic loader + gallery ZIP export; would need integration with diverged guest-mode gallery. |
| `84cc8052` | feat: 优化效果 | Defer — `canvas.css` absent in fork. |
| `e231773e` | chore: add ghcr workflow | Defer — Docker/GHCR CI; fork deploys via Vercel. |
| `39363366` | chore: update readme | Defer — docs only. |
| `607f6423` | fix: style update | Defer — `gallery-cards.css` absent in fork. |
| `7cd6d1fb` | ci: publish docker image on push | Defer — CI only; not used by fork. |

## Verified fix candidates (hand-checked against our code)

These are the only commits whose "genuine fix" could plausibly matter; each was opened
and compared against `ad52b7d` directly:

1. **`c62a01e` snapshot-backup pruning** — our `project-store.ts` contains **none** of
   the backup symbols the fix touches. The unbounded-growth bug cannot occur here.
   → inapplicable.
2. **`ed7a9623` `readGenerationHistory` `flatMap → map`** — our `project-store.ts`
   already returns `records.map((record) => …)` with the record emitted directly (no
   `if (mappedOutputs.length === 0) return []` drop), and is additionally
   `ownerEmail`-isolated for internal login. In-progress records are **not** hidden.
   → already handled.
3. **`05d3ee17` `parseJobRole` role aliases** — our planner already defines
   `GENERATION_JOB_ROLE_ALIASES` and a `parseJobRole` that falls back to the normalized
   alias table; our table is broader than upstream's. → already present.
4. **`eb4ad5b3` output-count evaluation** — our planner already defines
   `evaluatePlannerAttemptOutput`. → already present (equivalent logic).
5. **`0adf543d` codex `responsesModel`/`imageModel` split** — the `codex-image-provider`
   subsystem it edits does not exist in this fork. → inapplicable.

## Muxing customizations confirmed intact at `ad52b7d`

- `apps/api/src/server/internal-auth.ts` — present
- `apps/web/src/features/canvas/InternalLoginScreen.tsx` — present
- `apps/web/src/features/canvas/embed-session.ts` — present
- `apps/web/src/features/canvas/shell-theme-bridge.ts` — present
- `apps/api/test/openai-responses-provider.test.ts` — present (passes)
- Env OpenAI Responses mode (`OPENAI_IMAGE_API_MODE=responses`) — preserved
- Cloudflare R2 storage, guest mode, agent canvas tree, `ownerEmail` history isolation,
  terracotta/teal theme tokens — all retained (fork is ahead of upstream here)
- Active-service assumptions unchanged (API :8791, Caddy upstream)

## Verification (this branch)

- `pnpm install --frozen-lockfile` — OK
- `pnpm --filter @gpt-image-canvas/api exec tsx test/openai-responses-provider.test.ts` — **PASS** (1/1)
- `pnpm --filter @gpt-image-canvas/api typecheck` — **PASS** (no errors)

## Recommendation for future syncs

Treat `mrslimslim/gpt-image-canvas` as a *reference*, not a merge source — the histories
are patch-incompatible and a blind merge is destructive. If a specific upstream
capability is wanted (prompt pool, gallery ZIP export, agent stability tweaks, 4K
portrait preset), scope it as its own port project and re-implement it against this
fork's architecture with dedicated tests, rather than cherry-picking. Keep
internal-auth / embed-session / shell-theme-bridge and the env Responses provider as the
protected core. Re-run the `git merge-tree` + per-commit triage approach for the next
window.
