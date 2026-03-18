import { saveMessage } from "../redis/client";
import type { Env, Message, TelegramUpdate } from "../types";

function isUserAllowed(userId: number, allowUserIds: string): boolean {
  if (!allowUserIds) return false;
  const allowed = allowUserIds.split(",").map((id) => parseInt(id.trim(), 10));
  return allowed.includes(userId);
}

const ACK_MESSAGE = "⏳ 收到，正在处理...";

async function sendAckMessage(
  botToken: string,
  chatId: number,
  text: string
): Promise<{ ok: boolean; result?: { message_id?: number } }> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );
  return response.json();
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const update: TelegramUpdate = await request.json();

  if (!update.message) {
    return new Response("OK", { status: 200 });
  }

  const message = update.message;
  const userId = message.from.id;

  // 检查用户白名单
  if (!isUserAllowed(userId, env.ALLOW_USERIDS)) {
    return new Response("OK", { status: 200 });
  }

  // 判断消息类型
  let messageType: Message["message_type"] = "text";
  let content = "";

  if (message.text?.startsWith("/")) {
    messageType = "command";
    content = message.text;
  } else if (message.text) {
    messageType = "text";
    content = message.text;
  } else if (message.photo) {
    messageType = "photo";
    content = message.caption || "";
  } else if (message.document) {
    messageType = "document";
    content = message.caption || "";
  } else {
    return new Response("OK", { status: 200 });
  }

  // 发送 ack 消息
  let ackMessageId: number | null = null;
  try {
    const ackResult = await sendAckMessage(
      env.TELEGRAM_BOT_TOKEN,
      message.chat.id,
      ACK_MESSAGE
    );
    if (ackResult.ok && ackResult.result?.message_id) {
      ackMessageId = ackResult.result.message_id;
    }
  } catch (e) {
    console.error("发送 ack 失败:", e);
  }

  const now = Math.floor(Date.now() / 1000);
  const msgId = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;

  const messageRecord: Message = {
    msg_id: msgId,
    chat_id: message.chat.id,
    user_id: message.from.id,
    username: message.from.username || "",
    message_type: messageType,
    content: content,
    reply_to_msg_id: message.reply_to_message?.message_id || null,
    ack_message_id: ackMessageId,
    ack_status: "pending",
    message_status: "fresh",
    created_at: now,
    processed_at: null,
  };

  await saveMessage(env, messageRecord);

  return new Response("OK", { status: 200 });
}
