import type { CloudStorageProvider } from "./image.js";
import type { MaskedSecret } from "./provider-config.js";

export interface CosStorageConfigView {
  secretId: string;
  secretKey: MaskedSecret;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface R2StorageConfigView {
  accessKeyId: string;
  secretAccessKey: MaskedSecret;
  accountId: string;
  endpoint: string;
  bucket: string;
  keyPrefix: string;
}

export interface StorageConfigResponse {
  enabled: boolean;
  provider: CloudStorageProvider;
  cos: CosStorageConfigView;
  r2: R2StorageConfigView;
}

export interface SaveCosStorageConfig {
  secretId: string;
  secretKey?: string;
  preserveSecret?: boolean;
  bucket: string;
  region: string;
  keyPrefix: string;
}

export interface SaveR2StorageConfig {
  accessKeyId: string;
  secretAccessKey?: string;
  preserveSecret?: boolean;
  accountId: string;
  endpoint: string;
  bucket: string;
  keyPrefix: string;
}

export interface SaveStorageConfigRequest {
  enabled: boolean;
  provider: CloudStorageProvider;
  cos?: SaveCosStorageConfig;
  r2?: SaveR2StorageConfig;
}

export interface StorageTestResult {
  ok: boolean;
  message: string;
}
