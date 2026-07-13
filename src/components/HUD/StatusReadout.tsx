import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { HUD_THEME } from "@/config/constants";
import { AssistantStatus, SystemDiagnostics } from "@/types";

interface StatusReadoutProps {
  status: AssistantStatus;
  diagnostics: SystemDiagnostics | null;
  assistantName: string;
}

const STATUS_LABELS: Record<AssistantStatus, string> = {
  idle: "STANDBY",
  listening_for_wake_word: "LISTENING FOR WAKE WORD",
  wake_word_detected: "WAKE WORD DETECTED",
  recording: "RECORDING",
  transcribing: "TRANSCRIBING",
  thinking: "PROCESSING",
  executing_tool: "EXECUTING ACTION",
  speaking: "RESPONDING",
  error: "ERROR",
};

export function StatusReadout({ status, diagnostics, assistantName }: StatusReadoutProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.assistantName}>{assistantName.toUpperCase()}</Text>
      <Text style={styles.status}>{STATUS_LABELS[status]}</Text>
      {diagnostics && (
        <View style={styles.diagRow}>
          <Text style={styles.diagText}>
            BATT {diagnostics.batteryLevel ?? "--"}% · {diagnostics.batteryState ?? "unknown"}
          </Text>
          <Text style={styles.diagText}>
            {diagnostics.isConnected ? (diagnostics.networkType ?? "online").toUpperCase() : "OFFLINE"}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 4,
  },
  assistantName: {
    color: HUD_THEME.colors.reactorCore,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 4,
  },
  status: {
    color: HUD_THEME.colors.textSecondary,
    fontSize: 12,
    letterSpacing: 3,
  },
  diagRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },
  diagText: {
    color: HUD_THEME.colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: "monospace",
  },
});
