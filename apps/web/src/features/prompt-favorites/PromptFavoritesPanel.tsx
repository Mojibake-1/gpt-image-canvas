import { Bookmark, BookmarkCheck, Check, Copy, Search, Trash2, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PromptFavoriteGroup, PromptFavoriteItem } from "@gpt-image-canvas/shared";
import { useI18n, type Translate } from "../../shared/i18n";
import { writeClipboardText } from "../../shared/clipboard";
import { deletePromptFavorite, fetchPromptFavorites, markPromptFavoriteUsed } from "./promptFavoritesApi";

type PromptFavoriteTooltip = {
  arrowLeft: number;
  id: string;
  maxHeight: number;
  placement: "above" | "below";
  prompt: string;
  left: number;
  top: number;
  width: number;
};

function promptExcerpt(promptValue: string): string {
  const compact = promptValue.replace(/\s+/gu, " ").trim();
  return compact.length > 72 ? `${compact.slice(0, 72)}...` : compact;
}

function promptFavoriteMeta(favorite: PromptFavoriteItem, t: Translate): string {
  const mediaLabel = favorite.mediaType === "video" ? t("poolMediaVideo") : t("poolMediaImage");
  const sizeLabel =
    favorite.imageWidth && favorite.imageHeight ? `${favorite.imageWidth}x${favorite.imageHeight}` : mediaLabel;
  return `${favorite.model} · ${sizeLabel}`;
}

function countPromptFavoritesByGroup(favorites: PromptFavoriteItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const favorite of favorites) {
    counts.set(favorite.groupId, (counts.get(favorite.groupId) ?? 0) + 1);
  }

  return counts;
}

