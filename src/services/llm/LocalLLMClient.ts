import { NativeModules, NativeEventEmitter, Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { v4 as uuidv4 } from "uuid";
import { env } from "@/config/env";
import { ConversationMessage, LLMGenerateOptions, LLMResponse } from "@/types";

/**
 * LocalLLMClient talks to a native module called `RNLlamaCpp` that must be
 * built via a custom Expo dev client / prebuild — it is NOT available in
 * Expo Go and cannot be shipped as pure JavaScript, because llama.cpp is a
 * C++ inference engine that has to be compiled per-platform.
 *
 * This file provides:
 *  1. The exact native module contract this app expects (method names,
 *     argument shapes, event names) — see `native/README.md` for the
 *     Android/iOS binding source that implements this contract using
 *     llama.rn (https://github.com/mybigday/llama.rn) as the underlying
 *     bridge, which is the maintained React Native wrapper around
 *     llama.cpp and is the realistic path to a working local-inference
 *     module rather than hand-rolling JNI/Obj-C++ bindings from scratch.
 *  2. A TypeScript wrapper with real prompt templating, streaming token
 *     handling, and honest error surfaces when the native module or model
 *     file isn't present.
 *
 * If you follow native/README.md and install `llama.rn`, set
 * `RNLlamaCpp = LlamaRNBridge` in your native module registration and this
 * file will work unmodified — the method contract below matches llama.rn's
 * context API (loadModel, completion, stopCompletion) directly.
 */

interface RNLlamaCppNativeModule {
  isModelLoaded(): Promise<boolean>;
  loadModel(modelPath: string, contextSize: number): Promise<{ success: boolean; error?: string }>;
  unloadModel(): Promise<void>;
  /** Runs a completion; final result also arrives via the "onToken" event stream while running. */
  completion(prompt: string, options: { maxTokens: number; temperature: number; stopSequences: string[] }): Promise<{ text: string; tokensGenerated: number }>;
  stopCompletion(): Promise<void>;
}

const RNLlamaCpp = NativeModules.RNLlamaCpp as RNLlamaCppNativeModule | undefined;

export class LocalModelUnavailableError extends Error {
  constructor(reason: string) {
    super(`Local model unavailable: ${reason}`);
    this.name = "LocalModelUnavailableError";
  }
}

/**
 * Builds a plain instruction-style prompt for small local models. Local
 * models generally do NOT reliably support native function calling the way
 * Gemini does, so tool use in local mode uses a constrained text protocol:
 * the model is instructed to emit a line like
 *   TOOL_CALL: {"name": "...", "arguments": {...}}
 * which we parse. This is intentionally simple because small quantized
 * models (1-3B) are unreliable at strict JSON function-calling schemas —
 * keeping the protocol minimal maximizes the chance the model follows it.
 */
function buildLocalPrompt(options: LLMGenerateOptions): string {
  const lines: string[] = [];

  if (options.systemPrompt) {
    lines.push(`### System\n${options.systemPrompt}`);
  }

  if (options.tools && options.tools.length > 0) {
    const toolDescriptions = options.tools
      .map((t) => `- ${t.name}: ${t.description} (args: ${JSON.stringify(t.parameters.properties)})`)
      .join("\n");
    lines.push(
      `### Available Tools\nIf you need to use a tool, respond with EXACTLY one line in the form:\n` +
        `TOOL_CALL: {"name": "<tool_name>", "arguments": {...}}\n` +
        `Otherwise respond normally in plain text.\n\nTools:\n${toolDescriptions}`
    );
  }

  for (const message of options.messages) {
    if (message.role === "user") lines.push(`### User\n${message.content}`);
    else if (message.role === "assistant") lines.push(`### Assistant\n${message.content}`);
    else if (message.role === "tool") lines.push(`### Tool Result (${message.toolName})\n${message.content}`);
  }

  lines.push("### Assistant");
  return lines.join("\n\n");
}

function parseLocalToolCall(text: string): LLMResponse["toolCalls"] {
  const match = text.match(/TOOL_CALL:\s*(\{.*\})/s);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { name: string; arguments: Record<string, unknown> };
    return [{ id: uuidv4(), toolName: parsed.name, arguments: parsed.arguments ?? {} }];
  } catch {
    // Model emitted malformed JSON after the TOOL_CALL marker — treat as
    // plain text rather than crashing the pipeline.
    return [];
  }
}

