import OpenAI, { APIConnectionTimeoutError, APIError, APIUserAbortError, toFile } from "openai";
import type { Image, ImageEditParamsNonStreaming, ImageGenerateParamsNonStreaming, ImagesResponse } from "openai/resources/images";
import {
  IMAGE_MODEL,
  type ImageQuality,
  type ImageSize,
  type OutputFormat,
  type ReferenceImageInput
} from "../../domain/contracts.js";

export interface ImageProviderInput {
  originalPrompt: string;
  clientRequestId?: string;
  presetId: string;
  prompt: string;
  size: ImageSize;
  sizeApiValue: string;
  quality: ImageQuality;
  outputFormat: OutputFormat;
  count: number;
}

export interface EditImageProviderInput extends ImageProviderInput {
  referenceImages: ReferenceImageInput[];
  referenceImage?: ReferenceImageInput;
  referenceAssetIds?: string[];
  referenceAssetId?: string;
}

export interface ProviderImage {
  b64Json: string;
}

export interface ProviderResult {
  model: string;
  size: string;
  images: ProviderImage[];
}

export interface ImageProvider {
  generate(input: ImageProviderInput, signal?: AbortSignal): Promise<ProviderResult>;
  edit(input: EditImageProviderInput, signal?: AbortSignal): Promise<ProviderResult>;
}

export type ProviderErrorCode = "missing_api_key" | "missing_provider" | "unsupported_provider_behavior" | "upstream_failure";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export type OpenAIImageApiMode = "images" | "responses";

export interface OpenAIImageProviderConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  timeoutMs: number;
  apiMode?: OpenAIImageApiMode;
  codexCliCompatible?: boolean;
}

export const DEFAULT_OPENAI_IMAGE_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_REFERENCE_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_PROVIDER_IMAGE_BYTES = 100 * 1024 * 1024;
const SUPPORTED_REFERENCE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const RESPONSES_IMAGE_INSTRUCTIONS =
  "Use the image_generation tool to create exactly one image for the user's request. Return the generated image result.";

type FlexibleImageGenerateParams = Omit<ImageGenerateParamsNonStreaming, "size"> & {
  size: string;
};

type FlexibleImageEditParams = Omit<ImageEditParamsNonStreaming, "size"> & {
  size: string;
};

export function getOpenAIImageProviderConfig():
  | {
      ok: true;
      config: OpenAIImageProviderConfig;
    }
  | {
      ok: false;
      error: ProviderError;
    } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: new ProviderError("missing_api_key", "服务器缺少 OPENAI_API_KEY，无法生成图像。", 500)
    };
  }

  const baseURL = process.env.OPENAI_BASE_URL?.trim();

  return {
    ok: true,
    config: {
      apiKey,
      baseURL: baseURL || undefined,
      model: getConfiguredImageModel(),
      timeoutMs: parseOpenAIImageTimeoutMs(process.env.OPENAI_IMAGE_TIMEOUT_MS),
      apiMode: getOpenAIImageApiMode(process.env.OPENAI_IMAGE_API_MODE),
      codexCliCompatible: isCodexCliCompatibleEndpoint(baseURL)
    }
  };
}

export function getConfiguredImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || IMAGE_MODEL;
}

export function getOpenAIImageApiMode(value: string | undefined): OpenAIImageApiMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === "responses" ? "responses" : "images";
}

export function parseOpenAIImageTimeoutMs(value: string | undefined): number {
  return parsePositiveInteger(value, DEFAULT_OPENAI_IMAGE_TIMEOUT_MS);
}

export function createOpenAIImageProvider(config: OpenAIImageProviderConfig): ImageProvider {
  return new OpenAIImageProvider(config);
}

class OpenAIImageProvider implements ImageProvider {
  private readonly client: OpenAI;

