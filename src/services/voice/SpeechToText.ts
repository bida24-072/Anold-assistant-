import { NativeModules } from "react-native";
import LiveAudioStream from "react-native-live-audio-stream";
import * as FileSystem from "expo-file-system";
import { env } from "@/config/env";
import { AUDIO_CONFIG } from "@/config/constants";

/**
 * SpeechToText: offline-first pipeline.
 *
 * Online path: streams raw PCM to Gemini via inline audio content (Gemini
 * 2.5 accepts audio directly, so for online mode we skip a separate ASR
 * step entirely and let Gemini transcribe+understand in one call — see
 * GeminiClient usage in useJarvis.ts).
 *
 * Offline path: buffers 16kHz mono PCM16 from the mic via
 * react-native-live-audio-stream, writes it to a WAV file, and hands it to
 * a native `RNWhisperTFLite` module for on-device transcription. Like the
 * local LLM, that native module needs a real Whisper TFLite model file and
 * a compiled native binding — it is not achievable in pure JS. The
 * realistic path is https://github.com/mybigday/whisper.rn (a maintained
 * React Native wrapper around whisper.cpp with TFLite/CoreML acceleration
 * support) — see native/README.md.
 */

interface RNWhisperNativeModule {
  transcribeFile(wavPath: string, modelPath: string): Promise<{ text: string; durationMs: number }>;
}

const RNWhisperTFLite = NativeModules.RNWhisperTFLite as RNWhisperNativeModule | undefined;

export class SpeechToTextUnavailableError extends Error {
  constructor(reason: string) {
    super(`Offline speech-to-text unavailable: ${reason}`);
    this.name = "SpeechToTextUnavailableError";
  }
}

type AudioChunkListener = (base64Chunk: string) => void;

class SpeechToTextImpl {
  private recording = false;
  private chunks: string[] = [];
  private chunkListener: AudioChunkListener | null = null;

  private initStream(): void {
    LiveAudioStream.init({
      sampleRate: AUDIO_CONFIG.sampleRate,
      channels: AUDIO_CONFIG.channels,
      bitsPerSample: AUDIO_CONFIG.bitsPerSample,
      audioSource: 6, // VOICE_RECOGNITION on Android; ignored on iOS
      bufferSize: 4096,
      wavFile: "anold_capture.wav",
    });
  }

  /** Begin buffering microphone audio. Call stopRecording() to get the result. */
  async startRecording(): Promise<void> {
    if (this.recording) return;
    this.initStream();
    this.chunks = [];
    LiveAudioStream.on("data", (base64Chunk: string) => {
      this.chunks.push(base64Chunk);
      this.chunkListener?.(base64Chunk);
    });
    LiveAudioStream.start();
    this.recording = true;
  }

  /** Optional: subscribe for a live waveform visualizer while recording. */
  onAudioChunk(listener: AudioChunkListener): () => void {
    this.chunkListener = listener;
    return () => {
      this.chunkListener = null;
    };
  }

  /**
   * Stops recording and returns the captured audio as a base64 PCM16 blob
   * (for sending to a cloud model) and the local WAV file path (for local
   * Whisper transcription).
   */
  async stopRecording(): Promise<{ base64Audio: string; wavFilePath: string }> {
    if (!this.recording) {
      throw new Error("stopRecording() called but no recording was in progress.");
    }
    LiveAudioStream.stop();
    this.recording = false;

    const base64Audio = this.chunks.join("");
    const wavFilePath = `${FileSystem.cacheDirectory}anold_capture.wav`;
    return { base64Audio, wavFilePath };
  }

  get isRecording(): boolean {
    return this.recording;
  }

  /**
   * Online transcription via the Gemini API's native audio understanding.
   * Gemini 2.5 Flash accepts inline audio and can transcribe directly,
   * which is lower-latency than a separate ASR call followed by a second
   * text call, so this is the default path whenever the device is online.
   */
  async transcribeOnline(wavFilePath: string): Promise<string> {
    const base64Wav = await FileSystem.readAsStringAsync(wavFilePath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!env.gemini.isConfigured()) {
      throw new Error("Gemini API key not configured; cannot transcribe online.");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.gemini.modelFlash}:generateContent?key=${env.gemini.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: "Transcribe the following audio exactly. Reply with ONLY the transcribed words, nothing else." },
              { inlineData: { mimeType: "audio/wav", data: base64Wav } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 256, temperature: 0 },
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(`Gemini transcription error: ${json?.error?.message ?? response.status}`);
    }
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Gemini returned an empty transcription.");
    }
    return text.trim();
  }

  /** Offline transcription via the native Whisper TFLite bridge. */
  async transcribeOffline(wavFilePath: string): Promise<string> {
    if (!RNWhisperTFLite) {
      throw new SpeechToTextUnavailableError(
        "Native module \"RNWhisperTFLite\" is not registered. Requires a custom dev client build " +
          "with whisper.rn installed — see native/README.md."
      );
    }
    const modelPath = `${FileSystem.documentDirectory}models/${env.whisper.modelFilename}`;
    const modelInfo = await FileSystem.getInfoAsync(modelPath);
    if (!modelInfo.exists) {
      throw new SpeechToTextUnavailableError(
        `Whisper model not found at ${modelPath}. Download a whisper-tiny/base .tflite model into that path.`
      );
    }
    const result = await RNWhisperTFLite.transcribeFile(wavFilePath, modelPath);
    return result.text.trim();
  }
}

export const SpeechToText = new SpeechToTextImpl();
