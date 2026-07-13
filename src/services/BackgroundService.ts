import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * Honest scope note: neither iOS nor Android allow a third-party app to
 * run continuous raw microphone wake-word detection indefinitely in the
 * true background the way a first-party assistant (Siri/Google Assistant)
 * can — that requires OS-level privileged entitlements Apple/Google do not
 * grant to normal apps. What IS achievable and implemented here:
 *
 *  - Foreground/active-app wake-word listening: works continuously while
 *    the app is open (including screen-off with a foreground service on
 *    Android, since RECORD_AUDIO + FOREGROUND_SERVICE_MICROPHONE keeps the
 *    mic session alive).
 *  - A periodic background task (BackgroundFetch/TaskManager) that keeps
 *    app state warm and can post a "tap to resume listening" notification,
 *    since iOS suspends audio input entirely once the app is fully
 *    backgrounded without an active audio session.
 *  - `RECEIVE_BOOT_COMPLETED` + `WAKE_LOCK` permissions declared in
 *    app.json so a native Android foreground service (added at prebuild
 *    time, see native/README.md) CAN legitimately restart listening after
 *    device boot — this is standard for voice-assistant apps on Android
 *    but has no iOS equivalent.
 */

export const BACKGROUND_WAKE_TASK = "anold-background-wake-refresh";

TaskManager.defineTask(BACKGROUND_WAKE_TASK, async () => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Anold is paused",
        body: "Tap to reopen and resume wake-word listening.",
        sound: false,
      },
      trigger: null,
    });
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.error("[BackgroundService] Background task failed:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTask(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (status === BackgroundFetch.BackgroundFetchStatus.Restricted || status === BackgroundFetch.BackgroundFetchStatus.Denied) {
    console.warn("[BackgroundService] Background fetch is restricted/denied by the OS.");
    return;
  }

  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_WAKE_TASK);
  if (alreadyRegistered) return;

  await BackgroundFetch.registerTaskAsync(BACKGROUND_WAKE_TASK, {
    minimumInterval: 15 * 60, // 15 minutes — OS minimum enforced regardless of a smaller value
    stopOnTerminate: false,
    startOnBoot: Platform.OS === "android",
  });
}

export async function unregisterBackgroundTask(): Promise<void> {
  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_WAKE_TASK);
  if (alreadyRegistered) {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_WAKE_TASK);
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}
