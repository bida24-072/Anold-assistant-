import { Linking } from "react-native";
import { z } from "zod";
import { Tool, ToolRegistry } from "./ToolRegistry";

/**
 * CommunicationService: deep-links into WhatsApp with a pre-filled message.
 *
 * IMPORTANT LIMITATION: WhatsApp's `whatsapp://send` scheme opens the chat
 * with text pre-populated in the input field — it does NOT send the message
 * automatically. There is no public API for a third-party app to silently
 * send a WhatsApp message without the user tapping send themselves. Any
 * claim otherwise is not true, so this tool is honest about that: it
 * prepares and opens the chat, and tells the model/user that a manual tap
 * is required to actually send.
 */

const sendWhatsAppSchema = z.object({
  phoneNumber: z
    .string()
    .min(6, "Phone number looks too short.")
    .describe("Recipient phone number in international format, e.g. +26771234567"),
  message: z.string().min(1, "Message cannot be empty."),
});

type SendWhatsAppArgs = z.infer<typeof sendWhatsAppSchema>;

function sanitizePhoneNumber(raw: string): string {
  // Keep leading + and digits only.
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  return hasPlus ? `+${digits}` : digits;
}

async function openWhatsAppChat(args: SendWhatsAppArgs): Promise<string> {
  const phone = sanitizePhoneNumber(args.phoneNumber);
  const encodedMessage = encodeURIComponent(args.message);
  const url = `whatsapp://send?phone=${phone}&text=${encodedMessage}`;

  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) {
    // Fallback to the universal wa.me link, which works even if the
    // whatsapp:// scheme isn't registered as openable (some Android
    // configs under-report canOpenURL for custom schemes).
    const fallbackUrl = `https://wa.me/${phone.replace("+", "")}?text=${encodedMessage}`;
    await Linking.openURL(fallbackUrl);
    return `Opened WhatsApp web/app fallback for ${phone} with your message pre-filled. You still need to tap Send in WhatsApp — I cannot send messages automatically.`;
  }

  await Linking.openURL(url);
  return `Opened WhatsApp chat with ${phone} and pre-filled your message. You need to tap Send in WhatsApp yourself — no app is permitted to send WhatsApp messages on your behalf without that manual confirmation.`;
}

const sendWhatsAppTool: Tool<SendWhatsAppArgs> = {
  name: "send_whatsapp_message",
  description:
    "Opens WhatsApp with a chat to the given phone number and pre-fills a message. " +
    "Does NOT send automatically — the user must tap send in WhatsApp themselves. " +
    "Use this when the user asks to message, text, or WhatsApp someone.",
  schema: sendWhatsAppSchema,
  jsonSchemaProperties: {
    phoneNumber: {
      type: "string",
      description: "Recipient phone number in international format, e.g. +26771234567",
    },
    message: {
      type: "string",
      description: "The message text to pre-fill",
    },
  },
  requiredFields: ["phoneNumber", "message"],
  execute: openWhatsAppChat,
};

const openPhoneDialerSchema = z.object({
  phoneNumber: z.string().min(3, "Phone number looks too short."),
});
type OpenPhoneDialerArgs = z.infer<typeof openPhoneDialerSchema>;

const openPhoneDialerTool: Tool<OpenPhoneDialerArgs> = {
  name: "open_phone_dialer",
  description: "Opens the native phone dialer pre-filled with a number. Does not place the call automatically.",
  schema: openPhoneDialerSchema,
  jsonSchemaProperties: {
    phoneNumber: { type: "string", description: "Phone number to dial" },
  },
  requiredFields: ["phoneNumber"],
  execute: async (args) => {
    const phone = sanitizePhoneNumber(args.phoneNumber);
    const url = `tel:${phone}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      throw new Error("This device cannot open the phone dialer.");
    }
    await Linking.openURL(url);
    return `Opened the dialer with ${phone}. Tap the call button to actually place the call.`;
  },
};

export function registerCommunicationTools(): void {
  ToolRegistry.register(sendWhatsAppTool);
  ToolRegistry.register(openPhoneDialerTool);
}
