/**
 * Central, validated access point for all environment configuration.
 * Expo inlines EXPO_PUBLIC_* vars at build time via Metro, so these
 * are safe to read directly from process.env.
 *
 * IMPORTANT: EXPO_PUBLIC_* values are bundled into the client binary.
 * Do not put server-only secrets here. The Gemini key shipped this way
 * is visible to anyone who decompiles the app — for a real production
 * release, proxy Gemini calls through your own backend instead of
 * calling Google directly from the device.
 */

function readOptional(key: string): string | undefined {
  const value = process.env[key];
  return value && value.length > 0 ? value : undefined;
}

function readRequiredAtRuntime(key: string): string {
  const value = readOptional(key);
  if (!value) {
    throw new EnvError(key);
  }
  return value;
}

export class EnvError extends Error {
  constructor(missingKey: string) {
    super(
      `Missing required environment variable "${missingKey}". ` +
        `Copy .env.example to .env and fill it in, then restart the Expo dev server ` +
        `with "expo start -c" to clear the Metro cache.`
    );
    this.name = "EnvError";
  }
}

export const env = {
  gemini: {
    get apiKey(): string {
      return readRequiredAtRuntime("EXPO_PUBLIC_GEMINI_API_KEY");
    },
    modelFlash: readOptional("EXPO_PUBLIC_GEMINI_MODEL_FLASH") ?? "gemini-2.5-flash",
    modelPro: readOptional("EXPO_PUBLIC_GEMINI_MODEL_PRO") ?? "gemini-2.5-pro",
    isConfigured(): boolean {
      return readOptional("EXPO_PUBLIC_GEMINI_API_KEY") !== undefined;
    },
  },
  picovoice: {
    get accessKey(): string {
      return readRequiredAtRuntime("EXPO_PUBLIC_PICOVOICE_ACCESS_KEY");
    },
    isConfigured(): boolean {
      return readOptional("EXPO_PUBLIC_PICOVOICE_ACCESS_KEY") !== undefined;
    },
  },
  localModel: {
    filename: readOptional("EXPO_PUBLIC_LOCAL_MODEL_FILENAME") ?? "local-model.Q4_K_M.gguf",
    downloadUrl: readOptional("EXPO_PUBLIC_LOCAL_MODEL_DOWNLOAD_URL"),
  },
  whisper: {
    modelFilename: readOptional("EXPO_PUBLIC_WHISPER_MODEL_FILENAME") ?? "whisper-tiny.en.tflite",
  },
  assistant: {
    name: readOptional("EXPO_PUBLIC_ASSISTANT_NAME") ?? "Anold",
    wakePhrase: readOptional("EXPO_PUBLIC_WAKE_PHRASE") ?? "Hey Anold",
  },
};
