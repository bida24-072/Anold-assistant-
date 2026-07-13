import { create } from "zustand";
import { AssistantStatus, AnoldConfig, ConversationMessage, SystemDiagnostics } from "@/types";
import { DEFAULT_CONFIG } from "@/config/constants";

interface AnoldStoreState {
  status: AssistantStatus;
  config: AnoldConfig;
  transcript: ConversationMessage[];
  logLines: string[];
  lastDiagnostics: SystemDiagnostics | null;
  lastError: string | null;

  setStatus: (status: AssistantStatus) => void;
  setConfig: (patch: Partial<AnoldConfig>) => void;
  pushTranscript: (message: ConversationMessage) => void;
  clearTranscript: () => void;
  log: (line: string) => void;
  setDiagnostics: (diag: SystemDiagnostics) => void;
  setError: (error: string | null) => void;
}

const MAX_LOG_LINES = 200;

export const useAnoldStore = create<AnoldStoreState>((set) => ({
  status: "idle",
  config: DEFAULT_CONFIG,
  transcript: [],
  logLines: [],
  lastDiagnostics: null,
  lastError: null,

  setStatus: (status) => set({ status }),
  setConfig: (patch) => set((state) => ({ config: { ...state.config, ...patch } })),
  pushTranscript: (message) => set((state) => ({ transcript: [...state.transcript, message] })),
  clearTranscript: () => set({ transcript: [] }),
  log: (line) =>
    set((state) => {
      const timestamp = new Date().toLocaleTimeString();
      const entry = `[${timestamp}] ${line}`;
      const updated = [...state.logLines, entry];
      return { logLines: updated.slice(-MAX_LOG_LINES) };
    }),
  setDiagnostics: (diag) => set({ lastDiagnostics: diag }),
  setError: (error) => set({ lastError: error, status: error ? "error" : "idle" }),
}));
