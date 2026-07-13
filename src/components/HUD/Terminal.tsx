import React, { useEffect, useRef } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { HUD_THEME } from "@/config/constants";

interface TerminalProps {
  lines: string[];
  maxHeight?: number;
}

export function Terminal({ lines, maxHeight = 220 }: TerminalProps) {
  const listRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (lines.length > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [lines.length]);

  return (
    <View style={[styles.container, { maxHeight }]}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: HUD_THEME.colors.danger }]} />
        <View style={[styles.dot, { backgroundColor: HUD_THEME.colors.accentAmber }]} />
        <View style={[styles.dot, { backgroundColor: HUD_THEME.colors.success }]} />
        <Text style={styles.headerText}>SYSTEM LOG</Text>
      </View>
      <FlatList
        ref={listRef}
        data={lines}
        keyExtractor={(_, index) => String(index)}
        renderItem={({ item }) => <Text style={styles.line}>{item}</Text>}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: HUD_THEME.colors.backgroundElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HUD_THEME.colors.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: HUD_THEME.colors.border,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerText: {
    marginLeft: 8,
    color: HUD_THEME.colors.textSecondary,
    fontSize: 11,
    letterSpacing: 2,
  },
  list: {
    padding: 10,
  },
  listContent: {
    gap: 4,
  },
  line: {
    color: HUD_THEME.colors.terminalGreen,
    fontSize: 11,
    fontFamily: "monospace",
    lineHeight: 16,
  },
});