  constructor(private readonly config: OpenAIImageProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeoutMs
    });
  }

  async generate(input: ImageProviderInput, signal?: AbortSignal): Promise<ProviderResult> {
    try {
      if (this.config.apiMode === "responses") {
        return await requestOpenAIResponsesImage(input, this.config, signal);
      }

      const body: FlexibleImageGenerateParams = {
        model: this.config.model,
        prompt: providerPrompt(input.prompt, this.config.codexCliCompatible),
        size: input.sizeApiValue,
        output_format: input.outputFormat
      };

      if (!this.config.codexCliCompatible) {
        body.quality = input.quality;
      }
      if (input.count > 1) {
        body.n = input.count;
      }

      const response = await this.client.images.generate(
        imageGenerateRequestBody(body),
        { signal }
      );

      return await normalizeProviderResponse(response, input.sizeApiValue, this.config.model, signal);
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async edit(input: EditImageProviderInput, signal?: AbortSignal): Promise<ProviderResult> {
    try {
      if (this.config.apiMode === "responses") {
        return await requestOpenAIResponsesImage(input, this.config, signal);
      }

      const references = await Promise.all(input.referenceImages.map((referenceImage) => dataUrlToFile(referenceImage)));
      const body: FlexibleImageEditParams = {
        model: this.config.model,
        image: references,
        prompt: providerPrompt(input.prompt, this.config.codexCliCompatible),
        size: input.sizeApiValue,
        output_format: input.outputFormat
      };

      if (!this.config.codexCliCompatible) {
        body.quality = input.quality;
      }
      if (input.count > 1) {
        body.n = input.count;
      }

      const response = await this.client.images.edit(
        imageEditRequestBody(body),
        { signal }
      );

      return await normalizeProviderResponse(response, input.sizeApiValue, this.config.model, signal);
    } catch (error) {
      throw toProviderError(error);
    }
  }
}

export function isCodexCliCompatibleEndpoint(baseURL: string | undefined): boolean {
  const override = process.env.OPENAI_CODEX_CLI_COMPAT?.trim().toLowerCase();
  if (override === "1" || override === "true" || override === "yes") {
    return true;
  }
  if (override === "0" || override === "false" || override === "no") {
    return false;
  }

  if (!baseURL) {
    return false;
  }

  try {
    const url = new URL(baseURL);
    const host = url.hostname.toLowerCase();
    return (
      (host === "127.0.0.1" && url.port === "45047") ||
      (host === "localhost" && url.port === "45047") ||
      host.startsWith("cpa.")
    );
  } catch {
    return /(^|\/|:)45047(\/|$)|cpa\./i.test(baseURL);
  }
}

function providerPrompt(prompt: string, codexCliCompatible: boolean | undefined): string {
  return codexCliCompatible ? `Use the following text as the complete prompt. Do not rewrite it:\n${prompt}` : prompt;
}

function imageGenerateRequestBody(body: FlexibleImageGenerateParams): ImageGenerateParamsNonStreaming {
  // The SDK's image size union can lag gpt-image-2's documented flexible-size support.
  return body as unknown as ImageGenerateParamsNonStreaming;
}

function imageEditRequestBody(body: FlexibleImageEditParams): ImageEditParamsNonStreaming {
  // The SDK's image size union can lag gpt-image-2's documented flexible-size support.
  return body as unknown as ImageEditParamsNonStreaming;
}


type ResponsesImageInput = ImageProviderInput | EditImageProviderInput;

interface ResponsesImageTool {
  type: "image_generation";
  model: string;
  action: "generate" | "edit";
  size: string;
  quality: string;
  output_format: string;
}

async function requestOpenAIResponsesImage(
  input: ResponsesImageInput,
  config: OpenAIImageProviderConfig,
  signal?: AbortSignal
): Promise<ProviderResult> {
  const images: ProviderImage[] = [];
  const timeout = timeoutSignal(signal, config.timeoutMs);

  try {
    while (images.length < input.count) {
      const response = await fetch(openAIResponsesURL(config.baseURL), {
        method: "POST",
        headers: openAIResponsesHeaders(config.apiKey),
        body: JSON.stringify(createOpenAIResponsesRequestBody(input, config)),
        signal: timeout.signal
      }).catch((error: unknown) => {
        throw fetchFailureToProviderError(error);
      });

      if (!response.ok) {
        throw await responsesHttpProviderErrorFromResponse(response);
      }

      const payloads = await readOpenAIResponsesPayloads(response);
      const responseImages = extractImagesFromResponsePayloads(payloads);
      if (responseImages.length === 0) {
        throw new ProviderError("unsupported_provider_behavior", "OpenAI Responses image service request failed. Try again later.", 502);
      }

      images.push(
        ...responseImages.map((image) => ({
          b64Json: image
        }))
      );
    }

    return {
      model: config.model,
      size: input.sizeApiValue,
      images: images.slice(0, input.count)
    };
  } finally {
    timeout.cleanup();
  }
}

function openAIResponsesURL(baseURL: string | undefined): string {
  return `${(baseURL?.trim() || "https://api.openai.com/v1").replace(/\/+$/u, "")}/responses`;
}

function openAIResponsesHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function createOpenAIResponsesRequestBody(
  input: ResponsesImageInput,
  config: OpenAIImageProviderConfig
): Record<string, unknown> {
  const tool: ResponsesImageTool = {
    type: "image_generation",
    model: config.model,
    action: "referenceImages" in input ? "edit" : "generate",
    size: input.sizeApiValue,
    quality: input.quality,
    output_format: input.outputFormat
  };

  return {
    model: config.model,
    instructions: RESPONSES_IMAGE_INSTRUCTIONS,
    store: false,
    input: [
      {
        role: "user",
        content: createResponsesInputContent(input, config)
      }
    ],
    tools: [tool],
    tool_choice: {
      type: "image_generation"
    },
    stream: false
  };
}

function createResponsesInputContent(input: ResponsesImageInput, config: OpenAIImageProviderConfig): Array<Record<string, string>> {
  const content: Array<Record<string, string>> = [
    {
      type: "input_text",
      text: providerPrompt(input.prompt, config.codexCliCompatible)
    }
  ];

  if ("referenceImages" in input) {
    for (const referenceImage of input.referenceImages) {
      content.push({
        type: "input_image",
        image_url: normalizeReferenceImageDataUrl(referenceImage)
      });
    }
  }

  return content;
}

function normalizeReferenceImageDataUrl(input: ReferenceImageInput): string {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(input.dataUrl);
  if (!match) {
    throw new ProviderError("unsupported_provider_behavior", "Reference image format is not supported.", 400);
  }

  const mimeType = match[1].toLowerCase();
  if (!SUPPORTED_REFERENCE_MIME_TYPES.has(mimeType)) {
    throw new ProviderError("unsupported_provider_behavior", "Reference images must be PNG, JPEG, or WebP.", 400);
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new ProviderError("unsupported_provider_behavior", "Reference images must be 50MB or smaller.", 400);
  }

  const normalizedMimeType = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  return `data:${normalizedMimeType};base64,${match[2]}`;
}

async function readOpenAIResponsesPayloads(response: Response): Promise<unknown[]> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = await response.json().catch(() => undefined);
    return json === undefined ? [] : [json];
  }

  return parseOpenAIResponsesEventsFromSse(await response.text());
}