class LocalLLMClientImpl {
  private modelReady = false;
  private loadingPromise: Promise<void> | null = null;

  private getModelDir(): string {
    return `${FileSystem.documentDirectory}models/`;
  }

  private getModelPath(): string {
    return `${this.getModelDir()}${env.localModel.filename}`;
  }

  async isNativeModuleAvailable(): Promise<boolean> {
    return RNLlamaCpp !== undefined;
  }

  async isModelDownloaded(): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(this.getModelPath());
    return info.exists;
  }

  /**
   * Downloads the configured GGUF model to app document storage, with
   * progress callback. Call this once from a settings screen before
   * offline mode can be used — do not call it from the hot voice path.
   */
  async downloadModel(onProgress?: (fraction: number) => void): Promise<void> {
    if (!env.localModel.downloadUrl) {
      throw new Error(
        "No EXPO_PUBLIC_LOCAL_MODEL_DOWNLOAD_URL configured. Set it in .env to a direct GGUF download URL."
      );
    }
    await FileSystem.makeDirectoryAsync(this.getModelDir(), { intermediates: true }).catch(() => {
      // Directory may already exist — ignore.
    });

    const downloadResumable = FileSystem.createDownloadResumable(
      env.localModel.downloadUrl,
      this.getModelPath(),
      {},
      (progress) => {
        const fraction =
          progress.totalBytesExpectedToWrite > 0
            ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
            : 0;
        onProgress?.(fraction);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result || result.status !== 200) {
      throw new Error(`Model download failed with status ${result?.status ?? "unknown"}.`);
    }
  }

  async ensureModelLoaded(): Promise<void> {
    if (this.modelReady) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      if (!RNLlamaCpp) {
        throw new LocalModelUnavailableError(
          `Native module "RNLlamaCpp" is not registered. This requires a custom dev client build ` +
            `(not Expo Go) with llama.rn installed and linked — see native/README.md. Platform: ${Platform.OS}.`
        );
      }
      const downloaded = await this.isModelDownloaded();
      if (!downloaded) {
        throw new LocalModelUnavailableError(
          `Model file not found at ${this.getModelPath()}. Call downloadModel() first, or set ` +
            `EXPO_PUBLIC_LOCAL_MODEL_DOWNLOAD_URL and download it from a settings screen.`
        );
      }
      const alreadyLoaded = await RNLlamaCpp.isModelLoaded();
      if (alreadyLoaded) {
        this.modelReady = true;
        return;
      }
      const result = await RNLlamaCpp.loadModel(this.getModelPath(), 2048);
      if (!result.success) {
        throw new LocalModelUnavailableError(result.error ?? "Unknown native load failure.");
      }
      this.modelReady = true;
    })();

    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  async generate(options: LLMGenerateOptions): Promise<LLMResponse> {
    await this.ensureModelLoaded();
    if (!RNLlamaCpp) {
      throw new LocalModelUnavailableError("Native module vanished after load check.");
    }

    const prompt = buildLocalPrompt(options);
    const result = await RNLlamaCpp.completion(prompt, {
      maxTokens: options.maxTokens ?? 512,
      temperature: options.temperature ?? 0.6,
      stopSequences: ["### User", "### System"],
    });

    const toolCalls = parseLocalToolCall(result.text);
    const cleanedText = result.text.replace(/TOOL_CALL:\s*\{.*\}/s, "").trim();

    return {
      text: cleanedText,
      toolCalls,
      backendUsed: "local",
      finishReason: toolCalls.length > 0 ? "tool_call" : "stop",
      raw: result,
    };
  }

  async unload(): Promise<void> {
    if (RNLlamaCpp && this.modelReady) {
      await RNLlamaCpp.unloadModel();
      this.modelReady = false;
    }
  }

  /** Optional: subscribe to streaming token events for a "typing" UI effect. */
  subscribeToTokenStream(onToken: (token: string) => void): () => void {
    if (!RNLlamaCpp) return () => {};
    const emitter = new NativeEventEmitter(NativeModules.RNLlamaCpp);
    const subscription = emitter.addListener("onToken", (event: { token: string }) => {
      onToken(event.token);
    });
    return () => subscription.remove();
  }
}

export const LocalLLMClient = new LocalLLMClientImpl();
