import * as Calendar from "expo-calendar";
import { Platform } from "react-native";
import { z } from "zod";
import { Tool, ToolRegistry } from "./ToolRegistry";

async function ensurePermission(): Promise<void> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Calendar permission was not granted by the user.");
  }
}

async function getDefaultWritableCalendarId(): Promise<string> {
  await ensurePermission();
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find((cal) => cal.allowsModifications);
  if (!writable) {
    throw new Error("No writable calendar found on this device.");
  }
  return writable.id;
}

const checkScheduleSchema = z.object({
  startDateISO: z.string().describe("ISO 8601 start of the range to check, e.g. 2026-07-13T00:00:00"),
  endDateISO: z.string().describe("ISO 8601 end of the range to check, e.g. 2026-07-14T00:00:00"),
});
type CheckScheduleArgs = z.infer<typeof checkScheduleSchema>;

const checkScheduleTool: Tool<CheckScheduleArgs> = {
  name: "check_calendar_schedule",
  description:
    "Retrieves the user's calendar events between two ISO 8601 datetimes. " +
    "Use this to answer questions like 'what's on my calendar today' or 'am I free tomorrow at 3pm'.",
  schema: checkScheduleSchema,
  jsonSchemaProperties: {
    startDateISO: { type: "string", description: "ISO 8601 start datetime" },
    endDateISO: { type: "string", description: "ISO 8601 end datetime" },
  },
  requiredFields: ["startDateISO", "endDateISO"],
  execute: async (args) => {
    await ensurePermission();
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendarIds = calendars.map((c) => c.id);
    const start = new Date(args.startDateISO);
    const end = new Date(args.endDateISO);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Invalid ISO date provided.");
    }

    const events = await Calendar.getEventsAsync(calendarIds, start, end);
    if (events.length === 0) {
      return "No events found in that time range.";
    }
    const summary = events.map((e) => ({
      title: e.title,
      start: e.startDate,
      end: e.endDate,
      location: e.location ?? null,
      allDay: e.allDay ?? false,
    }));
    return JSON.stringify(summary);
  },
};

const createEventSchema = z.object({
  title: z.string().min(1),
  startDateISO: z.string(),
  endDateISO: z.string(),
  location: z.string().optional(),
  notes: z.string().optional(),
});
type CreateEventArgs = z.infer<typeof createEventSchema>;

const createEventTool: Tool<CreateEventArgs> = {
  name: "create_calendar_event",
  description:
    "Creates a new calendar event with a title, start/end time, and optional location/notes. " +
    "Use this when the user asks to schedule, book, or add something to their calendar.",
  schema: createEventSchema,
  jsonSchemaProperties: {
    title: { type: "string" },
    startDateISO: { type: "string", description: "ISO 8601 start datetime" },
    endDateISO: { type: "string", description: "ISO 8601 end datetime" },
    location: { type: "string" },
    notes: { type: "string" },
  },
  requiredFields: ["title", "startDateISO", "endDateISO"],
  execute: async (args) => {
    const calendarId = await getDefaultWritableCalendarId();
    const start = new Date(args.startDateISO);
    const end = new Date(args.endDateISO);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Invalid ISO date provided.");
    }
    if (end.getTime() <= start.getTime()) {
      throw new Error("Event end time must be after start time.");
    }

    const eventId = await Calendar.createEventAsync(calendarId, {
      title: args.title,
      startDate: start,
      endDate: end,
      location: args.location,
      notes: args.notes,
      timeZone: Platform.OS === "ios" ? undefined : Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    return `Created event "${args.title}" (id: ${eventId}) from ${start.toLocaleString()} to ${end.toLocaleString()}.`;
  },
};

export function registerCalendarTools(): void {
  ToolRegistry.register(checkScheduleTool);
  ToolRegistry.register(createEventTool);
}