function parseOpenAIResponsesEventsFromSse(text: string): unknown[] {
  const events: unknown[] = [];
  let dataLines: string[] = [];

  const flush = (): void => {
    if (dataLines.length === 0) {
      return;
    }

    const data = dataLines.join("\n").trim();
    dataLines = [];
    if (!data || data === "[DONE]") {
      return;
    }

    try {
      events.push(JSON.parse(data) as unknown);
    } catch {
      events.push(data);
    }
  };

  for (const line of text.split(/\r?\n/u)) {
    if (line.length === 0) {
      flush();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  flush();
  return events;
}

function extractImagesFromResponsePayloads(payloads: unknown[]): string[] {
  const images: string[] = [];
  const seen = new Set<string>();

  for (const payload of payloads) {
    for (const image of extractImagesFromResponsePayload(payload)) {
      if (!seen.has(image)) {
        seen.add(image);
        images.push(image);
      }
    }
  }

  return images;
}

function extractImagesFromResponsePayload(payload: unknown): string[] {
  const record = objectValue(payload);
  if (!record) {
    return [];
  }

  if (record.type === "response.output_item.done") {
    return extractImagesFromOutputItem(record.item ?? record.output_item);
  }

  if (record.type === "response.completed") {
    return extractImagesFromResponse(record.response);
  }

  return [...extractImagesFromResponse(record), ...extractImagesFromOutputItem(record)];
}

function extractImagesFromResponse(response: unknown): string[] {
  const record = objectValue(response);
  if (!record || !Array.isArray(record.output)) {
    return [];
  }

  return record.output.flatMap(extractImagesFromOutputItem);
}

function extractImagesFromOutputItem(item: unknown): string[] {
  const record = objectValue(item);
  if (!record || record.type !== "image_generation_call") {
    return [];
  }

  const image = normalizeImageBase64(record.result);
  return image ? [image] : [];
}

function normalizeImageBase64(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  const dataUrlMatch = /^data:image\/[^;,]+;base64,(.+)$/u.exec(trimmed);
  return dataUrlMatch?.[1] ?? trimmed;
}

async function responsesHttpProviderErrorFromResponse(response: Response): Promise<ProviderError> {
  const status = response.status;
  if (status === 401 || status === 403) {
    return new ProviderError("upstream_failure", "OpenAI Responses image service authentication failed. Check OPENAI_API_KEY.", status);
  }

  const detail = sanitizeProviderErrorDetail(await readProviderErrorDetail(response));
  const suffix = detail ? `: ${detail}` : "";
  return new ProviderError("upstream_failure", `OpenAI Responses image service request failed (HTTP ${status})${suffix}`, providerHttpStatus(status));
}

async function readProviderErrorDetail(response: Response): Promise<string | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => undefined);
    return extractProviderErrorDetail(body);
  }

  return response.text().catch(() => undefined);
}

