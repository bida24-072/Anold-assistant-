# Wake word assets go here

This folder must contain, before the app will build successfully:

- `hey-anold-android.ppn` — trained at https://console.picovoice.ai/ for the phrase "Hey Anold" (Android target)
- `hey-anold-ios.ppn` — same phrase, iOS target
- `porcupine_params.pv` — Porcupine's shared English language model, downloaded from the same console

See `/native/README.md` section 4 for the full walkthrough.

Until these files exist, `WakeWordService.ts`'s `require(...)` calls will
fail at Metro bundle time — this is expected and intentional, not a bug.
