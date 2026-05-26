import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureRuntimeStorage, runtimePaths, sqliteConfig } from "./runtime.js";
import * as schema from "./schema.js";

ensureRuntimeStorage();

const DEFAULT_AGENT_LLM_TIMEOUT_MS = 300000;

const sqlite = new Database(runtimePaths.databaseFile);
configureSqlite(sqlite);

function configureSqlite(database: Database.Database): void {
  database.pragma(`locking_mode = ${sqliteConfig.lockingMode}`);
  database.pragma("foreign_keys = ON");
  applyJournalMode(database);
}

function applyJournalMode(database: Database.Database): void {
  try {
    database.pragma(`journal_mode = ${sqliteConfig.journalMode}`);
  } catch (error) {
    if (sqliteConfig.journalMode !== "WAL" || !isSharedMemoryOpenError(error)) {
      throw error;
    }

    console.warn("SQLite WAL mode is unavailable for DATA_DIR; falling back to DELETE journal mode.");
    database.pragma("locking_mode = EXCLUSIVE");
    database.pragma("journal_mode = DELETE");
  }
}

function isSharedMemoryOpenError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "SQLITE_IOERR_SHMOPEN"
  );
}

sqlite.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  owner_email TEXT,
  name TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  owner_email TEXT,
  file_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  cloud_provider TEXT,
  cloud_bucket TEXT,
  cloud_region TEXT,
  cloud_object_key TEXT,
  cloud_status TEXT,
  cloud_error TEXT,
  cloud_uploaded_at TEXT,
  cloud_etag TEXT,
  cloud_request_id TEXT,
  cloud_endpoint TEXT,
  cloud_force_path_style INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_configs (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  secret_id TEXT,
  secret_key TEXT,
  bucket TEXT,
  region TEXT,
  key_prefix TEXT,
  endpoint_mode TEXT,
  account_id TEXT,
  endpoint TEXT,
  force_path_style INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_configs (
  id TEXT PRIMARY KEY NOT NULL,
  source_order_json TEXT NOT NULL,
  local_api_key TEXT,
  local_base_url TEXT,
  local_model TEXT,
  local_timeout_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_llm_configs (
  id TEXT PRIMARY KEY NOT NULL,
  api_key TEXT,
  base_url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  timeout_ms INTEGER NOT NULL DEFAULT 300000,
  supports_vision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  context_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_skills (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  version TEXT,
  source TEXT,
  enabled INTEGER NOT NULL,
  built_in INTEGER NOT NULL,
  is_required INTEGER NOT NULL,
  trigger_mode TEXT NOT NULL,
  trigger_keywords_json TEXT NOT NULL,
  files_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS codex_oauth_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  email TEXT,
  account_id TEXT,
  expires_at TEXT,
  refreshed_at TEXT,
  unavailable_at TEXT,
  unavailable_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_records (
  id TEXT PRIMARY KEY NOT NULL,
  owner_email TEXT,
  mode TEXT NOT NULL,
  prompt TEXT NOT NULL,
  effective_prompt TEXT NOT NULL,
  preset_id TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  quality TEXT NOT NULL,
  output_format TEXT NOT NULL,
  count INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  reference_asset_id TEXT REFERENCES assets(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_outputs (
  id TEXT PRIMARY KEY NOT NULL,
  generation_id TEXT NOT NULL REFERENCES generation_records(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  asset_id TEXT REFERENCES assets(id),
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_reference_assets (
  generation_id TEXT NOT NULL REFERENCES generation_records(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (generation_id, position)
);

CREATE INDEX IF NOT EXISTS generation_records_created_at_idx ON generation_records(created_at);
CREATE INDEX IF NOT EXISTS generation_outputs_generation_id_idx ON generation_outputs(generation_id);
CREATE INDEX IF NOT EXISTS generation_outputs_asset_id_idx ON generation_outputs(asset_id);
CREATE INDEX IF NOT EXISTS generation_reference_assets_generation_id_idx ON generation_reference_assets(generation_id);
CREATE INDEX IF NOT EXISTS generation_reference_assets_asset_id_idx ON generation_reference_assets(asset_id);
CREATE INDEX IF NOT EXISTS agent_conversations_updated_at_idx ON agent_conversations(updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS agent_skills_slug_idx ON agent_skills(slug);
`);

ensureColumn("projects", "owner_email", "owner_email TEXT");
ensureColumn("assets", "owner_email", "owner_email TEXT");
ensureColumn("assets", "cloud_provider", "cloud_provider TEXT");
ensureColumn("assets", "cloud_bucket", "cloud_bucket TEXT");
ensureColumn("assets", "cloud_region", "cloud_region TEXT");
ensureColumn("assets", "cloud_object_key", "cloud_object_key TEXT");
ensureColumn("assets", "cloud_status", "cloud_status TEXT");
ensureColumn("assets", "cloud_error", "cloud_error TEXT");
ensureColumn("assets", "cloud_uploaded_at", "cloud_uploaded_at TEXT");
ensureColumn("assets", "cloud_etag", "cloud_etag TEXT");
ensureColumn("assets", "cloud_request_id", "cloud_request_id TEXT");
ensureColumn("assets", "cloud_endpoint", "cloud_endpoint TEXT");
ensureColumn("assets", "cloud_force_path_style", "cloud_force_path_style INTEGER");
ensureColumn("storage_configs", "endpoint_mode", "endpoint_mode TEXT");
ensureColumn("storage_configs", "account_id", "account_id TEXT");
ensureColumn("storage_configs", "endpoint", "endpoint TEXT");
ensureColumn("storage_configs", "force_path_style", "force_path_style INTEGER");
ensureColumn("codex_oauth_tokens", "access_token", "access_token TEXT");
ensureColumn("codex_oauth_tokens", "refresh_token", "refresh_token TEXT");
ensureColumn("codex_oauth_tokens", "id_token", "id_token TEXT");
ensureColumn("codex_oauth_tokens", "email", "email TEXT");
ensureColumn("codex_oauth_tokens", "account_id", "account_id TEXT");
ensureColumn("codex_oauth_tokens", "expires_at", "expires_at TEXT");
ensureColumn("codex_oauth_tokens", "refreshed_at", "refreshed_at TEXT");
ensureColumn("codex_oauth_tokens", "unavailable_at", "unavailable_at TEXT");
ensureColumn("codex_oauth_tokens", "unavailable_reason", "unavailable_reason TEXT");
ensureColumn("provider_configs", "source_order_json", "source_order_json TEXT NOT NULL DEFAULT '[\"env-openai\",\"local-openai\",\"codex\"]'");
ensureColumn("provider_configs", "local_api_key", "local_api_key TEXT");
ensureColumn("provider_configs", "local_base_url", "local_base_url TEXT");
ensureColumn("provider_configs", "local_model", "local_model TEXT");
ensureColumn("provider_configs", "local_timeout_ms", "local_timeout_ms INTEGER");
ensureColumn("agent_llm_configs", "api_key", "api_key TEXT");
ensureColumn("agent_llm_configs", "base_url", "base_url TEXT NOT NULL DEFAULT ''");
ensureColumn("agent_llm_configs", "model", "model TEXT NOT NULL DEFAULT ''");
ensureColumn("agent_llm_configs", "timeout_ms", "timeout_ms INTEGER NOT NULL DEFAULT 300000");
ensureColumn("agent_llm_configs", "supports_vision", "supports_vision INTEGER NOT NULL DEFAULT 0");
ensureColumn("agent_skills", "slug", "slug TEXT NOT NULL DEFAULT ''");
ensureColumn("agent_skills", "name", "name TEXT NOT NULL DEFAULT ''");
ensureColumn("agent_skills", "description", "description TEXT NOT NULL DEFAULT ''");
ensureColumn("agent_skills", "version", "version TEXT");
ensureColumn("agent_skills", "source", "source TEXT");
ensureColumn("agent_skills", "enabled", "enabled INTEGER NOT NULL DEFAULT 1");
ensureColumn("agent_skills", "built_in", "built_in INTEGER NOT NULL DEFAULT 0");
ensureColumn("agent_skills", "is_required", "is_required INTEGER NOT NULL DEFAULT 0");
ensureColumn("agent_skills", "trigger_mode", "trigger_mode TEXT NOT NULL DEFAULT 'auto'");
ensureColumn("agent_skills", "trigger_keywords_json", "trigger_keywords_json TEXT NOT NULL DEFAULT '[]'");
ensureColumn("agent_skills", "files_json", "files_json TEXT NOT NULL DEFAULT '{}'");
ensureColumn("generation_records", "owner_email", "owner_email TEXT");

sqlite.exec("CREATE INDEX IF NOT EXISTS generation_records_owner_created_at_idx ON generation_records(owner_email, created_at)");

migrateStorageConfigRows();
backfillGenerationReferenceAssets();
ensureProviderConfigRow();
ensureAgentLlmConfigRow();

export const db = drizzle(sqlite, { schema });

export function closeDatabase(): void {
  sqlite.close();
}

function ensureColumn(tableName: string, columnName: string, definition: string): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
}

function migrateStorageConfigRows(): void {
  migrateLegacyR2StorageConfigRows();

  const active = sqlite.prepare("SELECT * FROM storage_configs WHERE id = ?").get("active") as StorageConfigSqlRow | undefined;
  if (active) {
    const cos = sqlite.prepare("SELECT id FROM storage_configs WHERE id = ?").get("cos");
    if (!cos) {
      sqlite
        .prepare(
          `INSERT INTO storage_configs
            (id, provider, enabled, secret_id, secret_key, bucket, region, key_prefix, endpoint_mode, account_id, endpoint, force_path_style, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "cos",
          "cos",
          active.enabled,
          active.secret_id,
          active.secret_key,
          active.bucket,
          active.region,
          active.key_prefix,
          null,
          null,
          null,
          null,
          active.created_at,
          active.updated_at
        );
    }

    sqlite.prepare("DELETE FROM storage_configs WHERE id = ?").run("active");
  }

  const enabledRows = sqlite
    .prepare("SELECT id FROM storage_configs WHERE enabled = 1 ORDER BY updated_at DESC, id ASC")
    .all() as Array<{ id: string }>;
  for (const row of enabledRows.slice(1)) {
    sqlite.prepare("UPDATE storage_configs SET enabled = 0 WHERE id = ?").run(row.id);
  }
}

interface StorageConfigSqlRow {
  id: string;
  provider: string;
  enabled: number;
  secret_id: string | null;
  secret_key: string | null;
  bucket: string | null;
  region: string | null;
  key_prefix: string | null;
  endpoint_mode: string | null;
  account_id: string | null;
  endpoint: string | null;
  force_path_style: number | null;
  created_at: string;
  updated_at: string;
}

function migrateLegacyR2StorageConfigRows(): void {
  const legacyR2Rows = sqlite
    .prepare("SELECT * FROM storage_configs WHERE provider = ? OR id = ? ORDER BY enabled DESC, updated_at DESC, id ASC")
    .all("r2", "r2") as StorageConfigSqlRow[];
  const legacyR2 = legacyR2Rows[0];
  if (!legacyR2) {
    return;
  }

  const existingS3 = sqlite.prepare("SELECT * FROM storage_configs WHERE id = ?").get("s3") as StorageConfigSqlRow | undefined;
  const endpoint = normalizeLegacyR2Endpoint(legacyR2.endpoint);
  const accountId = endpoint ? extractR2AccountId(endpoint) : null;
  const forcePathStyle = 0;

  if (!existingS3 || legacyR2.enabled === 1) {
    upsertRawStorageConfigRow({
      id: "s3",
      provider: "s3",
      enabled: legacyR2.enabled,
      secret_id: legacyR2.secret_id,
      secret_key: legacyR2.secret_key,
      bucket: legacyR2.bucket,
      region: legacyR2.region?.trim() || "auto",
      key_prefix: legacyR2.key_prefix,
      endpoint_mode: accountId ? "r2-account" : "custom",
      account_id: accountId,
      endpoint,
      force_path_style: forcePathStyle,
      created_at: existingS3?.created_at ?? legacyR2.created_at,
      updated_at: legacyR2.updated_at
    });
  }

  const migratedEndpoint = endpoint ?? existingS3?.endpoint ?? null;
  sqlite
    .prepare(
      `UPDATE assets
       SET cloud_provider = ?,
           cloud_endpoint = COALESCE(NULLIF(cloud_endpoint, ''), ?),
           cloud_force_path_style = COALESCE(cloud_force_path_style, ?)
       WHERE cloud_provider = ?`
    )
    .run("s3", migratedEndpoint, forcePathStyle, "r2");

  for (const row of legacyR2Rows) {
    if (row.id !== "s3") {
      sqlite.prepare("DELETE FROM storage_configs WHERE id = ?").run(row.id);
    }
  }
}

function upsertRawStorageConfigRow(row: StorageConfigSqlRow): void {
  sqlite
    .prepare(
      `INSERT INTO storage_configs
        (id, provider, enabled, secret_id, secret_key, bucket, region, key_prefix, endpoint_mode, account_id, endpoint, force_path_style, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         provider = excluded.provider,
         enabled = excluded.enabled,
         secret_id = excluded.secret_id,
         secret_key = excluded.secret_key,
         bucket = excluded.bucket,
         region = excluded.region,
         key_prefix = excluded.key_prefix,
         endpoint_mode = excluded.endpoint_mode,
         account_id = excluded.account_id,
         endpoint = excluded.endpoint,
         force_path_style = excluded.force_path_style,
         updated_at = excluded.updated_at`
    )
    .run(
      row.id,
      row.provider,
      row.enabled,
      row.secret_id,
      row.secret_key,
      row.bucket,
      row.region,
      row.key_prefix,
      row.endpoint_mode,
      row.account_id,
      row.endpoint,
      row.force_path_style,
      row.created_at,
      row.updated_at
    );
}

function normalizeLegacyR2Endpoint(endpoint: string | null): string | null {
  const trimmed = endpoint?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/u, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return trimmed;
  }
}

function extractR2AccountId(endpoint: string): string | null {
  try {
    const hostname = new URL(endpoint).hostname;
    const match = /^([a-z0-9]+)\.r2\.cloudflarestorage\.com$/iu.exec(hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function backfillGenerationReferenceAssets(): void {
  sqlite.exec(`
    INSERT OR IGNORE INTO generation_reference_assets (generation_id, asset_id, position, created_at)
    SELECT generation_records.id, generation_records.reference_asset_id, 0, generation_records.created_at
    FROM generation_records
    WHERE generation_records.reference_asset_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM assets
        WHERE assets.id = generation_records.reference_asset_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM generation_reference_assets
        WHERE generation_reference_assets.generation_id = generation_records.id
      )
  `);
}

function ensureProviderConfigRow(): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO provider_configs (id, source_order_json, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    )
    .run("active", JSON.stringify(["env-openai", "local-openai", "codex"]), now, now);
}

function ensureAgentLlmConfigRow(): void {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO agent_llm_configs
        (id, api_key, base_url, model, timeout_ms, supports_vision, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run("active", null, "", "", DEFAULT_AGENT_LLM_TIMEOUT_MS, 0, now, now);
}
