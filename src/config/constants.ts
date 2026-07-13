import { AnoldConfig } from "@/types";
import { env } from "./env";

export const DEFAULT_CONFIG: AnoldConfig = {
  assistantName: env.assistant.name,
  wakePhrase: env.assistant.wakePhrase,
  offlineModeEnabled: false,
  preferredBackend: "gemini-flash",
  ttsRate: 1.0,
  ttsPitch: 1.0,
};

export const STORAGE_KEYS = {
  USER_PROFILE: "anold.memory.profile",
  ROLLING_HISTORY: "anold.memory.history",
  APP_CONFIG: "anold.config",
} as const;

export const MEMORY_LIMITS = {
  /** Max messages kept in the rolling conversation buffer before summarization/trim */
  MAX_ROLLING_MESSAGES: 40,
  /** Max characters per stored fact value */
  MAX_FACT_LENGTH: 500,
} as const;

export const HUD_THEME = {
  colors: {
    background: "#050810",
    backgroundElevated: "#0A1020",
    reactorCore: "#00E5FF",
    reactorCoreDim: "#0A4A55",
    accentAmber: "#FFB000",
    danger: "#FF3B3B",
    success: "#3BFF8C",
    textPrimary: "#E8FBFF",
    textSecondary: "#6FA8B5",
    terminalGreen: "#39FF6A",
    border: "#123040",
  },
  fonts: {
    mono: "SpaceMono-Regular",
  },
} as const;

export const AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  /** Milliseconds of trailing silence before auto-stopping a recording */
  silenceTimeoutMs: 1500,
  /** Max recording length as a safety cap */
  maxRecordingMs: 20000,
} as const;
