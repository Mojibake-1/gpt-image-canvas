import { and, asc, desc, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import type {
  CreatePromptFavoriteGroupRequest,
  CreatePromptFavoriteRequest,
  PromptFavoriteGroup,
  PromptFavoriteItem,
  PromptFavoritesResponse,
  UpdatePromptFavoriteGroupRequest,
  UpdatePromptFavoriteRequest
} from "../contracts.js";
import { db } from "../../infrastructure/database.js";
import { promptFavoriteGroups, promptFavorites } from "../../infrastructure/schema.js";
import { getPromptPool } from "../prompt-pool/prompt-pool.js";

const DEFAULT_GROUP_NAME = "常用";
const MAX_GROUP_NAME_LENGTH = 32;

export class PromptFavoriteError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

// Each owner gets an isolated default group. Upstream used a single global row with
// primary key id="default"; that collides once favorites are owner-scoped. The id is
// derived deterministically from the owner email so it stays stable, owner-unique, and
// inside the normalizeId() charset.
function defaultGroupId(ownerEmail: string): string {
  return `default-${createHash("sha256").update(ownerEmail).digest("hex").slice(0, 32)}`;
}

export function listPromptFavorites(ownerEmail: string): PromptFavoritesResponse {
  ensureDefaultGroup(ownerEmail);
  return {
    groups: db
      .select()
      .from(promptFavoriteGroups)
      .where(eq(promptFavoriteGroups.ownerEmail, ownerEmail))
      .orderBy(asc(promptFavoriteGroups.sortOrder), asc(promptFavoriteGroups.createdAt))
      .all()
      .map(toPromptFavoriteGroup),
    favorites: db
      .select()
      .from(promptFavorites)
      .where(eq(promptFavorites.ownerEmail, ownerEmail))
      .orderBy(desc(promptFavorites.lastUsedAt), desc(promptFavorites.updatedAt), desc(promptFavorites.createdAt))
      .all()
      .map(toPromptFavoriteItem)
  };
}

export async function createPromptFavorite(ownerEmail: string, input: CreatePromptFavoriteRequest): Promise<PromptFavoriteItem> {
  const promptPoolItemId = normalizeId(input.promptPoolItemId);
  if (!promptPoolItemId) {
    throw new PromptFavoriteError("invalid_prompt_favorite", "Prompt pool item id is required.");
  }

  ensureDefaultGroup(ownerEmail);
  const groupId = normalizeGroupId(input.groupId) ?? defaultGroupId(ownerEmail);
  const group = getPromptFavoriteGroupRow(ownerEmail, groupId);
  if (!group) {
    throw new PromptFavoriteError("prompt_favorite_group_not_found", "Prompt favorite group was not found.", 404);
  }

  const pool = await getPromptPool();
  const item = pool.items.find((candidate) => candidate.id === promptPoolItemId);
  if (!item) {
    throw new PromptFavoriteError("prompt_pool_item_not_found", "Prompt pool item was not found.", 404);
  }

  const existing = getPromptFavoriteBySource(ownerEmail, "pool", item.id);
  const now = nowIso();
  if (existing) {
    db.update(promptFavorites)
      .set({
        groupId,
        title: item.title,
        prompt: item.prompt,
        model: item.model,
        mediaType: item.mediaType,
        assetUrl: item.assetUrl,
        imageWidth: item.imageWidth ?? null,
        imageHeight: item.imageHeight ?? null,
        sourceUrl: item.sourceUrl ?? null,
        updatedAt: now
      })
      .where(and(eq(promptFavorites.id, existing.id), eq(promptFavorites.ownerEmail, ownerEmail)))
      .run();
    return getPromptFavoriteById(ownerEmail, existing.id) ?? toPromptFavoriteItem(existing);
  }

  const id = `favorite-${randomUUID()}`;
  db.insert(promptFavorites)
    .values({
      id,
      ownerEmail,
      sourceType: "pool",
      sourceId: item.id,
      groupId,
      title: item.title,
      prompt: item.prompt,
      model: item.model,
      mediaType: item.mediaType,
      assetUrl: item.assetUrl,
      imageWidth: item.imageWidth ?? null,
      imageHeight: item.imageHeight ?? null,
      sourceUrl: item.sourceUrl ?? null,
      useCount: 0,
      lastUsedAt: null,
      createdAt: now,
      updatedAt: now
    })
    .run();

  return getPromptFavoriteById(ownerEmail, id) ?? {
    id,
    sourceType: "pool",
    sourceId: item.id,
    groupId,
    title: item.title,
    prompt: item.prompt,
    model: item.model,
    mediaType: item.mediaType,
    assetUrl: item.assetUrl,
    imageWidth: item.imageWidth,
    imageHeight: item.imageHeight,
    sourceUrl: item.sourceUrl,
    useCount: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function updatePromptFavorite(ownerEmail: string, favoriteId: string, input: UpdatePromptFavoriteRequest): PromptFavoriteItem {
  const id = normalizeId(favoriteId);
  if (!id) {
    throw new PromptFavoriteError("prompt_favorite_not_found", "Prompt favorite was not found.", 404);
  }

  const existing = getPromptFavoriteById(ownerEmail, id);
  if (!existing) {
    throw new PromptFavoriteError("prompt_favorite_not_found", "Prompt favorite was not found.", 404);
  }

  const groupId = normalizeGroupId(input.groupId);
  if (!groupId || !getPromptFavoriteGroupRow(ownerEmail, groupId)) {
    throw new PromptFavoriteError("prompt_favorite_group_not_found", "Prompt favorite group was not found.", 404);
  }

  db.update(promptFavorites)
    .set({
      groupId,
      updatedAt: nowIso()
    })
    .where(and(eq(promptFavorites.id, id), eq(promptFavorites.ownerEmail, ownerEmail)))
    .run();

  return getPromptFavoriteById(ownerEmail, id) ?? existing;
}

export function deletePromptFavorite(ownerEmail: string, favoriteId: string): void {
  const id = normalizeId(favoriteId);
  if (!id || !getPromptFavoriteById(ownerEmail, id)) {
    throw new PromptFavoriteError("prompt_favorite_not_found", "Prompt favorite was not found.", 404);
  }

  db.delete(promptFavorites).where(and(eq(promptFavorites.id, id), eq(promptFavorites.ownerEmail, ownerEmail))).run();
}

export function markPromptFavoriteUsed(ownerEmail: string, favoriteId: string): PromptFavoriteItem {
  const id = normalizeId(favoriteId);
  const existing = id ? getPromptFavoriteById(ownerEmail, id) : undefined;
  if (!existing) {
    throw new PromptFavoriteError("prompt_favorite_not_found", "Prompt favorite was not found.", 404);
  }

  const now = nowIso();
  db.update(promptFavorites)
    .set({
      useCount: existing.useCount + 1,
      lastUsedAt: now,
      updatedAt: now
    })
    .where(and(eq(promptFavorites.id, existing.id), eq(promptFavorites.ownerEmail, ownerEmail)))
    .run();

  return getPromptFavoriteById(ownerEmail, existing.id) ?? {
    ...existing,
    useCount: existing.useCount + 1,
    lastUsedAt: now,
    updatedAt: now
  };
}

export function createPromptFavoriteGroup(ownerEmail: string, input: CreatePromptFavoriteGroupRequest): PromptFavoriteGroup {
  const name = normalizeGroupName(input.name);
  if (!name) {
    throw new PromptFavoriteError("invalid_prompt_favorite_group", "Prompt favorite group name is required.");
  }

  const existing = getPromptFavoriteGroups(ownerEmail).find((group) => group.name === name);
  if (existing) {
    return toPromptFavoriteGroup(existing);
  }

  const now = nowIso();
  const id = `group-${randomUUID()}`;
  const sortOrder = nextGroupSortOrder(ownerEmail);
  db.insert(promptFavoriteGroups)
    .values({
      id,
      ownerEmail,
      name,
      sortOrder,
      createdAt: now,
      updatedAt: now
    })
    .run();

  return getPromptFavoriteGroup(ownerEmail, id) ?? {
    id,
    name,
    sortOrder,
    isDefault: false,
    createdAt: now,
    updatedAt: now
  };
}

export function updatePromptFavoriteGroup(ownerEmail: string, groupIdValue: string, input: UpdatePromptFavoriteGroupRequest): PromptFavoriteGroup {
  const groupId = normalizeGroupId(groupIdValue);
  if (!groupId) {
    throw new PromptFavoriteError("prompt_favorite_group_not_found", "Prompt favorite group was not found.", 404);
  }

  const existing = getPromptFavoriteGroupRow(ownerEmail, groupId);
  if (!existing) {
    throw new PromptFavoriteError("prompt_favorite_group_not_found", "Prompt favorite group was not found.", 404);
  }

  const name = normalizeGroupName(input.name);
  if (!name) {
    throw new PromptFavoriteError("invalid_prompt_favorite_group", "Prompt favorite group name is required.");
  }

  db.update(promptFavoriteGroups)
    .set({
      name,
      updatedAt: nowIso()
    })
    .where(and(eq(promptFavoriteGroups.id, groupId), eq(promptFavoriteGroups.ownerEmail, ownerEmail)))
    .run();

  return getPromptFavoriteGroup(ownerEmail, groupId) ?? toPromptFavoriteGroup(existing);
}

export function deletePromptFavoriteGroup(ownerEmail: string, groupIdValue: string): void {
  const groupId = normalizeGroupId(groupIdValue);
  if (!groupId) {
    throw new PromptFavoriteError("prompt_favorite_group_not_found", "Prompt favorite group was not found.", 404);
  }

  const existing = getPromptFavoriteGroupRow(ownerEmail, groupId);
  if (!existing) {
    throw new PromptFavoriteError("prompt_favorite_group_not_found", "Prompt favorite group was not found.", 404);
  }

  if (groupId === defaultGroupId(ownerEmail)) {
    throw new PromptFavoriteError("prompt_favorite_default_group", "The default prompt favorite group cannot be deleted.");
  }

  ensureDefaultGroup(ownerEmail);
  const now = nowIso();
  db.update(promptFavorites)
    .set({
      groupId: defaultGroupId(ownerEmail),
      updatedAt: now
    })
    .where(and(eq(promptFavorites.groupId, groupId), eq(promptFavorites.ownerEmail, ownerEmail)))
    .run();
  db.delete(promptFavoriteGroups).where(and(eq(promptFavoriteGroups.id, groupId), eq(promptFavoriteGroups.ownerEmail, ownerEmail))).run();
}

function ensureDefaultGroup(ownerEmail: string): void {
  const id = defaultGroupId(ownerEmail);
  if (getPromptFavoriteGroupRow(ownerEmail, id)) {
    return;
  }

  const now = nowIso();
  db.insert(promptFavoriteGroups)
    .values({
      id,
      ownerEmail,
      name: DEFAULT_GROUP_NAME,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoNothing()
    .run();
}

function getPromptFavoriteById(ownerEmail: string, id: string): PromptFavoriteItem | undefined {
  const row = db.select().from(promptFavorites).where(and(eq(promptFavorites.id, id), eq(promptFavorites.ownerEmail, ownerEmail))).get();
  return row ? toPromptFavoriteItem(row) : undefined;
}

function getPromptFavoriteBySource(ownerEmail: string, sourceType: "pool", sourceId: string): (typeof promptFavorites.$inferSelect) | undefined {
  return db
    .select()
    .from(promptFavorites)
    .where(and(eq(promptFavorites.ownerEmail, ownerEmail), eq(promptFavorites.sourceType, sourceType), eq(promptFavorites.sourceId, sourceId)))
    .get();
}

function getPromptFavoriteGroup(ownerEmail: string, id: string): PromptFavoriteGroup | undefined {
  const row = getPromptFavoriteGroupRow(ownerEmail, id);
  return row ? toPromptFavoriteGroup(row) : undefined;
}

function getPromptFavoriteGroupRow(ownerEmail: string, id: string): (typeof promptFavoriteGroups.$inferSelect) | undefined {
  return db.select().from(promptFavoriteGroups).where(and(eq(promptFavoriteGroups.id, id), eq(promptFavoriteGroups.ownerEmail, ownerEmail))).get();
}

function getPromptFavoriteGroups(ownerEmail: string): Array<typeof promptFavoriteGroups.$inferSelect> {
  ensureDefaultGroup(ownerEmail);
  return db.select().from(promptFavoriteGroups).where(eq(promptFavoriteGroups.ownerEmail, ownerEmail)).orderBy(asc(promptFavoriteGroups.sortOrder)).all();
}

function nextGroupSortOrder(ownerEmail: string): number {
  const groups = getPromptFavoriteGroups(ownerEmail);
  return Math.max(0, ...groups.map((group) => group.sortOrder)) + 100;
}

function toPromptFavoriteGroup(row: typeof promptFavoriteGroups.$inferSelect): PromptFavoriteGroup {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    isDefault: row.id === defaultGroupId(row.ownerEmail),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toPromptFavoriteItem(row: typeof promptFavorites.$inferSelect): PromptFavoriteItem {
  return {
    id: row.id,
    sourceType: "pool",
    sourceId: row.sourceId,
    groupId: row.groupId,
    title: row.title,
    prompt: row.prompt,
    model: row.model,
    mediaType: row.mediaType === "video" ? "video" : "image",
    assetUrl: row.assetUrl,
    imageWidth: row.imageWidth ?? undefined,
    imageHeight: row.imageHeight ?? undefined,
    sourceUrl: row.sourceUrl ?? undefined,
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function normalizeGroupName(value: string | undefined): string | undefined {
  const name = value?.trim().replace(/\s+/gu, " ");
  return name ? name.slice(0, MAX_GROUP_NAME_LENGTH) : undefined;
}

function normalizeGroupId(value: string | undefined): string | undefined {
  return normalizeId(value);
}

function normalizeId(value: string | undefined): string | undefined {
  const id = value?.trim();
  return id && /^[a-zA-Z0-9:_-]{1,160}$/u.test(id) ? id : undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}
