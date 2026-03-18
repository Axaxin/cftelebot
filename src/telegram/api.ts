import type { WorkerTask, TelegramApiResponse } from "../types";

const TELEGRAM_API = "https://api.telegram.org/bot";

export async function executeTelegramAction(
  token: string,
  task: WorkerTask
): Promise<TelegramApiResponse> {
  const { action, chat_id, data } = task;

  switch (action) {
    case "send_message":
      return telegramSendMessage(token, chat_id, data);

    case "edit_message":
      return telegramEditMessage(token, chat_id, data);

    case "delete_message":
      return telegramDeleteMessage(token, chat_id, data);

    default:
      return { ok: false, description: `Unknown action: ${action}` };
  }
}

async function telegramApiCall(
  token: string,
  method: string,
  body: object
): Promise<TelegramApiResponse> {
  const url = `${TELEGRAM_API}${token}/${method}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json();
}

export async function telegramSendMessage(
  token: string,
  chatId: number,
  data: { text: string; parse_mode?: string; reply_to_msg_id?: number; disable_notification?: boolean }
): Promise<TelegramApiResponse> {
  return telegramApiCall(token, "sendMessage", {
    chat_id: chatId,
    text: data.text,
    parse_mode: data.parse_mode || "Markdown",
    reply_to_message_id: data.reply_to_msg_id,
    disable_notification: data.disable_notification,
  });
}

export async function telegramEditMessage(
  token: string,
  chatId: number,
  data: { message_id: number; text: string; parse_mode?: string }
): Promise<TelegramApiResponse> {
  return telegramApiCall(token, "editMessageText", {
    chat_id: chatId,
    message_id: data.message_id,
    text: data.text,
    parse_mode: data.parse_mode || "Markdown",
  });
}

export async function telegramDeleteMessage(
  token: string,
  chatId: number,
  data: { message_id: number }
): Promise<TelegramApiResponse> {
  return telegramApiCall(token, "deleteMessage", {
    chat_id: chatId,
    message_id: data.message_id,
  });
}
