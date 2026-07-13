/**
 * Core shared types for the Anold assistant.
 * Keeping these centralized avoids drift between services.
 */

export type LLMBackend = "gemini-flash" | "gemini-pro" | "local";

export type ConversationRole = "user" | "assistant" | "system" | "tool";

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolName?: string;
}

export interface ToolCallRequest {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  id: string;
  toolName: string;
  success: boolean;
  result: string;
  error?: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  /** JSON-schema-shaped parameter definition, Gemini function-calling format */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface LLMResponse {
  text: string;
  toolCalls: ToolCallRequest[];
  backendUsed: LLMBackend;
  finishReason: "stop" | "tool_call" | "error" | "length";
  raw?: unknown;
}

export interface LLMGenerateOptions {
  messages: ConversationMessage[];
  tools?: LLMToolDefinition[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface UserProfile {
  name: string | null;
  preferredName: string | null;
  habits: string[];
  facts: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface MemoryState {
  profile: UserProfile;
  rollingHistory: ConversationMessage[];
}

export type AssistantStatus =
  | "idle"
  | "listening_for_wake_word"
  | "wake_word_detected"
  | "recording"
  | "transcribing"
  | "thinking"
  | "executing_tool"
  | "speaking"
  | "error";

export interface SystemDiagnostics {
  batteryLevel: number | null;
  batteryState: string | null;
  isConnected: boolean | null;
  networkType: string | null;
  timestamp: number;
}

export interface AnoldConfig {
  assistantName: string;
  wakePhrase: string;
  offlineModeEnabled: boolean;
  preferredBackend: LLMBackend;
  ttsRate: number;
  ttsPitch: number;
}
