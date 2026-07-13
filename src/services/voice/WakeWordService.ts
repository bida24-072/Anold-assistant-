import { Platform } from "react-native";
import {
  PorcupineManager,
  PorcupineErrors,
} from "@picovoice/porcupine-react-native";
import { env } from "@/config/env";

/**
 * WakeWordService wraps Picovoice Porcupine for continuous "Hey Anold"
 * detection. Porcupine requires a custom-trained .ppn keyword file per
 * platform, generated at https://console.picovoice.ai/ for the phrase
 * "Hey Anold" — it cannot be synthesized from code. Place the trained
 * files at:
 *   assets/wakeword/hey-anold-android.ppn
 *   assets/wakeword/hey-anold-ios.ppn
 * and reference them via `require(...)` below (Metro needs static
 * requires for binary assets — a dynamic path string will not bundle).
 */

export type WakeWordCallback = () => void;
export type WakeWordErrorCallback = (error: Error) => void;

class WakeWordServiceImpl {
  private manager: PorcupineManager | null = null;
  private isListening = false;

  private getKeywordAsset() {
    // NOTE: these requires will fail at bundle time until you add the
    // actual .ppn files trained for "Hey Anold" from Picovoice Console.
    // This is expected and intentional — Metro needs the files to exist
    // to resolve the require graph, matching how every RN app ships
    // custom wake-word models.
    if (Platform.OS === "ios") {
      return require("../../../assets/wakeword/hey-anold-ios.ppn");
    }
    return require("../../../assets/wakeword/hey-anold-android.ppn");
  }

  private getModelAsset() {
    // Porcupine's base language model (English), also downloaded from
    // Picovoice Console alongside your keyword file.
    return require("../../../assets/wakeword/porcupine_params.pv");
  }

  async start(onDetected: WakeWordCallback, onError: WakeWordErrorCallback): Promise<void> {
    if (this.isListening) return;

    if (!env.picovoice.isConfigured()) {
      onError(
        new Error(
          "EXPO_PUBLIC_PICOVOICE_ACCESS_KEY is not set. Get a free access key at https://console.picovoice.ai/"
        )
      );
      return;
    }

    try {
      this.manager = await PorcupineManager.fromKeywordPaths(
        env.picovoice.accessKey,
        [this.getKeywordAsset()],
        (keywordIndex: number) => {
          if (keywordIndex === 0) {
            onDetected();
          }
        },
        (error: PorcupineErrors.PorcupineError) => {
          onError(new Error(`Porcupine engine error: ${error.message}`));
        },
        this.getModelAsset()
      );

      await this.manager.start();
      this.isListening = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onError(
        new Error(
          `Failed to start wake word detection: ${message}. Common causes: microphone permission ` +
            `denied, missing/invalid .ppn keyword file, or an invalid Picovoice access key.`
        )
      );
    }
  }

  async stop(): Promise<void> {
    if (!this.manager || !this.isListening) return;
    try {
      await this.manager.stop();
      await this.manager.delete();
    } finally {
      this.manager = null;
      this.isListening = false;
    }
  }

  get listening(): boolean {
    return this.isListening;
  }
}

export const WakeWordService = new WakeWordServiceImpl();
