import { redisLPush } from "../redis/client";
import { telegramSendMessage } from "../telegram/api";
import type { Env, BackendMessage } from "../types";

function isUserAllowed(userId: number, allowUserIds: string): boolean {
  if (!allowUserIds) return false;
  const allowed = allowUserIds.split(",").map((id) => parseInt(id.trim(), 10));
  return allowed.includes(userId);
}

const ACK_MESSAGE = "⏳ 收到，正在处理...";

export async function handleTelegramWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  console.log("收到 webhook 请求");

  const update = await request.json();

  if (!update.message) {
    console.log("无消息内容");
    return new Response("OK", { status: 200 });
  }

  const message = update.message;
  const userId = message.from.id;

  console.log(`用户 ID: ${userId}, ALLOW_USERIDS: ${env.ALLOW_USERIDS}`);

  // 检查用户白名单
  if (!isUserAllowed(userId, env.ALLOW_USERIDS)) {
    console.log(`Unauthorized user: ${userId}`);
    return new Response("OK", { status: 200 }); // 静默忽略
  }

  console.log("用户验证通过");

  // 判断消息类型
  let messageType: BackendMessage["message_type"] = "text";
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
    return new Response("OK", { status: 200 }); // 忽略其他类型
  }

  console.log(`消息类型: ${messageType}, 内容: ${content}`);

  // 发送 ack 消息
  let ackMessageId: number | null = null;
  try {
    console.log("发送 ack 消息...");
    const ackResult = await telegramSendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, {
      text: ACK_MESSAGE,
    });
    console.log(`ack 结果: ${JSON.stringify(ackResult)}`);
    if (ackResult.ok && ackResult.result?.message_id) {
      ackMessageId = ackResult.result.message_id;
    }
  } catch (e) {
    console.error("发送 ack 失败:", e);
    // 继续处理，ack 失败不阻塞
  }

  const queueMessage: BackendMessage = {
    msg_id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    chat_id: message.chat.id,
    user_id: message.from.id,
    username: message.from.username || "",
    message_type: messageType,
    content: content,
    reply_to_msg_id: message.reply_to_message?.message_id || null,
    ack_message_id: ackMessageId,
    timestamp: Math.floor(Date.now() / 1000),
  };

  // LPUSH 到 backend_queue
  console.log(`写入 Redis: ${JSON.stringify(queueMessage)}`);
  try {
    await redisLPush(env, "backend_queue", queueMessage);
    console.log("写入 Redis 成功");
  } catch (e) {
    console.error("写入 Redis 失败:", e);
  }

  return new Response("OK", { status: 200 });
}
