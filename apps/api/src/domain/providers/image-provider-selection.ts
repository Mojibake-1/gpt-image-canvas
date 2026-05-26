import { getCodexResponsesBaseURL, getValidCodexSession } from "./codex-auth.js";
import type { CodexAccessSession } from "./codex-auth.js";
import {
  createCodexImageProvider,
  getCodexImageProviderTimeoutMs,
  getCodexResponsesModel
} from "../../infrastructure/providers/codex-image-provider.js";
import {
  ProviderError,
  createOpenAIImageProvider,
  getConfiguredImageModel,
  type ImageProvider,
  type OpenAIImageProviderConfig
} from "../../infrastructure/providers/image-provider.js";
import {
  getEnvironmentOpenAIImageProviderConfig,
  getLocalOpenAIImageProviderConfig,
  getProviderSourceOrder
} from "./provider-config.js";
import type { ProviderSourceId, RuntimeImageProvider } from "../contracts.js";

export interface ConfiguredImageProviderSelection {
  sourceId: ProviderSourceId;
  provider: RuntimeImageProvider;
  openAIConfig?: OpenAIImageProviderConfig;
  codexSession?: CodexAccessSession;
}

export interface CreateConfiguredImageProviderOptions {
  signal?: AbortSignal;
  sourceOrder?: readonly ProviderSourceId[];
  localConfigId?: string;
  missingProviderMessage?: string;
}

interface SelectConfiguredImageProviderSourceOptions {
  signal?: AbortSignal;
  sourceOrder?: readonly ProviderSourceId[];
  localConfigId?: string;
}

const defaultMissingProviderMessage =
  "??????????????????????? API?????? Codex ????";

export async function createConfiguredImageProvider(options: CreateConfiguredImageProviderOptions = {}): Promise<ImageProvider> {
  const selection = await selectConfiguredImageProviderSource({
    signal: options.signal,
    sourceOrder: options.sourceOrder,
    localConfigId: options.localConfigId
  });

  if (selection?.openAIConfig) {
    return createOpenAIImageProvider(selection.openAIConfig);
  }

  if (selection?.provider === "codex" && selection.codexSession) {
    return createCodexImageProvider({
      baseURL: getCodexResponsesBaseURL(),
      responsesModel: getCodexResponsesModel(),
      imageModel: getConfiguredImageModel(),
      timeoutMs: getCodexImageProviderTimeoutMs(),
      getSession: async (requestSignal?: AbortSignal) => selection.codexSession ?? getValidCodexSession(requestSignal)
    });
  }

  throw new ProviderError("missing_provider", options.missingProviderMessage ?? defaultMissingProviderMessage, 401);
}

export async function selectConfiguredImageProviderSource(
  options: SelectConfiguredImageProviderSourceOptions = {}
): Promise<ConfiguredImageProviderSelection | undefined> {
  const sourceOrder = options.sourceOrder?.length ? [...options.sourceOrder] : getProviderSourceOrder();

  for (const sourceId of sourceOrder) {
    if (sourceId === "env-openai") {
      const openAIConfig = getEnvironmentOpenAIImageProviderConfig();
      if (openAIConfig) {
        return {
          sourceId,
          provider: "openai",
          openAIConfig
        };
      }
      continue;
    }

    if (sourceId === "local-openai") {
      const openAIConfig = getLocalOpenAIImageProviderConfig({ id: options.localConfigId });
      if (openAIConfig) {
        return {
          sourceId,
          provider: "openai",
          openAIConfig
        };
      }
      continue;
    }

    const codexSession = await getValidCodexSession(options.signal);
    if (codexSession) {
      return {
        sourceId,
        provider: "codex",
        codexSession
      };
    }
  }

  return undefined;
}
