import React, { Component, ErrorInfo, ReactNode } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { HUD_THEME } from "@/config/constants";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Anold hit an unexpected error</Text>
          <Text style={styles.message}>{this.state.errorMessage}</Text>
          <Pressable style={styles.button} onPress={this.reset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: HUD_THEME.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: {
    color: HUD_THEME.colors.danger,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    color: HUD_THEME.colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  button: {
    borderWidth: 1,
    borderColor: HUD_THEME.colors.reactorCore,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: HUD_THEME.colors.textPrimary,
    letterSpacing: 2,
  },
});