function extractProviderErrorDetail(value: unknown): string | undefined {
  const record = objectValue(value);
  if (!record) {
    return typeof value === "string" ? value : undefined;
  }

  const detail = record.detail ?? record.message;
  if (typeof detail === "string") {
    return detail;
  }

  const error = objectValue(record.error);
  return typeof error?.message === "string" ? error.message : undefined;
}

function sanitizeProviderErrorDetail(value: string | undefined): string | undefined {
  const sanitized = value
    ?.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, "sk-[redacted]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);

  return sanitized || undefined;
}

function fetchFailureToProviderError(error: unknown): ProviderError | Error {
  if (isAbortError(error)) {
    return new ProviderError("upstream_failure", "OpenAI Responses image service request timed out. Try again later or lower the resolution.", 504);
  }

  return new ProviderError("upstream_failure", "OpenAI Responses image service request failed. Try again later.", 502);
}

function timeoutSignal(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = (): void => controller.abort(signal?.reason);

  if (signal?.aborted) {
    abort();
  } else if (signal) {
    signal.addEventListener("abort", abort, { once: true });
  }

  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  };
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toProviderError(error: unknown): Error {
  if (isAbortError(error)) {
    return error;
  }

  if (error instanceof ProviderError) {
    return error;
  }

  if (error instanceof APIConnectionTimeoutError) {
    return new ProviderError("upstream_failure", "OpenAI 图像服务请求超时，请稍后重试或降低分辨率。", 504);
  }

  if (error instanceof APIError) {
    return new ProviderError("upstream_failure", error.message || "OpenAI 图像服务请求失败。", providerHttpStatus(error.status));
  }

  if (error instanceof Error && error.message) {
    return new ProviderError("upstream_failure", error.message, 502);
  }

  return new ProviderError("upstream_failure", "OpenAI 图像服务请求失败。", 502);
}

function providerHttpStatus(status: number | undefined): number {
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isAbortError(error: unknown): error is Error {
  return error instanceof APIUserAbortError || (error instanceof DOMException && error.name === "AbortError");
}

async function normalizeProviderResponse(
  response: ImagesResponse,
  sizeApiValue: string,
  model: string,
  signal?: AbortSignal
): Promise<ProviderResult> {
  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new ProviderError("unsupported_provider_behavior", "OpenAI 图像服务没有返回图像结果。", 502);
  }

  const images = await Promise.all(response.data.map((item) => providerImageFromResponseItem(item, signal)));

  if (images.some((image) => !image.b64Json)) {
    throw new ProviderError("unsupported_provider_behavior", "OpenAI 图像服务没有返回 base64 图像数据。", 502);
  }

  return {
    model,
    size: sizeApiValue,
    images
  };
}

