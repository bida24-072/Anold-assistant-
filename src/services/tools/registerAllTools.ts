import { registerCommunicationTools } from "./CommunicationService";
import { registerSystemTools } from "./SystemController";
import { registerCalendarTools } from "./CalendarService";

let registered = false;

/**
 * Idempotently registers every tool the assistant can call.
 * Call this once at app boot, before the first LLM request.
 */
export function registerAllTools(): void {
  if (registered) return;
  registerCommunicationTools();
  registerSystemTools();
  registerCalendarTools();
  registered = true;
}
