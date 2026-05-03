import { eq } from "drizzle-orm";
import type { SaveStorageConfigRequest, StorageConfigResponse, StorageTestResult } from "./contracts.js";
import { db } from "./database.js";
import {
  createCloudAssetStorageAdapter,
  extractR2AccountId,
  normalizeKeyPrefix,
  normalizeR2Endpoint,
  type CloudStorageAdapterConfig,
  type CosStorageAdapterConfig,
  type R2StorageAdapterConfig,
  storageErrorMessage
} from "./asset-storage.js";
import { storageConfigs } from "./schema.js";

const ACTIVE_STORAGE_CONFIG_ID = "active";
const DEFAULT_COS_BUCKET = process.env.COS_DEFAULT_BUCKET?.trim() || "source-1253253332";
const DEFAULT_COS_REGION = process.env.COS_DEFAULT_REGION?.trim() || "ap-nanjing";
const DEFAULT_COS_KEY_PREFIX = process.env.COS_DEFAULT_KEY_PREFIX?.trim() || "gpt-image-canvas/assets";
const DEFAULT_R2_BUCKET = process.env.R2_DEFAULT_BUCKET?.trim() || "";
const DEFAULT_R2_ACCOUNT_ID = process.env.R2_DEFAULT_ACCOUNT_ID?.trim() || "";
const DEFAULT_R2_ENDPOINT = normalizeR2Endpoint({
  accountId: DEFAULT_R2_ACCOUNT_ID,
  endpoint: process.env.R2_DEFAULT_ENDPOINT
});
const DEFAULT_R2_KEY_PREFIX = process.env.R2_DEFAULT_KEY_PREFIX?.trim() || DEFAULT_COS_KEY_PREFIX;

type StorageConfigRow = typeof storageConfigs.$inferSelect;

export function getStorageConfig(): StorageConfigResponse {
  return toStorageConfigResponse(getStorageConfigRow());
}

export function getActiveCosStorageConfig(): CosStorageAdapterConfig | undefined {
  const row = getStorageConfigRow();
  if (!row || row.enabled !== 1 || row.provider !== "cos" || !row.secretId || !row.secretKey || !row.bucket || !row.region) {
    return undefined;
  }

  return {
    provider: "cos",
    secretId: row.secretId,
    secretKey: row.secretKey,
    bucket: row.bucket,
    region: row.region,
    keyPrefix: normalizeKeyPrefix(row.keyPrefix ?? DEFAULT_COS_KEY_PREFIX)
  };
}

export function getActiveCloudStorageConfig(): CloudStorageAdapterConfig | undefined {
  const row = getStorageConfigRow();
  if (!row || row.enabled !== 1) {
    return undefined;
  }

  return row.provider === "r2" ? activeR2ConfigFromRow(row) : getActiveCosStorageConfig();
}

