# Anold — On-Device AI Voice Assistant

A React Native + Expo + TypeScript voice assistant with wake-word
detection, hybrid cloud/local LLM reasoning, tool-use (WhatsApp deep
links, calendar, system diagnostics), secure local memory, and a
sci-fi "HUD" interface.

## What actually works out of the box

| Capability | Status |
|---|---|
| HUD UI (reactor core, terminal, status) | ✅ Fully working |
| Secure local memory (profile + conversation history) | ✅ Fully working |
| Tool-use engine (Zod-validated, LLM function-calling) | ✅ Fully working |
| WhatsApp / dialer deep linking | ✅ Fully working |
| Calendar check/create | ✅ Fully working |
| Battery / network / brightness / settings tools | ✅ Fully working |
| Cloud LLM reasoning (Gemini 2.5 Flash/Pro) | ✅ Fully working, needs your API key |
| Cloud transcription (Gemini audio understanding) | ✅ Fully working, needs your API key |
| Offline TTS | ✅ Working via OS built-in synthesizer (`expo-speech`); upgradable to neural sherpa-onnx voices |
| Wake word ("Hey Anold") | ⚙️ Code complete, needs a `.ppn` file you train (free, ~5 min) at Picovoice Console |
| Offline local LLM (llama.cpp/GGUF) | ⚙️ Code complete, needs a native build (`expo prebuild` + llama.rn) — see `native/README.md` |
| Offline Whisper transcription | ⚙️ Code complete, needs a native build (whisper.rn) — see `native/README.md` |
| Neural offline TTS (sherpa-onnx) | ⚙️ Optional upgrade, needs a native build — see `native/README.md` |
| True background (screen-off / app-killed) listening | ⚠️ Partially possible — see "Background limitations" below |

The ⚙️ items are things **no one** — no framework, no amount of code —
can ship as pure JavaScript, because they wrap compiled inference engines
or require phone-specific trained model files. The code for all of them
is complete and production-shaped; what's missing is binary assets and a
native compile step, both documented exactly in `native/README.md`.

## Quick start (cloud-only mode — works in ~10 minutes)

```bash
npm install
cp .env.example .env
```

Edit `.env`:
```
EXPO_PUBLIC_GEMINI_API_KEY=your_key_from_aistudio.google.com
```

```bash
npx expo start
```

In this mode: push-to-talk works immediately (records → transcribes via
Gemini → reasons via Gemini → speaks via OS TTS → can message/calendar/
check diagnostics). The wake word and fully-offline path need the extra
setup below.

## Full setup (wake word + offline mode)

1. Get a Picovoice access key and train "Hey Anold" — see
   `assets/wakeword/README.md`.
2. Run `npx expo prebuild` to generate native Android/iOS projects.
3. Follow `native/README.md` to wire up `llama.rn` (local LLM) and
   `whisper.rn` (offline transcription).
4. `npx expo run:android` or `npx expo run:ios`.

## Project structure

```
App.tsx                          Root component, background task init
src/
  types/                         Shared TypeScript types
  config/                        Env validation, constants, HUD theme
  services/
    llm/
      GeminiClient.ts            Cloud LLM + function calling
      LocalLLMClient.ts          Offline LLM native bridge wrapper
      LLMManager.ts               Backend routing + tool-call loop
    voice/
      WakeWordService.ts         Porcupine wake-word engine
      SpeechToText.ts             Online (Gemini) + offline (Whisper) STT
      TextToSpeech.ts             Offline-capable TTS (OS + optional neural)
    tools/
      ToolRegistry.ts             Zod schema + execution engine
      CommunicationService.ts     WhatsApp/dialer deep links
      SystemController.ts         Battery/network/brightness/settings
      CalendarService.ts          expo-calendar integration
    memory/
      MemoryService.ts            expo-secure-store persistence
    BackgroundService.ts          expo-task-manager background refresh
  hooks/
    useJarvis.ts                  Full pipeline orchestration
  context/
    AnoldStore.ts                 Zustand global state
  components/HUD/
    ReactorCore.tsx                Animated glowing core visualizer
    Terminal.tsx                   Live scrolling log
    StatusReadout.tsx              Status + diagnostics text
    HUDScreen.tsx                  Screen composition
native/README.md                 Exact native module build instructions
assets/wakeword/                 Where your trained .ppn files go
```

## Background limitations (read this before promising "always listening")

Neither iOS nor Android grant third-party apps Siri/Google-Assistant-level
privileges to run continuous raw microphone capture while fully
backgrounded or after force-quit — that tier of access is OS-reserved.
What this app *can* legitimately do:

- Listen continuously while open, including screen-off, via an Android
  foreground service (persistent notification required by the OS — this
  is not a bug, Android mandates it for any mic-using foreground service).
- On iOS, keep listening while backgrounded only via an active audio
  session (`UIBackgroundModes: audio`), which Apple reviews on submission.
- Restart listening on device boot on Android (`RECEIVE_BOOT_COMPLETED`),
  with no iOS equivalent (Apple does not allow launch-on-boot for
  non-system apps).

`src/services/BackgroundService.ts` and `native/README.md` §5–6 document
the real mechanism and its limits in detail.

## Known constraints worth knowing before you rely on this

- **WhatsApp messages are pre-filled, not auto-sent.** No app can send on
  a user's behalf without their tap — see comments in
  `CommunicationService.ts`.
- **Wi-Fi/volume cannot be silently toggled** by third-party apps on
  modern iOS/Android; the tools open the relevant settings screen instead.
- **Shipping the Gemini key in `EXPO_PUBLIC_*` bundles it into the client
  binary.** Fine for personal/prototype use; for a real release, proxy
  Gemini calls through your own backend so the key isn't extractable from
  the app package.
- **Local LLM quality**: a phone-sized quantized model (1–3B params) will
  be noticeably less capable at following tool-use instructions than
  Gemini. The local prompt protocol in `LocalLLMClient.ts` is deliberately
  simplified (a text marker instead of strict JSON schema) for this reason.