function promptFavoriteSortTime(favorite: PromptFavoriteItem): number {
  const value = favorite.lastUsedAt ?? favorite.updatedAt ?? favorite.createdAt;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function filterPromptFavorites(favorites: PromptFavoriteItem[], query: string, groupId: string): PromptFavoriteItem[] {
  const needle = query.trim().toLowerCase();
  return favorites
    .filter((favorite) => {
      if (groupId !== "all" && favorite.groupId !== groupId) {
        return false;
      }

      if (!needle) {
        return true;
      }

      const haystack = `${favorite.title} ${favorite.prompt} ${favorite.model}`.toLowerCase();
      return haystack.includes(needle);
    })
    .sort((left, right) => promptFavoriteSortTime(right) - promptFavoriteSortTime(left));
}

/**
 * Self-contained floating favorites panel for the canvas. Owns its own data, UI state,
 * and CRUD against the owner-scoped /api/prompt-favorites endpoints. The host only
 * supplies isMobile and an onUse callback that fills the composer — keeping CanvasApp
 * free of the panel internals.
 */
export function PromptFavoritesPanel({
  isMobile,
  onUse
}: {
  isMobile: boolean;
  onUse: (favorite: PromptFavoriteItem) => void;
}) {
  const { t } = useI18n();
  const [groups, setGroups] = useState<PromptFavoriteGroup[]>([]);
  const [items, setItems] = useState<PromptFavoriteItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeGroupId, setActiveGroupId] = useState("all");
  const [copiedFavoriteId, setCopiedFavoriteId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [promptTooltip, setPromptTooltip] = useState<PromptFavoriteTooltip | null>(null);
  const tooltipHideTimeoutRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);

  const loadFavorites = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const next = await fetchPromptFavorites(signal);
      if (!signal?.aborted) {
        setGroups(next.groups);
        setItems(next.favorites);
        setLoadFailed(false);
      }
    } catch {
      if (!signal?.aborted) {
        setLoadFailed(true);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadFavorites(controller.signal);
    return () => controller.abort();
  }, [loadFavorites]);

  // Keep the active group filter valid when groups change.
  useEffect(() => {
    if (activeGroupId !== "all" && !groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId("all");
    }
  }, [activeGroupId, groups]);

  useEffect(() => () => window.clearTimeout(copyTimerRef.current), []);

  const deferredQuery = useDeferredValue(query);
  const groupCounts = useMemo(() => countPromptFavoritesByGroup(items), [items]);
  const visibleFavorites = useMemo(
    () => filterPromptFavorites(items, deferredQuery, activeGroupId),
    [activeGroupId, deferredQuery, items]
  );
  const totalCount = items.length;

  function upsertFavorite(favorite: PromptFavoriteItem): void {
    setItems((current) => [favorite, ...current.filter((item) => item.id !== favorite.id && item.sourceId !== favorite.sourceId)]);
  }

  function handleToggle(): void {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) {
      void loadFavorites();
    }
  }

  function handleUse(favorite: PromptFavoriteItem): void {
    onUse(favorite);
    if (isMobile) {
      setIsOpen(false);
    }
    void markPromptFavoriteUsed(favorite.id).then(upsertFavorite).catch(() => undefined);
  }

  async function handleCopy(favorite: PromptFavoriteItem): Promise<void> {
    try {
      await writeClipboardText(favorite.prompt);
      window.clearTimeout(copyTimerRef.current);
      setCopiedFavoriteId(favorite.id);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedFavoriteId((current) => (current === favorite.id ? null : current));
      }, 1500);
    } catch {
      // Clipboard denials are non-fatal; the prompt stays available in the panel.
    }
  }

  async function handleRemove(favorite: PromptFavoriteItem): Promise<void> {
    try {
      await deletePromptFavorite(favorite.id);
      setItems((current) => current.filter((item) => item.id !== favorite.id));
      setCopiedFavoriteId((current) => (current === favorite.id ? null : current));
    } catch {
      // Leave the favorite in place if the delete failed.
    }
  }

  const clearTooltipHideTimeout = useCallback(() => {
    if (tooltipHideTimeoutRef.current !== null) {
      window.clearTimeout(tooltipHideTimeoutRef.current);
      tooltipHideTimeoutRef.current = null;
    }
  }, []);

  const hidePromptTooltip = useCallback(() => {
    clearTooltipHideTimeout();
    setPromptTooltip(null);
  }, [clearTooltipHideTimeout]);

  const schedulePromptTooltipHide = useCallback(() => {
    clearTooltipHideTimeout();
    tooltipHideTimeoutRef.current = window.setTimeout(() => {
      setPromptTooltip(null);
      tooltipHideTimeoutRef.current = null;
    }, 120);
  }, [clearTooltipHideTimeout]);

  const showPromptTooltip = useCallback(
    (favorite: PromptFavoriteItem, target: HTMLElement) => {
      clearTooltipHideTimeout();

      const rect = target.getBoundingClientRect();
      const listRect = target.closest(".prompt-favorites-panel__list")?.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const boundaryLeft = Math.max(margin, (listRect?.left ?? 0) + gap);
      const boundaryRight = Math.min(window.innerWidth - margin, (listRect?.right ?? window.innerWidth) - gap);
      const width = Math.min(isMobile ? 300 : 360, window.innerWidth - margin * 2, Math.max(220, boundaryRight - boundaryLeft));
      const left = Math.min(Math.max(rect.left, boundaryLeft), boundaryRight - width);
      const arrowLeft = Math.min(Math.max(rect.left + rect.width / 2 - left, 16), width - 16);
      const listTop = Math.max(margin, (listRect?.top ?? 0) + gap);
      const belowTop = rect.bottom + gap;
      const belowSpace = window.innerHeight - belowTop - margin;
      const aboveSpace = rect.top - listTop - gap;
      const placement: PromptFavoriteTooltip["placement"] =
        belowSpace >= 132 || belowSpace >= aboveSpace ? "below" : "above";
      const availableHeight = Math.max(88, placement === "below" ? belowSpace : aboveSpace);
      const maxHeight = Math.min(isMobile ? 188 : 224, availableHeight);
      const top = placement === "below" ? belowTop : Math.max(listTop, rect.top - maxHeight - gap);

      setPromptTooltip({
        arrowLeft,
        id: favorite.id,
        left,
        maxHeight,
        placement,
        prompt: favorite.prompt,
        top,
        width
      });
    },
    [clearTooltipHideTimeout, isMobile]
  );

  useEffect(() => clearTooltipHideTimeout, [clearTooltipHideTimeout]);

  useEffect(() => {
    if (!isOpen) {
      hidePromptTooltip();
    }
  }, [hidePromptTooltip, isOpen]);

  return (
    <div
      className="prompt-favorites-float"
      data-mobile={isMobile}
      data-open={isOpen}
      data-testid="prompt-favorites-floating-panel"
    >
      {isOpen ? (
        <section
          aria-label={t("favoritePanelTitle")}
          aria-modal={isMobile ? true : undefined}
          className="prompt-favorites-panel"
          data-testid="prompt-favorites-panel"
          id="prompt-favorites-panel"
          role={isMobile ? "dialog" : "region"}
        >
          <header className="prompt-favorites-panel__header">
            <div>
              <p>{t("favoritePanelTitle")}</p>
              <strong>{t("favoritePanelCount", { count: totalCount })}</strong>
            </div>
            <button
              className="history-icon-action"
              type="button"
              aria-label={t("favoritePanelClose")}
              onClick={() => setIsOpen(false)}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </header>

          <label className="prompt-favorites-panel__search">
            <Search className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("favoritePanelSearch")}</span>
            <input
              value={query}
              aria-label={t("favoritePanelSearch")}
              placeholder={t("favoritePanelSearchPlaceholder")}
              type="search"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>

          <div className="prompt-favorites-panel__groups" role="tablist" aria-label={t("favoriteGroupLabel")}>
            <button
              className="prompt-favorites-chip"
              data-active={activeGroupId === "all"}
              role="tab"
              type="button"
              aria-selected={activeGroupId === "all"}
              onClick={() => setActiveGroupId("all")}
            >
              {t("poolAllMedia")}
              <span>{totalCount}</span>
            </button>
            {groups.map((group) => (
              <button
                className="prompt-favorites-chip"
                data-active={activeGroupId === group.id}
                key={group.id}
                role="tab"
                type="button"
                aria-selected={activeGroupId === group.id}
                onClick={() => setActiveGroupId(group.id)}
              >
                {group.name}
                <span>{groupCounts.get(group.id) ?? 0}</span>
              </button>
            ))}
          </div>

          {visibleFavorites.length > 0 ? (
            <div className="prompt-favorites-panel__list" onScroll={hidePromptTooltip}>
              {visibleFavorites.map((favorite) => {
                const copied = copiedFavoriteId === favorite.id;
                const copyLabel = copied ? t("agentCopiedMessage") : t("commonCopy");
                return (
                  <article className="prompt-favorites-item" key={favorite.id}>
                    <div className="prompt-favorites-item__media">
                      <img alt="" loading="lazy" src={favorite.assetUrl} />
                    </div>
                    <div
                      className="prompt-favorites-item__body"
                      tabIndex={0}
                      aria-describedby={promptTooltip?.id === favorite.id ? "prompt-favorites-tooltip" : undefined}
                      onBlur={schedulePromptTooltipHide}
                      onFocus={(event) => showPromptTooltip(favorite, event.currentTarget)}
                      onPointerEnter={(event) => showPromptTooltip(favorite, event.currentTarget)}
                      onPointerLeave={schedulePromptTooltipHide}
                    >
                      <h3>{favorite.title}</h3>
                      <p>{promptExcerpt(favorite.prompt)}</p>
                      <span>{promptFavoriteMeta(favorite, t)}</span>
                    </div>
                    <div className="prompt-favorites-item__actions">
                      <button
                        className="primary-action prompt-favorites-item__use"
                        type="button"
                        onClick={() => handleUse(favorite)}
                      >
                        <BookmarkCheck className="size-3.5" aria-hidden="true" />
                        {t("favoriteUse")}
                      </button>
                      <button
                        className="history-icon-action"
                        data-copied={copied}
                        type="button"
                        aria-label={copyLabel}
                        title={copyLabel}
                        onClick={() => void handleCopy(favorite)}
                      >
                        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                      </button>
                      <button
                        className="history-icon-action prompt-favorites-item__remove"
                        type="button"
                        aria-label={t("favoriteCancel")}
                        title={t("favoriteCancel")}
                        onClick={() => void handleRemove(favorite)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="prompt-favorites-panel__empty">
              <Bookmark className="size-5" aria-hidden="true" />
              <strong>{t("favoriteEmpty")}</strong>
              <p>{loadFailed ? t("favoriteLoadFailed") : t("favoriteEmptyHint")}</p>
            </div>
          )}
        </section>
      ) : null}

      {promptTooltip
        ? createPortal(
            <div
              className="prompt-favorites-tooltip"
              data-placement={promptTooltip.placement}
              id="prompt-favorites-tooltip"
              role="tooltip"
              style={
                {
                  "--tooltip-arrow-left": `${promptTooltip.arrowLeft}px`,
                  left: promptTooltip.left,
                  maxHeight: promptTooltip.maxHeight,
                  top: promptTooltip.top,
                  width: promptTooltip.width
                } as CSSProperties
              }
              onPointerEnter={clearTooltipHideTimeout}
              onPointerLeave={schedulePromptTooltipHide}
            >
              {promptTooltip.prompt}
            </div>,
            document.body
          )
        : null}

      <button
        aria-controls="prompt-favorites-panel"
        aria-expanded={isOpen}
        aria-label={isOpen ? t("favoritePanelClose") : t("favoritePanelOpen")}
        className="prompt-favorites-trigger"
        data-testid="prompt-favorites-trigger"
        type="button"
        onClick={handleToggle}
      >
        <Bookmark className="size-4" aria-hidden="true" />
        <span>{t("favoritePanelTitle")}</span>
        <strong>{t("favoritePanelCount", { count: totalCount })}</strong>
      </button>
    </div>
  );
}
