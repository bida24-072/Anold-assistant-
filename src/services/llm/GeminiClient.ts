import { v4 as uuidv4 } from "uuid";
import { env } from "@/config/env";
import { ConversationMessage, LLMGenerateOptions, LLMResponse, LLMToolDefinition } from "@/types";

/**
 * Thin, dependency-free client for the Gemini REST API's generateContent
 * endpoint, with function-calling (tool use) support. Uses fetch directly
 * rather than the @google/generative-ai SDK to keep the bundle lean and
 * avoid SDK version churn — the REST surface is stable and documented at
 * https://ai.google.dev/api/generate-content
 */

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: "user" | "model" | "function";
  parts: GeminiPart[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, unknown>;
    required: string[];
  };
}

interface GeminiRequestBody {
  contents: GeminiContent[];
  systemInstruction?: { parts: { text: string }[] };
  tools?: [{ functionDeclarations: GeminiFunctionDeclaration[] }];
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
  };
}

interface GeminiCandidate {
  content: {
    parts: GeminiPart[];
    role: string;
  };
  finishReason?: string;
}

interface GeminiResponseBody {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  error?: { message: string; code: number; status: string };
}

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function toGeminiRole(role: ConversationMessage["role"]): GeminiContent["role"] {
  if (role === "user") return "user";
  if (role === "tool") return "function";
  return "model"; // "assistant" and "system" (system handled separately) map to model
}

function toGeminiContents(messages: ConversationMessage[]): GeminiContent[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      if (m.role === "tool" && m.toolName) {
        return {
          role: "function" as const,
          parts: [
            {
              functionResponse: {
                name: m.toolName,
                response: { result: m.content },
              },
            },
          ],
        };
      }
      return {
        role: toGeminiRole(m.role),
        parts: [{ text: m.content }],
      };
    });
}

function toGeminiTools(tools: LLMToolDefinition[]): GeminiFunctionDeclaration[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: "OBJECT",
      properties: t.parameters.properties,
      required: t.parameters.required,
    },
  }));
}

export type GeminiModelChoice = "flash" | "pro";

export class GeminiClient {
  private model: string;

  constructor(modelChoice: GeminiModelChoice = "flash") {
    this.model = modelChoice === "pro" ? env.gemini.modelPro : env.gemini.modelFlash;
  }

  async generate(options: LLMGenerateOptions): Promise<LLMResponse> {
    if (!env.gemini.isConfigured()) {
      throw new Error(
        "Gemini API key is not configured. Set EXPO_PUBLIC_GEMINI_API_KEY in your .env file."
      );
    }

    const body: GeminiRequestBody = {
      contents: toGeminiContents(options.messages),
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
      },
    };

    if (options.systemPrompt) {
      body.systemInstruction = { parts: [{ text: options.systemPrompt }] };
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = [{ functionDeclarations: toGeminiTools(options.tools) }];
    }

    const url = `${GEMINI_BASE_URL}/${this.model}:generateContent?key=${env.gemini.apiKey}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Network error calling Gemini API: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const json = (await response.json()) as GeminiResponseBody;

    if (!response.ok || json.error) {
      const message = json.error?.message ?? `HTTP ${response.status}`;
      throw new Error(`Gemini API error: ${message}`);
    }

    if (json.promptFeedback?.blockReason) {
      return {
        text: `I can't respond to that (blocked: ${json.promptFeedback.blockReason}).`,
        toolCalls: [],
        backendUsed: this.model === env.gemini.modelPro ? "gemini-pro" : "gemini-flash",
        finishReason: "error",
        raw: json,
      };
    }

    const candidate = json.candidates?.[0];
    if (!candidate) {
      throw new Error("Gemini API returned no candidates.");
    }

    const textParts: string[] = [];
    const toolCalls: LLMResponse["toolCalls"] = [];

    for (const part of candidate.content.parts) {
      if (part.text) {
        textParts.push(part.text);
      }
      if (part.functionCall) {
        toolCalls.push({
          id: uuidv4(),
          toolName: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
    }

    return {
      text: textParts.join("\n").trim(),
      toolCalls,
      backendUsed: this.model === env.gemini.modelPro ? "gemini-pro" : "gemini-flash",
      finishReason: toolCalls.length > 0 ? "tool_call" : "stop",
      raw: json,
    };
  }
}
