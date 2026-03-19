import { Redis } from "@upstash/redis/cloudflare";
import type { Env, Message } from "../types";

function getRedis(env: Env): Redis {
  return new Redis({
    url: env.REDIS_ENDPOINT,
    token: env.REDIS_TOKEN,
  });
}

const STREAM_KEY = "tg_messages";

export async function saveMessage(env: Env, message: Message): Promise<void> {
  const redis = getRedis(env);
  // XADD: * 表示自动生成 ID，对象会被展开为 field value 对
  await redis.xadd(STREAM_KEY, "*", {
    msg_id: message.msg_id,
    chat_id: message.chat_id,
    user_id: message.user_id,
    username: message.username,
    message_type: message.message_type,
    created_at: message.created_at,
    ack_message_id: message.ack_message_id ?? "",
    ack_status: message.ack_status,
    message_status: message.message_status,
    processed_at: message.processed_at ?? "",
    callback_id: message.callback_id,
    callback_data: message.callback_data,
    message_id: message.message_id,
    raw_message: JSON.stringify(message.raw_message),
  });
}
