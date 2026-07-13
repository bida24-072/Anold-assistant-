# Native Modules — Build Instructions

This app's TypeScript layer is 100% real and complete. Three capabilities,
however, are physically incapable of being pure JavaScript because they
wrap compiled C++ inference engines: **local LLM inference**, **offline
speech-to-text**, and **neural offline text-to-speech**. This document is
the exact, real path to making each of those native modules exist.

None of this works in **Expo Go**. You need a custom dev client:

```bash
npx expo install expo-dev-client
npx expo prebuild
```

`expo prebuild` generates real `android/` and `ios/` native project
folders from `app.json`. From that point on this is a normal React Native
native-module project, built with `expo run:android` / `expo run:ios` (or
EAS Build for CI).

---

## 1. Local LLM inference — `RNLlamaCpp`

Use **llama.rn** (https://github.com/mybigday/llama.rn), the maintained
React Native wrapper around llama.cpp with prebuilt Android/iOS bindings.
Do not hand-roll JNI/Objective-C++ bindings from scratch — llama.rn
already solves cross-compilation, Metal/Vulkan acceleration, and memory
mapping correctly.

```bash
npm install llama.rn
npx pod-install ios
```

In a small bridge file (e.g. `native/RNLlamaCppBridge.ts`), map llama.rn's
`initLlama()` / `context.completion()` API onto the `RNLlamaCpp` contract
this app expects (`loadModel`, `completion`, `stopCompletion`,
`isModelLoaded`, `unloadModel`) as defined in
`src/services/llm/LocalLLMClient.ts`. llama.rn's method names differ
slightly from the contract there by design — that file documents the
exact shape to adapt to, since llama.rn's public API changes between
minor versions and pinning to it directly inside `LocalLLMClient.ts`
would make this app brittle to upstream releases.

Then register it once at app startup, before any generate() call:
```ts
import { NativeModules } from "react-native";
import { RNLlamaCppBridge } from "./native/RNLlamaCppBridge";
NativeModules.RNLlamaCpp = RNLlamaCppBridge;
```

**Model choice**: for a phone to run this at usable speed, use a small
quantized instruct model — `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` or
`Llama-3.2-3B-Instruct-Q4_K_M.gguf` are good starting points (both
available on Hugging Face). Anything larger than ~3B parameters will be
noticeably slow on mid-range phones and is not recommended for a
responsive voice assistant.

---

## 2. Offline speech-to-text — `RNWhisperTFLite`

Use **whisper.rn** (https://github.com/mybigday/whisper.rn), which wraps
whisper.cpp with the same maintainer ecosystem as llama.rn, giving
consistent build tooling.

```bash
npm install whisper.rn
```

Download a small Whisper GGML/TFLite model (`whisper-tiny.en` or
`whisper-base.en` — tiny is recommended for real-time mobile use) and
place it in the app's document directory at runtime (see
`downloadModel`-style pattern already used for the local LLM in
`LocalLLMClient.ts` — replicate the same pattern for Whisper).

Bridge whisper.rn's `initWhisper()` / `context.transcribe()` onto the
`RNWhisperTFLite.transcribeFile(wavPath, modelPath)` contract expected by
`src/services/voice/SpeechToText.ts`.

---

## 3. Offline neural TTS — `RNSherpaOnnx`

Use **sherpa-onnx** (https://github.com/k2-fsa/sherpa-onnx), which ships
official React Native bindings under `sherpa-onnx-react-native` with
prebuilt VITS/Matcha voice models.

```bash
npm install sherpa-onnx-react-native
```

Bridge its synthesis API onto the `RNSherpaOnnx.synthesize(text, options)`
contract in `src/services/voice/TextToSpeech.ts`. Note this one is
optional — the app already has a fully working offline TTS fallback via
`expo-speech` (the OS's built-in synthesizer), so sherpa-onnx is purely a
voice-quality upgrade, not a functionality gap.

---

## 4. Wake word model files (Porcupine)

1. Go to https://console.picovoice.ai/, create a free account.
2. Train a custom wake word for the phrase **"Hey Anold"** — Picovoice's
   console generates a `.ppn` file per target platform (Android/iOS)
   after a short training step (usually instant for common phonetic
   patterns; a review can take longer for unusual phrases).
3. Download the resulting files and the shared `porcupine_params.pv`
   language model, and place them at:
   ```
   assets/wakeword/hey-anold-android.ppn
   assets/wakeword/hey-anold-ios.ppn
   assets/wakeword/porcupine_params.pv
   ```
4. `@picovoice/porcupine-react-native` needs a native prebuild step too —
   run `npx expo prebuild` after installing it so its autolinking config
   plugin registers correctly.

---

## 5. Android foreground service for background listening

To let wake-word detection survive the screen turning off (not full
app-kill background, which no third-party Android app is allowed
continuous mic access for), add a foreground service after prebuild.

In `android/app/src/main/AndroidManifest.xml`, inside `<application>`:
```xml
<service
    android:name=".WakeWordForegroundService"
    android:foregroundServiceType="microphone"
    android:exported="false" />
<receiver
    android:name=".BootReceiver"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

`WakeWordForegroundService.kt` and `BootReceiver.kt` need to be added to
`android/app/src/main/java/com/anold/assistant/` — a minimal foreground
service that starts `PorcupineManager` and posts the required persistent
notification (Android requires a visible notification for any foreground
service, by design, so the user always knows a mic-using service is
active).

## 6. iOS background audio

iOS suspends microphone access the moment the app is backgrounded unless
an active `AVAudioSession` with the `audio` background mode (already
declared in `app.json` → `ios.infoPlist.UIBackgroundModes`) is running.
Even then, Apple's review guidelines require this background mode be used
for genuine continuous audio functionality — a wake-word listener
qualifies, but expect App Store review scrutiny and be ready to explain
the use case in your review notes.
