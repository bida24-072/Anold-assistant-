import React, { useEffect } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAnoldStore } from "@/context/AnoldStore";
import { useJarvis } from "@/hooks/useJarvis";
import { ReactorCore } from "./ReactorCore";
import { Terminal } from "./Terminal";
import { StatusReadout } from "./StatusReadout";
import { HUD_THEME } from "@/config/constants";

export function HUDScreen() {
  const { logLines, lastDiagnostics, lastError, config, transcript } = useAnoldStore();
  const { status, startWakeWordListening, stopWakeWordListening, manualActivate, refreshDiagnostics } =
    useJarvis();

  useEffect(() => {
    refreshDiagnostics();
    const interval = setInterval(refreshDiagnostics, 30000);
    return () => clearInterval(interval);
  }, [refreshDiagnostics]);

  const isListening = status !== "idle";
  const lastMessage = transcript[transcript.length - 1];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StatusReadout status={status} diagnostics={lastDiagnostics} assistantName={config.assistantName} />

        <View style={styles.coreWrapper}>
          <ReactorCore status={status} size={240} />
        </View>

        {lastError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{lastError}</Text>
          </View>
        )}

        {lastMessage && (
          <View style={styles.lastMessageBox}>
            <Text style={styles.lastMessageRole}>{lastMessage.role === "user" ? "YOU" : config.assistantName.toUpperCase()}</Text>
            <Text style={styles.lastMessageText}>{lastMessage.content}</Text>
          </View>
        )}

        <View style={styles.controlsRow}>
          <Pressable
            style={[styles.controlButton, isListening ? styles.controlButtonActive : null]}
            onPress={isListening ? stopWakeWordListening : startWakeWordListening}
          >
            <Text style={styles.controlButtonText}>{isListening ? "STOP" : "ACTIVATE"}</Text>
          </Pressable>

          <Pressable style={[styles.controlButton, styles.pushToTalk]} onPress={manualActivate}>
            <Text style={styles.controlButtonText}>PUSH TO TALK</Text>
          </Pressable>
        </View>

        <Terminal lines={logLines} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: HUD_THEME.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    padding: 20,
    gap: 20,
  },
  coreWrapper: {
    marginVertical: 12,
  },
  errorBanner: {
    backgroundColor: "rgba(255, 59, 59, 0.12)",
    borderColor: HUD_THEME.colors.danger,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    width: "100%",
  },
  errorText: {
    color: HUD_THEME.colors.danger,
    fontSize: 12,
  },
  lastMessageBox: {
    width: "100%",
    backgroundColor: HUD_THEME.colors.backgroundElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HUD_THEME.colors.border,
    padding: 14,
  },
  lastMessageRole: {
    color: HUD_THEME.colors.reactorCore,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
  },
  lastMessageText: {
    color: HUD_THEME.colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
  },
  controlsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  controlButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: HUD_THEME.colors.reactorCore,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  controlButtonActive: {
    backgroundColor: "rgba(0, 229, 255, 0.12)",
  },
  pushToTalk: {
    borderColor: HUD_THEME.colors.accentAmber,
  },
  controlButtonText: {
    color: HUD_THEME.colors.textPrimary,
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "600",
  },
});
