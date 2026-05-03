import { randomUUID } from "node:crypto";
import { rm, readFile, writeFile } from "node:fs/promises";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import COS from "cos-nodejs-sdk-v5";

export interface AssetStorageAdapter<TPutInput, TLocation> {
  putObject(input: TPutInput): Promise<AssetStoragePutResult>;
  getObject(location: TLocation): Promise<Buffer>;
  deleteObject(location: TLocation): Promise<void>;
}

export interface AssetStoragePutResult {
  etag?: string;
  requestId?: string;
}

export interface LocalAssetPutInput {
  filePath: string;
  bytes: Buffer;
}

export interface LocalAssetLocation {
  filePath: string;
}

export interface CosStorageAdapterConfig {
  provider: "cos";
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface R2StorageAdapterConfig {
  provider: "r2";
  accessKeyId: string;
  secretAccessKey: string;
  accountId: string;
  endpoint: string;
  bucket: string;
  keyPrefix: string;
}

export type CloudStorageAdapterConfig = CosStorageAdapterConfig | R2StorageAdapterConfig;

export interface CloudAssetPutInput {
  key: string;
  bytes: Buffer;
  mimeType: string;
}

export interface CloudAssetLocation {
  provider: CloudStorageAdapterConfig["provider"];
  bucket: string;
  region: string;
  key: string;
}

export class LocalAssetStorageAdapter implements AssetStorageAdapter<LocalAssetPutInput, LocalAssetLocation> {
  async putObject(input: LocalAssetPutInput): Promise<AssetStoragePutResult> {
    await writeFile(input.filePath, input.bytes);
    return {};
  }

  async getObject(location: LocalAssetLocation): Promise<Buffer> {
    return readFile(location.filePath);
  }

  async deleteObject(location: LocalAssetLocation): Promise<void> {
    await rm(location.filePath, { force: true });
  }
}

export class CosAssetStorageAdapter implements AssetStorageAdapter<CloudAssetPutInput, CloudAssetLocation> {
  private readonly client: COS;

  constructor(private readonly config: CosStorageAdapterConfig) {
    this.client = new COS({
      SecretId: config.secretId,
      SecretKey: config.secretKey,
      Protocol: "https:"
    });
  }

  async putObject(input: CloudAssetPutInput): Promise<AssetStoragePutResult> {
    const result = await this.client.putObject({
      Bucket: this.config.bucket,
      Region: this.config.region,
      Key: input.key,
      Body: input.bytes,
      ContentLength: input.bytes.length,
      ContentType: input.mimeType
    });

    return {
      etag: result.ETag,
      requestId: result.RequestId
    };
  }

  async getObject(location: CloudAssetLocation): Promise<Buffer> {
    const result = await this.client.getObject({
      Bucket: location.bucket,
      Region: location.region,
      Key: location.key
    });

    return Buffer.isBuffer(result.Body) ? result.Body : Buffer.from(result.Body);
  }

  async deleteObject(location: CloudAssetLocation): Promise<void> {
    await this.client.deleteObject({
      Bucket: location.bucket,
      Region: location.region,
      Key: location.key
    });
  }

  async testConfig(): Promise<void> {
    const key = buildCloudObjectKey(this.config.keyPrefix, `.storage-test-${randomUUID()}.txt`, new Date().toISOString());
    await this.putObject({
      key,
      bytes: Buffer.from("gpt-image-canvas storage test\n", "utf8"),
      mimeType: "text/plain; charset=utf-8"
    });
    await this.deleteObject({
      provider: "cos",
      bucket: this.config.bucket,
      region: this.config.region,
      key
    });
  }
}

export class R2AssetStorageAdapter implements AssetStorageAdapter<CloudAssetPutInput, CloudAssetLocation> {
  private readonly client: S3Client;

  constructor(private readonly config: R2StorageAdapterConfig) {
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  async putObject(input: CloudAssetPutInput): Promise<AssetStoragePutResult> {
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentLength: input.bytes.length,
        ContentType: input.mimeType
      })
    );

    return {
      etag: result.ETag,
      requestId: result.$metadata.requestId
    };
  }

  async getObject(location: CloudAssetLocation): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: location.bucket,
        Key: location.key
      })
    );

    if (!result.Body) {
      return Buffer.alloc(0);
    }

    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async deleteObject(location: CloudAssetLocation): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: location.bucket,
        Key: location.key
      })
    );
  }

  async testConfig(): Promise<void> {
    const key = buildCloudObjectKey(this.config.keyPrefix, `.storage-test-${randomUUID()}.txt`, new Date().toISOString());
    await this.putObject({
      key,
      bytes: Buffer.from("gpt-image-canvas storage test\n", "utf8"),
      mimeType: "text/plain; charset=utf-8"
    });
    await this.deleteObject({
      provider: "r2",
      bucket: this.config.bucket,
      region: "auto",
      key
    });
  }
}

export type CloudAssetStorageAdapter = CosAssetStorageAdapter | R2AssetStorageAdapter;

export function createCloudAssetStorageAdapter(config: CloudStorageAdapterConfig): CloudAssetStorageAdapter {
  return config.provider === "cos" ? new CosAssetStorageAdapter(config) : new R2AssetStorageAdapter(config);
}

export function buildCloudObjectKey(keyPrefix: string, fileName: string, createdAt: string): string {
  const date = new Date(createdAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = String(safeDate.getUTCFullYear()).padStart(4, "0");
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, "0");
  const normalizedPrefix = normalizeKeyPrefix(keyPrefix);
  return [normalizedPrefix, year, month, fileName].filter(Boolean).join("/");
}

export function normalizeKeyPrefix(value: string | undefined): string {
  const normalized = (value ?? "gpt-image-canvas/assets")
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "")
    .replace(/\/{2,}/gu, "/");

  return normalized || "gpt-image-canvas/assets";
}

export function r2EndpointFromAccountId(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function extractR2AccountId(endpoint: string | undefined): string {
  const match = endpoint?.trim().match(/^https:\/\/([a-z0-9]+)\.r2\.cloudflarestorage\.com\/?$/iu);
  return match?.[1] ?? "";
}

export function normalizeR2Endpoint(input: { accountId?: string; endpoint?: string }): string {
  const endpoint = input.endpoint?.trim().replace(/\/+$/u, "");
  if (endpoint) {
    return endpoint;
  }

  const accountId = input.accountId?.trim();
  if (!accountId) {
    return "";
  }

  return r2EndpointFromAccountId(accountId);
}

export function storageErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Cloud storage request failed.";
}
