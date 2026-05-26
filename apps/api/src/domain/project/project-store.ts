import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  GeneratedAsset,
  GalleryImageItem,
  GalleryResponse,
  GenerationRecord as ApiGenerationRecord,
  GenerationStatus,
  ImageMode,
  ImageQuality,
  OutputFormat,
  OutputStatus,
  ProjectState
} from "../contracts.js";
import { db } from "../../infrastructure/database.js";
import { assets, generationOutputs, generationRecords, generationReferenceAssets, projects } from "../../infrastructure/schema.js";

export const DEFAULT_PROJECT_ID = "default";
const DEFAULT_PROJECT_NAME = "Default Project";
const fallbackWarnings = new Set<string>();

interface ProjectSnapshotInput {
  name?: string;
  snapshotJson: string;
}

export interface GalleryExportAsset {
  outputId: string;
  assetId: string;
  fileName: string;
  mimeType: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseSnapshot(snapshotJson: string): unknown | null {
  return JSON.parse(snapshotJson) as unknown;
}

export function ensureDefaultProject(): void {
  ensureProjectForOwner(DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME);
}

export function ensureProjectForOwner(ownerEmail: string, projectName = DEFAULT_PROJECT_NAME): void {
  const existing = getProjectRow(ownerEmail);

  if (existing) {
    return;
  }
  if (projectRowExists(ownerEmail)) {
    return;
  }

  const createdAt = nowIso();
  db.insert(projects)
    .values({
      id: ownerEmail,
      ownerEmail,
      name: projectName,
      snapshotJson: "null",
      createdAt,
      updatedAt: createdAt
    })
    .run();
}

export function saveProjectSnapshot(input: ProjectSnapshotInput, ownerEmail = DEFAULT_PROJECT_ID): ProjectState {
  ensureProjectForOwner(ownerEmail);

  const updatedAt = nowIso();
  const current = getProjectRow(ownerEmail);

  db.update(projects)
    .set({
      name: input.name ?? current?.name ?? DEFAULT_PROJECT_NAME,
      snapshotJson: input.snapshotJson,
      updatedAt
    })
    .where(eq(projects.id, ownerEmail))
    .run();

  return getProjectState(ownerEmail);
}

export function getProjectState(ownerEmail = DEFAULT_PROJECT_ID): ProjectState {
  ensureProjectForOwner(ownerEmail);

  const project = getProjectRow(ownerEmail);

  if (!project) {
    return {
      id: ownerEmail,
      name: DEFAULT_PROJECT_NAME,
      snapshot: null,
      history: getGenerationHistory(ownerEmail),
      updatedAt: nowIso()
    };
  }

  return {
    id: project.id,
    name: project.name,
    snapshot: parseSnapshot(project.snapshotJson),
    history: getGenerationHistory(ownerEmail),
    updatedAt: project.updatedAt
  };
}

export function getGalleryImages(ownerEmail = DEFAULT_PROJECT_ID): GalleryResponse {
  const rows = db
    .select({
      output: generationOutputs,
      generation: generationRecords,
      asset: assets
    })
    .from(generationOutputs)
    .innerJoin(generationRecords, eq(generationOutputs.generationId, generationRecords.id))
    .innerJoin(assets, eq(generationOutputs.assetId, assets.id))
    .where(and(eq(generationOutputs.status, "succeeded"), eq(generationRecords.ownerEmail, ownerEmail), eq(assets.ownerEmail, ownerEmail)))
    .orderBy(desc(generationOutputs.createdAt))
    .all();

  return {
    items: rows.map(({ output, generation, asset }) => ({
      outputId: output.id,
      generationId: generation.id,
      mode: generation.mode as ImageMode,
      prompt: generation.prompt,
      effectivePrompt: generation.effectivePrompt,
      presetId: generation.presetId,
      size: {
        width: generation.width,
        height: generation.height
      },
      quality: generation.quality as ImageQuality,
      outputFormat: generation.outputFormat as OutputFormat,
      createdAt: output.createdAt,
      asset: toGeneratedAsset(asset)
    })).filter((item): item is GalleryImageItem => Boolean(item.asset))
  };
}

export function deleteGalleryOutput(outputId: string, ownerEmail = DEFAULT_PROJECT_ID): boolean {
  const row = db
    .select({ id: generationOutputs.id })
    .from(generationOutputs)
    .innerJoin(generationRecords, eq(generationOutputs.generationId, generationRecords.id))
    .where(and(eq(generationOutputs.id, outputId), eq(generationRecords.ownerEmail, ownerEmail)))
    .get();
  if (!row) {
    return false;
  }

  const result = db.delete(generationOutputs).where(eq(generationOutputs.id, outputId)).run();
  return result.changes > 0;
}

export function getGalleryExportAssets(outputIds: string[], ownerEmail = DEFAULT_PROJECT_ID): GalleryExportAsset[] {
  if (outputIds.length === 0) {
    return [];
  }

  const rows = db
    .select({
      outputId: generationOutputs.id,
      assetId: assets.id,
      fileName: assets.fileName,
      mimeType: assets.mimeType
    })
    .from(generationOutputs)
    .innerJoin(generationRecords, eq(generationOutputs.generationId, generationRecords.id))
    .innerJoin(assets, eq(generationOutputs.assetId, assets.id))
    .where(
      and(
        inArray(generationOutputs.id, outputIds),
        eq(generationOutputs.status, "succeeded"),
        eq(generationRecords.ownerEmail, ownerEmail),
        eq(assets.ownerEmail, ownerEmail)
      )
    )
    .all();

  const rowByOutputId = new Map(rows.map((row) => [row.outputId, row]));
  return outputIds.flatMap((outputId) => {
    const row = rowByOutputId.get(outputId);
    return row ? [row] : [];
  });
}

function getProjectRow(ownerEmail: string): (typeof projects.$inferSelect) | undefined {
  try {
    return db.select().from(projects).where(eq(projects.id, ownerEmail)).get();
  } catch (error) {
    warnOnce(
      "project-read-fallback",
      `Project row could not be read; returning a blank canvas fallback. ${formatErrorSummary(error)}`
    );
    return undefined;
  }
}

function projectRowExists(ownerEmail: string): boolean {
  try {
    const row = db.select({ id: projects.id }).from(projects).where(eq(projects.id, ownerEmail)).get();
    return Boolean(row);
  } catch {
    return true;
  }
}

function getGenerationHistory(ownerEmail: string): ApiGenerationRecord[] {
  try {
    return readGenerationHistory(ownerEmail);
  } catch (error) {
    warnOnce(
      "history-read-fallback",
      `Generation history could not be read; returning an empty history. ${formatErrorSummary(error)}`
    );
    return [];
  }
}

function warnOnce(key: string, message: string): void {
  if (fallbackWarnings.has(key)) {
    return;
  }

  fallbackWarnings.add(key);
  console.warn(message);
}

function formatErrorSummary(error: unknown): string {
  if (error instanceof Error) {
    const codeValue = (error as { code?: unknown }).code;
    const code = typeof codeValue === "string" ? `${codeValue}: ` : "";
    return `${code}${error.message}`;
  }

  return String(error);
}

function readGenerationHistory(ownerEmail: string): ApiGenerationRecord[] {
  const records = db.select().from(generationRecords).where(eq(generationRecords.ownerEmail, ownerEmail)).orderBy(desc(generationRecords.createdAt)).limit(20).all();
  if (records.length === 0) {
    return [];
  }

  const generationIds = records.map((record) => record.id);
  const outputs = db
    .select()
    .from(generationOutputs)
    .where(inArray(generationOutputs.generationId, generationIds))
    .orderBy(generationOutputs.createdAt)
    .all();
  const referenceRows = db
    .select()
    .from(generationReferenceAssets)
    .where(inArray(generationReferenceAssets.generationId, generationIds))
    .all()
    .sort((left, right) =>
      left.generationId === right.generationId
        ? left.position - right.position
        : left.generationId.localeCompare(right.generationId)
    );

  const assetIds = outputs.flatMap((output) => (output.assetId ? [output.assetId] : []));
  const assetRows =
    assetIds.length > 0 ? db.select().from(assets).where(inArray(assets.id, assetIds)).all() : [];
  const assetById = new Map(assetRows.map((asset) => [asset.id, asset]));

  const outputsByGenerationId = new Map<string, typeof outputs>();
  for (const output of outputs) {
    const existing = outputsByGenerationId.get(output.generationId) ?? [];
    existing.push(output);
    outputsByGenerationId.set(output.generationId, existing);
  }
  const referenceAssetIdsByGenerationId = new Map<string, string[]>();
  for (const referenceRow of referenceRows) {
    const existing = referenceAssetIdsByGenerationId.get(referenceRow.generationId) ?? [];
    existing.push(referenceRow.assetId);
    referenceAssetIdsByGenerationId.set(referenceRow.generationId, existing);
  }

  return records.map((record) => {
    const mappedOutputs = (outputsByGenerationId.get(record.id) ?? []).map((output) => ({
      id: output.id,
      status: output.status as OutputStatus,
      asset: output.assetId ? toGeneratedAsset(assetById.get(output.assetId)) : undefined,
      error: output.error ?? undefined
    }));

    return {
      id: record.id,
      mode: record.mode as ImageMode,
      prompt: record.prompt,
      effectivePrompt: record.effectivePrompt,
      presetId: record.presetId,
      size: {
        width: record.width,
        height: record.height
      },
      quality: record.quality as ImageQuality,
      outputFormat: record.outputFormat as OutputFormat,
      count: record.count,
      status: record.status as GenerationStatus,
      error: record.error ?? undefined,
      referenceAssetIds: referenceAssetIdsByGenerationId.get(record.id) ?? (record.referenceAssetId ? [record.referenceAssetId] : undefined),
      referenceAssetId: record.referenceAssetId ?? undefined,
      createdAt: record.createdAt,
      outputs: mappedOutputs
    };
  });
}

function toGeneratedAsset(asset: (typeof assets.$inferSelect) | undefined): GeneratedAsset | undefined {
  if (!asset) {
    return undefined;
  }

  return {
    id: asset.id,
    url: `/api/assets/${asset.id}`,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    cloud:
      (asset.cloudProvider === "cos" || asset.cloudProvider === "s3") && (asset.cloudStatus === "uploaded" || asset.cloudStatus === "failed")
        ? {
            provider: asset.cloudProvider,
            status: asset.cloudStatus,
            lastError: asset.cloudError ?? undefined,
            uploadedAt: asset.cloudUploadedAt ?? undefined
          }
        : undefined
  };
}
