import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import { HUDScreen } from "@/components/HUD/HUDScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { registerBackgroundTask, requestNotificationPermissions } from "@/services/BackgroundService";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function App() {
  useEffect(() => {
    (async () => {
      try {
        await requestNotificationPermissions();
        await registerBackgroundTask();
      } catch (err) {
        console.error("[App] Failed to initialize background services:", err);
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <HUDScreen />
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