export async function saveStorageConfig(input: SaveStorageConfigRequest): Promise<StorageConfigResponse> {
  const now = new Date().toISOString();
  const existing = getStorageConfigRow();

  if (!input.enabled) {
    const disabledConfig = resolveStorageConfigForDisabledSave(input, existing);
    upsertStorageConfig({
      id: ACTIVE_STORAGE_CONFIG_ID,
      provider: disabledConfig.provider,
      enabled: 0,
      secretId: disabledConfig.secretId,
      secretKey: disabledConfig.secretKey,
      bucket: disabledConfig.bucket,
      region: disabledConfig.region,
      endpoint: disabledConfig.endpoint,
      keyPrefix: disabledConfig.keyPrefix,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    return getStorageConfig();
  }

  const parsed = resolveStorageConfigForSave(input, existing);
  await createCloudAssetStorageAdapter(parsed).testConfig();

  upsertStorageConfig({
    id: ACTIVE_STORAGE_CONFIG_ID,
    provider: parsed.provider,
    enabled: 1,
    secretId: parsed.provider === "cos" ? parsed.secretId : parsed.accessKeyId,
    secretKey: parsed.provider === "cos" ? parsed.secretKey : parsed.secretAccessKey,
    bucket: parsed.bucket,
    region: parsed.provider === "cos" ? parsed.region : "auto",
    endpoint: parsed.provider === "r2" ? parsed.endpoint : null,
    keyPrefix: parsed.keyPrefix,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });

  return getStorageConfig();
}

export async function testStorageConfig(input: SaveStorageConfigRequest): Promise<StorageTestResult> {
  try {
    const parsed = resolveStorageConfigForSave(input, getStorageConfigRow());
    await createCloudAssetStorageAdapter(parsed).testConfig();
    return {
      ok: true,
      message: parsed.provider === "cos" ? "COS configuration is available." : "Cloudflare R2 configuration is available."
    };
  } catch (error) {
    return {
      ok: false,
      message: storageErrorMessage(error)
    };
  }
}

function getStorageConfigRow(): StorageConfigRow | undefined {
  return db.select().from(storageConfigs).where(eq(storageConfigs.id, ACTIVE_STORAGE_CONFIG_ID)).get();
}

function upsertStorageConfig(row: StorageConfigRow): void {
  db.insert(storageConfigs)
    .values(row)
    .onConflictDoUpdate({
      target: storageConfigs.id,
      set: {
        provider: row.provider,
        enabled: row.enabled,
        secretId: row.secretId,
        secretKey: row.secretKey,
        bucket: row.bucket,
        region: row.region,
        endpoint: row.endpoint,
        keyPrefix: row.keyPrefix,
        updatedAt: row.updatedAt
      }
    })
    .run();
}

function resolveStorageConfigForSave(input: SaveStorageConfigRequest, existing: StorageConfigRow | undefined): CloudStorageAdapterConfig {
  if (input.provider === "cos") {
    return resolveCosConfigForSave(input, existing);
  }

  if (input.provider === "r2") {
    return resolveR2ConfigForSave(input, existing);
  }

  throw new Error("Unsupported cloud storage provider.");
}

function resolveStorageConfigForDisabledSave(
  input: SaveStorageConfigRequest,
  existing: StorageConfigRow | undefined
): Pick<StorageConfigRow, "provider" | "secretId" | "secretKey" | "bucket" | "region" | "endpoint" | "keyPrefix"> {
  const provider = input.provider ?? existing?.provider ?? "cos";
  if (provider === "r2") {
    const r2 = input.r2;
    const preserveExisting = existing?.provider === "r2";
    const endpoint =
      normalizeR2Endpoint({ accountId: r2?.accountId, endpoint: r2?.endpoint }) ||
      (preserveExisting ? existing.endpoint ?? "" : DEFAULT_R2_ENDPOINT);

    return {
      provider: "r2",
      secretId: optionalString(r2?.accessKeyId) ?? (preserveExisting ? existing.secretId : null),
      secretKey:
        r2?.preserveSecret && preserveExisting
          ? existing.secretKey
          : optionalString(r2?.secretAccessKey) ?? (preserveExisting ? existing.secretKey : null),
      bucket: optionalString(r2?.bucket) ?? (preserveExisting ? existing.bucket : DEFAULT_R2_BUCKET),
      region: "auto",
      endpoint: endpoint || null,
      keyPrefix: normalizeKeyPrefix(optionalString(r2?.keyPrefix) ?? (preserveExisting ? existing.keyPrefix ?? undefined : DEFAULT_R2_KEY_PREFIX))
    };
  }

  const cos = input.cos;
  const preserveExisting = existing?.provider === "cos";
  return {
    provider: "cos",
    secretId: optionalString(cos?.secretId) ?? (preserveExisting ? existing.secretId : null),
    secretKey:
      cos?.preserveSecret && preserveExisting
        ? existing.secretKey
        : optionalString(cos?.secretKey) ?? (preserveExisting ? existing.secretKey : null),
    bucket: optionalString(cos?.bucket) ?? (preserveExisting ? existing.bucket : DEFAULT_COS_BUCKET),
    region: optionalString(cos?.region) ?? (preserveExisting ? existing.region : DEFAULT_COS_REGION),
    endpoint: null,
    keyPrefix: normalizeKeyPrefix(optionalString(cos?.keyPrefix) ?? (preserveExisting ? existing.keyPrefix ?? undefined : DEFAULT_COS_KEY_PREFIX))
  };
}

function resolveCosConfigForSave(input: SaveStorageConfigRequest, existing: StorageConfigRow | undefined): CosStorageAdapterConfig {
  const cos = input.cos;
  if (!cos) {
    throw new Error("COS configuration is required.");
  }

  const secretId = requiredString(cos.secretId, "COS SecretId");
  const secretKey = cos.preserveSecret && existing?.provider === "cos" ? existing.secretKey : cos.secretKey;
  const bucket = requiredString(cos.bucket, "COS bucket");
  const region = requiredString(cos.region, "COS region");

  if (!secretKey?.trim()) {
    throw new Error("COS SecretKey is required.");
  }

  return {
    provider: "cos",
    secretId,
    secretKey: secretKey.trim(),
    bucket,
    region,
    keyPrefix: normalizeKeyPrefix(cos.keyPrefix)
  };
}

function resolveR2ConfigForSave(input: SaveStorageConfigRequest, existing: StorageConfigRow | undefined): R2StorageAdapterConfig {
  const r2 = input.r2;
  if (!r2) {
    throw new Error("R2 configuration is required.");
  }

  const accessKeyId = requiredString(r2.accessKeyId, "R2 Access Key ID");
  const secretAccessKey = r2.preserveSecret && existing?.provider === "r2" ? existing.secretKey : r2.secretAccessKey;
  const bucket = requiredString(r2.bucket, "R2 bucket");
  const endpoint = requiredString(normalizeR2Endpoint({ accountId: r2.accountId, endpoint: r2.endpoint }), "R2 endpoint");
  const accountId = r2.accountId.trim() || extractR2AccountId(endpoint);

  if (!secretAccessKey?.trim()) {
    throw new Error("R2 Secret Access Key is required.");
  }

  if (!accountId) {
    throw new Error("R2 Account ID is required unless a Cloudflare R2 endpoint is provided.");
  }

  return {
    provider: "r2",
    accessKeyId,
    secretAccessKey: secretAccessKey.trim(),
    accountId,
    endpoint,
    bucket,
    keyPrefix: normalizeKeyPrefix(r2.keyPrefix)
  };
}

function requiredString(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed;
}

function optionalString(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function toStorageConfigResponse(row: StorageConfigRow | undefined): StorageConfigResponse {
  const provider = row?.provider === "r2" ? "r2" : "cos";
  const r2Endpoint = row?.provider === "r2" ? row.endpoint ?? DEFAULT_R2_ENDPOINT : DEFAULT_R2_ENDPOINT;
  return {
    enabled: row?.enabled === 1,
    provider,
    cos: {
      secretId: row?.provider === "cos" ? row.secretId ?? "" : "",
      secretKey: {
        hasSecret: row?.provider === "cos" && Boolean(row.secretKey),
        value: row?.provider === "cos" && row.secretKey ? maskSecret(row.secretKey) : undefined
      },
      bucket: row?.provider === "cos" ? row.bucket ?? DEFAULT_COS_BUCKET : DEFAULT_COS_BUCKET,
      region: row?.provider === "cos" ? row.region ?? DEFAULT_COS_REGION : DEFAULT_COS_REGION,
      keyPrefix: normalizeKeyPrefix(row?.provider === "cos" ? row.keyPrefix ?? DEFAULT_COS_KEY_PREFIX : DEFAULT_COS_KEY_PREFIX)
    },
    r2: {
      accessKeyId: row?.provider === "r2" ? row.secretId ?? "" : "",
      secretAccessKey: {
        hasSecret: row?.provider === "r2" && Boolean(row.secretKey),
        value: row?.provider === "r2" && row.secretKey ? maskSecret(row.secretKey) : undefined
      },
      accountId: row?.provider === "r2" ? extractR2AccountId(r2Endpoint) : DEFAULT_R2_ACCOUNT_ID,
      endpoint: r2Endpoint,
      bucket: row?.provider === "r2" ? row.bucket ?? DEFAULT_R2_BUCKET : DEFAULT_R2_BUCKET,
      keyPrefix: normalizeKeyPrefix(row?.provider === "r2" ? row.keyPrefix ?? DEFAULT_R2_KEY_PREFIX : DEFAULT_R2_KEY_PREFIX)
    }
  };
}

function activeR2ConfigFromRow(row: StorageConfigRow): R2StorageAdapterConfig | undefined {
  if (!row.secretId || !row.secretKey || !row.bucket || !row.endpoint) {
    return undefined;
  }

  return {
    provider: "r2",
    accessKeyId: row.secretId,
    secretAccessKey: row.secretKey,
    accountId: extractR2AccountId(row.endpoint),
    endpoint: row.endpoint,
    bucket: row.bucket,
    keyPrefix: normalizeKeyPrefix(row.keyPrefix ?? DEFAULT_R2_KEY_PREFIX)
  };
}

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 4)}${"*".repeat(Math.min(8, Math.max(4, value.length - 8)))}${value.slice(-4)}`;
}
