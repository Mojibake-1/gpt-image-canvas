import type { GenerationRecord, ProviderSourceId } from "../contracts.js";
import { createConfiguredImageProvider } from "../providers/image-provider-selection.js";
import type { EditImageProviderInput, ImageProviderInput } from "../../infrastructure/providers/image-provider.js";
import {
  cancelGenerationRecord,
  createRunningReferenceImageGeneration,
  createRunningTextToImageGeneration,
  failGenerationRecord,
  finishReferenceImageGeneration,
  finishTextToImageGeneration,
  getGenerationRecord,
  markInterruptedGenerationRecordsFailed,
  type GenerationRunOptions
} from "./image-generation.js";

interface ActiveGenerationTask {
  controller: AbortController;
}

export interface StartGenerationTaskOptions extends GenerationRunOptions {
  localConfigId?: string;
  sourceOrder?: readonly ProviderSourceId[];
  missingProviderMessage?: string;
}

const activeGenerationTasks = new Map<string, ActiveGenerationTask>();

export function initializeGenerationTaskManager(): void {
  activeGenerationTasks.clear();
  markInterruptedGenerationRecordsFailed();
}

export function startTextToImageGenerationTask(
  input: ImageProviderInput,
  ownerEmail?: string,
  options: StartGenerationTaskOptions = {}
): GenerationRecord {
  const record = createRunningTextToImageGeneration(input, ownerEmail);
  if (isTerminalGenerationStatus(record.status) || activeGenerationTasks.has(record.id)) {
    return record;
  }

  startBackgroundGenerationTask(record.id, async (signal) => {
    const provider = await createConfiguredImageProvider({
      signal,
      localConfigId: options.localConfigId,
      sourceOrder: options.sourceOrder,
      missingProviderMessage: options.missingProviderMessage
    });
    await finishTextToImageGeneration(record.id, input, provider, ownerEmail, signal, {
      disableCloudStorage: options.disableCloudStorage
    });
  });

  return record;
}

export async function startReferenceImageGenerationTask(
  input: EditImageProviderInput,
  ownerEmail?: string,
  options: StartGenerationTaskOptions = {}
): Promise<GenerationRecord> {
  const running = await createRunningReferenceImageGeneration(input, ownerEmail);
  if (isTerminalGenerationStatus(running.record.status) || activeGenerationTasks.has(running.record.id)) {
    return running.record;
  }

  startBackgroundGenerationTask(running.record.id, async (signal) => {
    const provider = await createConfiguredImageProvider({
      signal,
      localConfigId: options.localConfigId,
      sourceOrder: options.sourceOrder,
      missingProviderMessage: options.missingProviderMessage
    });
    await finishReferenceImageGeneration(running.record.id, running.input, provider, ownerEmail, signal, {
      disableCloudStorage: options.disableCloudStorage
    });
  });

  return running.record;
}

export function readGenerationTaskRecord(generationId: string, ownerEmail?: string): GenerationRecord | undefined {
  return getGenerationRecord(generationId, ownerEmail);
}

export function cancelGenerationTask(generationId: string, ownerEmail?: string): GenerationRecord | undefined {
  activeGenerationTasks.get(generationId)?.controller.abort();
  return cancelGenerationRecord(generationId, ownerEmail);
}

function startBackgroundGenerationTask(generationId: string, run: (signal: AbortSignal) => Promise<void>): void {
  const controller = new AbortController();
  activeGenerationTasks.set(generationId, { controller });

  void (async () => {
    try {
      await run(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        cancelGenerationRecord(generationId);
      } else {
        failGenerationRecord(generationId, errorToMessage(error));
      }
    } finally {
      const activeTask = activeGenerationTasks.get(generationId);
      if (activeTask?.controller === controller) {
        activeGenerationTasks.delete(generationId);
      }
    }
  })();
}

function isTerminalGenerationStatus(status: GenerationRecord["status"]): boolean {
  return status === "succeeded" || status === "partial" || status === "failed" || status === "cancelled";
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Generation failed. Try again.";
}
