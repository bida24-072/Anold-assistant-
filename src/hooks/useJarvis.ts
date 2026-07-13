import { useCallback, useEffect, useRef } from "react";
import { Audio } from "expo-av";
import * as Network from "expo-network";
import { v4 as uuidv4 } from "uuid";
import { useAnoldStore } from "@/context/AnoldStore";
import { WakeWordService } from "@/services/voice/WakeWordService";
import { SpeechToText, SpeechToTextUnavailableError } from "@/services/voice/SpeechToText";
import { TextToSpeech } from "@/services/voice/TextToSpeech";
import { LLMManager } from "@/services/llm/LLMManager";
import { MemoryService } from "@/services/memory/MemoryService";
import { registerAllTools } from "@/services/tools/registerAllTools";
import { AUDIO_CONFIG } from "@/config/constants";
import { ConversationMessage } from "@/types";

function buildSystemPrompt(assistantName: string, userName: string | null): string {
  return [
    `You are ${assistantName}, a concise, capable voice assistant running on the user's phone.`,
    userName ? `The user's name is ${userName}.` : `You do not yet know the user's name — ask naturally if it becomes relevant.`,
    `Keep spoken responses short and conversational — you are being read aloud via text-to-speech, not displayed as long text.`,
    `Use the available tools when the user asks you to take an action (messaging, checking battery/network, calendar, brightness, settings). Do not claim to have done something you did not actually call a tool for.`,
    `Never claim you can silently send messages, place calls, or toggle Wi-Fi without the user's final tap — be upfront about that platform limitation if it's relevant.`,
  ].join(" ");
}

export function useJarvis() {
  const {
    status,
    setStatus,
    config,
    pushTranscript,
    log,
    setError,
    setDiagnostics,
  } = useAnoldStore();

  const isMountedRef = useRef(true);

  useEffect(() => {
    registerAllTools();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const safeSetStatus = useCallback(
    (next: Parameters<typeof setStatus>[0]) => {
      if (isMountedRef.current) setStatus(next);
    },
    [setStatus]
  );

  const handleWakeWordDetected = useCallback(async () => {
    log(`Wake word "${config.wakePhrase}" detected.`);
    safeSetStatus("wake_word_detected");
    await beginListeningTurn();
  }, [config.wakePhrase]);

  const handleWakeWordError = useCallback(
    (error: Error) => {
      log(`Wake word error: ${error.message}`);
      setError(error.message);
    },
    [log, setError]
  );

  const beginListeningTurn = useCallback(async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      safeSetStatus("recording");
      log("Recording user speech…");
      await SpeechToText.startRecording();

      await new Promise<void>((resolve) => {
        setTimeout(resolve, AUDIO_CONFIG.maxRecordingMs > 6000 ? 4000 : AUDIO_CONFIG.maxRecordingMs);
      });

      const { wavFilePath } = await SpeechToText.stopRecording();
      safeSetStatus("transcribing");
      log("Transcribing…");

      const networkState = await Network.getNetworkStateAsync();
      const online = Boolean(networkState.isConnected && networkState.isInternetReachable !== false);

      let transcript: string;
      if (config.offlineModeEnabled || !online) {
        try {
          transcript = await SpeechToText.transcribeOffline(wavFilePath);
        } catch (err) {
          if (err instanceof SpeechToTextUnavailableError && online) {
            log(`Offline STT unavailable (${err.message}), falling back to online.`);
            transcript = await SpeechToText.transcribeOnline(wavFilePath);
          } else {
            throw err;
          }
        }
      } else {
        transcript = await SpeechToText.transcribeOnline(wavFilePath);
      }

      if (!transcript.trim()) {
        log("Heard nothing usable, returning to wake-word listening.");
        safeSetStatus("listening_for_wake_word");
        return;
      }

      await processUserUtterance(transcript);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Error during listening turn: ${message}`);
      setError(message);
    }
  }, [config.offlineModeEnabled]);

  const processUserUtterance = useCallback(
    async (utterance: string) => {
      const userMessage: ConversationMessage = {
        id: uuidv4(),
        role: "user",
        content: utterance,
        timestamp: Date.now(),
      };
      pushTranscript(userMessage);
      log(`User: ${utterance}`);
      await MemoryService.appendMessage(userMessage);

      safeSetStatus("thinking");
      const profile = await MemoryService.getProfile();
      const history = await MemoryService.getHistory();
      const systemPrompt = buildSystemPrompt(config.assistantName, profile.preferredName ?? profile.name);

      try {
        const result = await LLMManager.generateWithTools(history, systemPrompt, {
          offlineModeEnabled: config.offlineModeEnabled,
          preferredBackend: config.preferredBackend,
        });

        if (result.toolResults.length > 0) {
          safeSetStatus("executing_tool");
          for (const toolResult of result.toolResults) {
            log(
              toolResult.success
                ? `Tool "${toolResult.toolName}" succeeded: ${toolResult.result}`
                : `Tool "${toolResult.toolName}" failed: ${toolResult.error}`
            );
          }
        }

        const assistantMessage: ConversationMessage = {
          id: uuidv4(),
          role: "assistant",
          content: result.finalText,
          timestamp: Date.now(),
        };
        pushTranscript(assistantMessage);
        log(`${config.assistantName} (${result.backendUsed}): ${result.finalText}`);
        await MemoryService.appendMessage(assistantMessage);

        safeSetStatus("speaking");
        await TextToSpeech.speak(result.finalText, config);
        TextToSpeech.onDone(() => {
          safeSetStatus("listening_for_wake_word");
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`LLM error: ${message}`);
        setError(message);
      }
    },
    [config, pushTranscript, log, setError]
  );

  const refreshDiagnostics = useCallback(async () => {
    try {
      const { ToolRegistry } = await import("@/services/tools/ToolRegistry");
      const result = await ToolRegistry.execute({ id: uuidv4(), toolName: "get_system_diagnostics", arguments: {} });
      if (result.success) {
        setDiagnostics(JSON.parse(result.result));
      }
    } catch (err) {
      console.warn("[useJarvis] Diagnostics refresh failed:", err);
    }
  }, [setDiagnostics]);

  const startWakeWordListening = useCallback(async () => {
    safeSetStatus("listening_for_wake_word");
    log("Starting wake-word engine…");
    await WakeWordService.start(handleWakeWordDetected, handleWakeWordError);
  }, [handleWakeWordDetected, handleWakeWordError]);

  const stopWakeWordListening = useCallback(async () => {
    await WakeWordService.stop();
    safeSetStatus("idle");
    log("Wake-word engine stopped.");
  }, []);

  /** Manual trigger for a "push to talk" button, bypassing the wake word. */
  const manualActivate = useCallback(async () => {
    log("Manually activated (push-to-talk).");
    safeSetStatus("wake_word_detected");
    await beginListeningTurn();
  }, [beginListeningTurn]);

  return {
    status,
    startWakeWordListening,
    stopWakeWordListening,
    manualActivate,
    refreshDiagnostics,
    processUserUtterance,
  };
}
