import * as SecureStore from "expo-secure-store";
import { v4 as uuidv4 } from "uuid";
import { ConversationMessage, MemoryState, UserProfile } from "@/types";
import { STORAGE_KEYS, MEMORY_LIMITS } from "@/config/constants";

/**
 * MemoryService persists:
 *  1. A long-term UserProfile (name, habits, extracted facts)
 *  2. A rolling short-term conversation history buffer
 *
 * expo-secure-store backs onto Keychain (iOS) / Keystore-encrypted
 * SharedPreferences (Android), so this data stays on-device and
 * encrypted at rest. Note: SecureStore has a ~2KB per-value limit on
 * some Android versions, so the rolling history is chunked defensively.
 */

const HISTORY_CHUNK_KEY_PREFIX = STORAGE_KEYS.ROLLING_HISTORY;
const HISTORY_INDEX_KEY = `${STORAGE_KEYS.ROLLING_HISTORY}.index`;

class MemoryServiceImpl {
  private cachedProfile: UserProfile | null = null;
  private cachedHistory: ConversationMessage[] | null = null;

  private emptyProfile(): UserProfile {
    const now = Date.now();
    return {
      name: null,
      preferredName: null,
      habits: [],
      facts: {},
      createdAt: now,
      updatedAt: now,
    };
  }

  async getProfile(): Promise<UserProfile> {
    if (this.cachedProfile) return this.cachedProfile;
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEYS.USER_PROFILE);
      if (!raw) {
        const empty = this.emptyProfile();
        this.cachedProfile = empty;
        return empty;
      }
      const parsed = JSON.parse(raw) as UserProfile;
      this.cachedProfile = parsed;
      return parsed;
    } catch (err) {
      console.error("[MemoryService] Failed to read profile, resetting.", err);
      const empty = this.emptyProfile();
      this.cachedProfile = empty;
      return empty;
    }
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    const updated: UserProfile = { ...profile, updatedAt: Date.now() };
    this.cachedProfile = updated;
    try {
      await SecureStore.setItemAsync(STORAGE_KEYS.USER_PROFILE, JSON.stringify(updated));
    } catch (err) {
      console.error("[MemoryService] Failed to persist profile.", err);
      throw new Error("Could not save user profile to secure storage.");
    }
  }

  async updateProfile(patch: Partial<Omit<UserProfile, "createdAt" | "updatedAt">>): Promise<UserProfile> {
    const current = await this.getProfile();
    const merged: UserProfile = {
      ...current,
      ...patch,
      facts: { ...current.facts, ...(patch.facts ?? {}) },
      habits: patch.habits ? Array.from(new Set([...current.habits, ...patch.habits])) : current.habits,
    };
    await this.saveProfile(merged);
    return merged;
  }

  async setFact(key: string, value: string): Promise<void> {
    const truncated = value.slice(0, MEMORY_LIMITS.MAX_FACT_LENGTH);
    const profile = await this.getProfile();
    profile.facts[key] = truncated;
    await this.saveProfile(profile);
  }

  async getHistory(): Promise<ConversationMessage[]> {
    if (this.cachedHistory) return this.cachedHistory;
    try {
      const indexRaw = await SecureStore.getItemAsync(HISTORY_INDEX_KEY);
      if (!indexRaw) {
        this.cachedHistory = [];
        return [];
      }
      const chunkCount: number = JSON.parse(indexRaw).chunkCount ?? 0;
      const messages: ConversationMessage[] = [];
      for (let i = 0; i < chunkCount; i++) {
        const chunkRaw = await SecureStore.getItemAsync(`${HISTORY_CHUNK_KEY_PREFIX}.${i}`);
        if (chunkRaw) {
          const chunkMessages = JSON.parse(chunkRaw) as ConversationMessage[];
          messages.push(...chunkMessages);
        }
      }
      this.cachedHistory = messages;
      return messages;
    } catch (err) {
      console.error("[MemoryService] Failed to read history, resetting.", err);
      this.cachedHistory = [];
      return [];
    }
  }

  async appendMessage(message: Omit<ConversationMessage, "id" | "timestamp"> & { id?: string; timestamp?: number }): Promise<ConversationMessage[]> {
    const full: ConversationMessage = {
      id: message.id ?? uuidv4(),
      timestamp: message.timestamp ?? Date.now(),
      role: message.role,
      content: message.content,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
    };
    const history = await this.getHistory();
    const updated = [...history, full].slice(-MEMORY_LIMITS.MAX_ROLLING_MESSAGES);
    await this.persistHistory(updated);
    return updated;
  }

  private async persistHistory(messages: ConversationMessage[]): Promise<void> {
    this.cachedHistory = messages;
    // Chunk into groups of 10 messages to stay under per-value size limits.
    const CHUNK_SIZE = 10;
    const chunks: ConversationMessage[][] = [];
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      chunks.push(messages.slice(i, i + CHUNK_SIZE));
    }
    try {
      await Promise.all(
        chunks.map((chunk, i) =>
          SecureStore.setItemAsync(`${HISTORY_CHUNK_KEY_PREFIX}.${i}`, JSON.stringify(chunk))
        )
      );
      await SecureStore.setItemAsync(HISTORY_INDEX_KEY, JSON.stringify({ chunkCount: chunks.length }));
    } catch (err) {
      console.error("[MemoryService] Failed to persist history.", err);
      throw new Error("Could not save conversation history to secure storage.");
    }
  }

  async clearHistory(): Promise<void> {
    const indexRaw = await SecureStore.getItemAsync(HISTORY_INDEX_KEY);
    const chunkCount: number = indexRaw ? JSON.parse(indexRaw).chunkCount ?? 0 : 0;
    await Promise.all(
      Array.from({ length: chunkCount }, (_, i) =>
        SecureStore.deleteItemAsync(`${HISTORY_CHUNK_KEY_PREFIX}.${i}`)
      )
    );
    await SecureStore.deleteItemAsync(HISTORY_INDEX_KEY);
    this.cachedHistory = [];
  }

  async wipeAll(): Promise<void> {
    await this.clearHistory();
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_PROFILE);
    this.cachedProfile = null;
  }

  async getFullState(): Promise<MemoryState> {
    const [profile, rollingHistory] = await Promise.all([this.getProfile(), this.getHistory()]);
    return { profile, rollingHistory };
  }
}

export const MemoryService = new MemoryServiceImpl();