async function providerImageFromResponseItem(item: Image, signal?: AbortSignal): Promise<ProviderImage> {
  if (typeof item.b64_json === "string" && item.b64_json) {
    return {
      b64Json: item.b64_json
    };
  }

  if (typeof item.url === "string" && item.url) {
    return {
      b64Json: await downloadProviderImageUrl(item.url, signal)
    };
  }

  return {
    b64Json: ""
  };
}

async function downloadProviderImageUrl(url: string, signal?: AbortSignal): Promise<string> {
  const parsedUrl = parseProviderImageUrl(url);
  if (!parsedUrl) {
    throw new ProviderError("unsupported_provider_behavior", "OpenAI 图像服务返回的图片 URL 不受支持。", 502);
  }

  if (parsedUrl.protocol === "data:") {
    return dataUrlToBase64(url);
  }

  const response = await fetch(parsedUrl, { signal });
  if (!response.ok) {
    throw new ProviderError("upstream_failure", "OpenAI 图像 URL 下载失败。", providerHttpStatus(response.status));
  }

  if (!isProviderImageContentType(response.headers.get("content-type"))) {
    throw new ProviderError("unsupported_provider_behavior", "OpenAI 图像 URL 返回的内容不是图片。", 502);
  }

  const contentLength = parseContentLength(response.headers.get("content-length"));
  if (contentLength !== undefined && contentLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new ProviderError("unsupported_provider_behavior", "OpenAI 图像 URL 返回的文件过大。", 502);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PROVIDER_IMAGE_BYTES) {
    throw new ProviderError("unsupported_provider_behavior", "OpenAI 图像 URL 返回的文件过大。", 502);
  }
  if (!isProviderImageBytes(bytes)) {
    throw new ProviderError("unsupported_provider_behavior", "OpenAI 图像 URL 返回的内容不是可识别的图片。", 502);
  }

  return bytes.toString("base64");
}

function parseProviderImageUrl(url: string): URL | undefined {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:" || parsedUrl.protocol === "data:"
      ? parsedUrl
      : undefined;
  } catch {
    return undefined;
  }
}

function dataUrlToBase64(url: string): string {
  const match = /^data:image\/[^;,]+;base64,(.+)$/u.exec(url);
  if (!match) {
    throw new ProviderError("unsupported_provider_behavior", "OpenAI 图像服务返回的 data URL 不受支持。", 502);
  }

  return match[1];
}

function isProviderImageContentType(value: string | null): boolean {
  if (!value) {
    return true;
  }

  const contentType = value.split(";")[0]?.trim().toLowerCase();
  return Boolean(contentType?.startsWith("image/") || contentType === "application/octet-stream");
}

function isProviderImageBytes(bytes: Buffer): boolean {
  return isPng(bytes) || isJpeg(bytes) || isWebp(bytes);
}

function isPng(bytes: Buffer): boolean {
  return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
}

function isWebp(bytes: Buffer): boolean {
  return bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function parseContentLength(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

async function dataUrlToFile(input: ReferenceImageInput): Promise<File> {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(input.dataUrl);
  if (!match) {
    throw new ProviderError("unsupported_provider_behavior", "参考图像格式不受支持。", 400);
  }

  const mimeType = match[1].toLowerCase();
  if (!SUPPORTED_REFERENCE_MIME_TYPES.has(mimeType)) {
    throw new ProviderError("unsupported_provider_behavior", "参考图像必须是 PNG、JPEG 或 WebP 格式。", 400);
  }

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_REFERENCE_IMAGE_BYTES) {
    throw new ProviderError("unsupported_provider_behavior", "参考图像不能超过 50MB。", 400);
  }

  const normalizedMimeType = mimeType === "image/jpg" ? "image/jpeg" : mimeType;
  const extension = normalizedMimeType === "image/jpeg" ? "jpg" : normalizedMimeType.split("/")[1] || "png";
  const fileName = sanitizeFileName(input.fileName) ?? `reference.${extension}`;
  return toFile(bytes, fileName, { type: normalizedMimeType });
}

function sanitizeFileName(fileName: string | undefined): string | undefined {
  const trimmed = fileName?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/[^a-zA-Z0-9._-]/gu, "_");
}
