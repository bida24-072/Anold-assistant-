import * as Network from "expo-network";
import { GeminiClient } from "./GeminiClient";
import { LocalLLMClient, LocalModelUnavailableError } from "./LocalLLMClient";
import { ToolRegistry } from "../tools/ToolRegistry";
import {
  ConversationMessage,
  LLMBackend,
  LLMGenerateOptions,
  LLMResponse,
  ToolCallResult,
} from "@/types";
import { v4 as uuidv4 } from "uuid";

const MAX_TOOL_CALL_ITERATIONS = 4;

export interface LLMManagerOptions {
  offlineModeEnabled: boolean;
  preferredBackend: LLMBackend;
}

export interface GenerateWithToolsResult {
  finalText: string;
  backendUsed: LLMBackend;
  toolResults: ToolCallResult[];
  updatedMessages: ConversationMessage[];
}

/**
 * LLMManager is the single decision point for "which brain answers this
 * turn". It:
 *  1. Picks cloud vs local based on connectivity + user preference.
 *  2. Runs the tool-call loop: model requests a tool -> we execute it
 *     -> feed the result back -> model produces a final answer (bounded
 *     to MAX_TOOL_CALL_ITERATIONS to avoid infinite loops).
 *  3. Falls back from local -> cloud (or vice versa) if the preferred
 *     backend is unavailable, rather than failing the whole turn.
 */
class LLMManagerImpl {
  private geminiFlash = new GeminiClient("flash");
  private geminiPro = new GeminiClient("pro");

  private async isOnline(): Promise<boolean> {
    try {
      const state = await Network.getNetworkStateAsync();
      return Boolean(state.isConnected && state.isInternetReachable !== false);
    } catch {
      return false;
    }
  }

  private async resolveBackendClient(
    backend: LLMBackend
  ): Promise<{ generate: (opts: LLMGenerateOptions) => Promise<LLMResponse>; name: LLMBackend }> {
    if (backend === "local") {
      return { generate: (opts) => LocalLLMClient.generate(opts), name: "local" };
    }
    if (backend === "gemini-pro") {
      return { generate: (opts) => this.geminiPro.generate(opts), name: "gemini-pro" };
    }
    return { generate: (opts) => this.geminiFlash.generate(opts), name: "gemini-flash" };
  }

  private async chooseBackend(options: LLMManagerOptions): Promise<LLMBackend> {
    const online = await this.isOnline();

    if (options.offlineModeEnabled) {
      // User explicitly wants offline-first behavior.
      return "local";
    }

    if (!online) {
      // No connectivity — local is the only option, whether or not the
      // user asked for it. If it's not set up either, generate() below
      // will throw a clear, actionable error.
      return "local";
    }

    return options.preferredBackend === "local" ? "gemini-flash" : options.preferredBackend;
  }

  /**
   * Runs a full turn: sends messages + tool definitions to the chosen
   * backend, executes any requested tool calls, feeds results back, and
   * repeats until the model produces a final plain-text answer or the
   * iteration cap is hit.
   */
  async generateWithTools(
    messages: ConversationMessage[],
    systemPrompt: string,
    managerOptions: LLMManagerOptions
  ): Promise<GenerateWithToolsResult> {
    const backendName = await this.chooseBackend(managerOptions);
    let client = await this.resolveBackendClient(backendName);

    const workingMessages = [...messages];
    const allToolResults: ToolCallResult[] = [];
    let lastResponse: LLMResponse | null = null;

    for (let iteration = 0; iteration < MAX_TOOL_CALL_ITERATIONS; iteration++) {
      let response: LLMResponse;
      try {
        response = await client.generate({
          messages: workingMessages,
          tools: ToolRegistry.getDefinitions(),
          systemPrompt,
        });
      } catch (err) {
        if (err instanceof LocalModelUnavailableError && client.name === "local") {
          // Graceful degrade: local was chosen (offline mode or no
          // connectivity) but isn't actually usable yet — try cloud if
          // we have connectivity, otherwise surface a clear error.
          const online = await this.isOnline();
          if (online) {
            client = await this.resolveBackendClient("gemini-flash");
            response = await client.generate({
              messages: workingMessages,
              tools: ToolRegistry.getDefinitions(),
              systemPrompt,
            });
          } else {
            throw new Error(
              `No usable AI backend: local model isn't set up (${err.message}) and there is no internet connection.`
            );
          }
        } else {
          throw err;
        }
      }

      lastResponse = response;

      if (response.toolCalls.length === 0) {
        break;
      }

      // Record the assistant's tool-call intent in the transcript.
      workingMessages.push({
        id: uuidv4(),
        role: "assistant",
        content: response.text || "(requested a tool call)",
        timestamp: Date.now(),
      });

      for (const call of response.toolCalls) {
        const result = await ToolRegistry.execute(call);
        allToolResults.push(result);
        workingMessages.push({
          id: uuidv4(),
          role: "tool",
          toolCallId: result.id,
          toolName: result.toolName,
          content: result.success ? result.result : `ERROR: ${result.error}`,
          timestamp: Date.now(),
        });
      }
      // Loop again so the model can incorporate tool results into a final answer.
    }

    if (!lastResponse) {
      throw new Error("LLM manager produced no response.");
    }

    return {
      finalText: lastResponse.text || "I finished the requested actions.",
      backendUsed: lastResponse.backendUsed,
      toolResults: allToolResults,
      updatedMessages: workingMessages,
    };
  }
}

export const LLMManager = new LLMManagerImpl();
