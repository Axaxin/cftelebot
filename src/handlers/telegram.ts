import { saveMessage } from "../redis/client";
import type { Env, Message, MessageType, TelegramUpdate } from "../types";

function isUserAllowed(userId: number, allowUserIds: string): boolean {
  if (!allowUserIds) return false;
  const allowed = allowUserIds.split(",").map((id) => parseInt(id.trim(), 10));
  return allowed.includes(userId);
}

// 根据消息内容判断类型
function getMessageType(message: TelegramUpdate["message"]): MessageType {
  if (!message) return "other";
  if (message.text?.startsWith("/")) return "command";
  if (message.text) return "text";
  if (message.photo) return "photo";
  if (message.video) return "video";
  if (message.audio) return "audio";
  if (message.document) return "document";
  if (message.animation) return "animation";
  if (message.voice) return "voice";
  if (message.video_note) return "video_note";
  if (message.sticker) return "sticker";
  if (message.contact) return "contact";
  if (message.location) return "location";
  if (message.venue) return "venue";
  if (message.poll) return "poll";
  if (message.dice) return "dice";
  if (message.game) return "game";
  return "other";
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
  const userId = message.from?.id;

  // 消息必须有发送者
  if (!userId) {
    return new Response("OK", { status: 200 });
  }

  // 检查用户白名单
  if (!isUserAllowed(userId, env.ALLOW_USERIDS)) {
    return new Response("OK", { status: 200 });
  }

  // 判断消息类型
  const messageType = getMessageType(message);

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
    // 核心字段
    msg_id: msgId,
    chat_id: message.chat.id,
    user_id: userId,
    username: message.from?.username || "",
    message_type: messageType,
    created_at: now,
    // 自定义状态字段
    ack_message_id: ackMessageId,
    ack_status: "pending",
    message_status: "fresh",
    processed_at: null,
    // 原始消息
    raw_message: message,
  };

  await saveMessage(env, messageRecord);

  return new Response("OK", { status: 200 });
}
