import { Platform, Linking } from "react-native";
import * as Battery from "expo-battery";
import * as Network from "expo-network";
import * as Brightness from "expo-brightness";
import { z } from "zod";
import { Tool, ToolRegistry } from "./ToolRegistry";
import { SystemDiagnostics } from "@/types";

/**
 * SystemController: read-only hardware diagnostics + safe system-settings
 * navigation. Note that neither iOS nor Android allow third-party apps to
 * silently toggle Wi-Fi or system volume without the user in the loop
 * (this has been locked down by both OS vendors for years) — so those
 * "toggle" tools open the relevant native settings screen rather than
 * lying about flipping the switch directly.
 */

async function getBatteryState(): Promise<string> {
  const state = await Battery.getBatteryStateAsync();
  switch (state) {
    case Battery.BatteryState.CHARGING:
      return "charging";
    case Battery.BatteryState.FULL:
      return "full";
    case Battery.BatteryState.UNPLUGGED:
      return "unplugged";
    default:
      return "unknown";
  }
}

async function getDiagnostics(): Promise<SystemDiagnostics> {
  const [batteryLevel, batteryState, networkState] = await Promise.all([
    Battery.getBatteryLevelAsync(),
    getBatteryState(),
    Network.getNetworkStateAsync(),
  ]);

  return {
    batteryLevel: batteryLevel >= 0 ? Math.round(batteryLevel * 100) : null,
    batteryState,
    isConnected: networkState.isConnected ?? null,
    networkType: networkState.type ?? null,
    timestamp: Date.now(),
  };
}

const getDiagnosticsTool: Tool<Record<string, never>> = {
  name: "get_system_diagnostics",
  description:
    "Retrieves current device diagnostics: battery percentage, battery state (charging/unplugged/full), " +
    "network connectivity, and connection type (wifi/cellular). Use this when the user asks about battery, " +
    "signal, or connectivity status.",
  schema: z.object({}),
  jsonSchemaProperties: {},
  requiredFields: [],
  execute: async () => {
    const diag = await getDiagnostics();
    return JSON.stringify(diag);
  },
};

const setBrightnessSchema = z.object({
  level: z.number().min(0).max(1).describe("Brightness level from 0.0 (dim) to 1.0 (max)"),
});
type SetBrightnessArgs = z.infer<typeof setBrightnessSchema>;

const setBrightnessTool: Tool<SetBrightnessArgs> = {
  name: "set_screen_brightness",
  description: "Sets the device screen brightness to a value between 0.0 and 1.0.",
  schema: setBrightnessSchema,
  jsonSchemaProperties: {
    level: { type: "number", description: "0.0 to 1.0", minimum: 0, maximum: 1 },
  },
  requiredFields: ["level"],
  execute: async (args) => {
    const { status } = await Brightness.requestPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Brightness permission was not granted by the user.");
    }
    await Brightness.setSystemBrightnessAsync(args.level);
    return `Screen brightness set to ${Math.round(args.level * 100)}%.`;
  },
};

const openWifiSettingsTool: Tool<Record<string, never>> = {
  name: "open_wifi_settings",
  description:
    "Opens the native Wi-Fi settings screen so the user can toggle Wi-Fi or pick a network. " +
    "Cannot toggle Wi-Fi directly — both iOS and Android block silent Wi-Fi control for third-party apps.",
  schema: z.object({}),
  jsonSchemaProperties: {},
  requiredFields: [],
  execute: async () => {
    if (Platform.OS === "ios") {
      await Linking.openURL("App-Prefs:root=WIFI");
      return "Opened iOS Wi-Fi settings. Note: Apple only allows this to work from certain contexts and it may open general Settings instead.";
    }
    const IntentLauncher = await import("expo-intent-launcher");
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.WIFI_SETTINGS);
    return "Opened Android Wi-Fi settings.";
  },
};

const openAppSettingsTool: Tool<Record<string, never>> = {
  name: "open_app_settings",
  description: "Opens this app's own settings page in the OS settings app (permissions, notifications, etc).",
  schema: z.object({}),
  jsonSchemaProperties: {},
  requiredFields: [],
  execute: async () => {
    await Linking.openSettings();
    return "Opened app settings.";
  },
};

export function registerSystemTools(): void {
  ToolRegistry.register(getDiagnosticsTool);
  ToolRegistry.register(setBrightnessTool);
  ToolRegistry.register(openWifiSettingsTool);
  ToolRegistry.register(openAppSettingsTool);
}
