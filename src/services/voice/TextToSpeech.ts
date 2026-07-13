import { NativeModules } from "react-native";
import * as Speech from "expo-speech";
import { AnoldConfig } from "@/types";

/**
 * TextToSpeech: tries a fast offline neural TTS engine (sherpa-onnx) via a
 * native bridge first, and falls back to the OS's built-in TTS via
 * `expo-speech` (Android TextToSpeech / iOS AVSpeechSynthesizer) — which is
 * genuinely offline-capable on-device already, just lower fidelity than a
 * neural voice. This fallback means the app has REAL working speech output
 * out of the box even before you wire up a native sherpa-onnx module,
 * which is not true of the wake-word/ASR/local-LLM paths.
 *
 * To upgrade to sherpa-onnx: build a native module named `RNSherpaOnnx`
 * exposing `synthesize(text, voiceModelPath): Promise<{ audioFilePath }>`
 * using https://github.com/k2-fsa/sherpa-onnx's React Native bindings, then
 * this class will prefer it automatically.
 */

interface RNSherpaOnnxNativeModule {
  isReady(): Promise<boolean>;
  synthesize(text: string, options: { rate: number; pitch: number }): Promise<{ audioFilePath: string }>;
}

const RNSherpaOnnx = NativeModules.RNSherpaOnnx as RNSherpaOnnxNativeModule | undefined;

class TextToSpeechImpl {
  private speaking = false;
  private onDoneCallback: (() => void) | null = null;

  async speak(text: string, config: Pick<AnoldConfig, "ttsRate" | "ttsPitch">): Promise<void> {
    if (!text.trim()) return;
    this.speaking = true;

    const sherpaReady = RNSherpaOnnx ? await RNSherpaOnnx.isReady().catch(() => false) : false;

    if (sherpaReady && RNSherpaOnnx) {
      try {
        const { Audio } = await import("expo-av");
        const { audioFilePath } = await RNSherpaOnnx.synthesize(text, {
          rate: config.ttsRate,
          pitch: config.ttsPitch,
        });
        const { sound } = await Audio.Sound.createAsync({ uri: audioFilePath }, { shouldPlay: true });
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            this.speaking = false;
            this.onDoneCallback?.();
            sound.unloadAsync().catch(() => {});
          }
        });
        return;
      } catch (err) {
        console.warn("[TextToSpeech] sherpa-onnx synthesis failed, falling back to OS TTS.", err);
        // fall through to OS TTS below
      }
    }

    Speech.speak(text, {
      rate: config.ttsRate,
      pitch: config.ttsPitch,
      onDone: () => {
        this.speaking = false;
        this.onDoneCallback?.();
      },
      onStopped: () => {
        this.speaking = false;
      },
      onError: (err) => {
        this.speaking = false;
        console.error("[TextToSpeech] OS TTS error:", err);
      },
    });
  }

  onDone(callback: () => void): void {
    this.onDoneCallback = callback;
  }

  async stop(): Promise<void> {
    Speech.stop();
    this.speaking = false;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }
}

export const TextToSpeech = new TextToSpeechImpl();
