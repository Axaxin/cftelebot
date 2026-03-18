import { Redis } from "@upstash/redis/cloudflare";
import type { Env, Message } from "../types";

function getRedis(env: Env): Redis {
  return new Redis({
    url: env.REDIS_ENDPOINT,
    token: env.REDIS_TOKEN,
  });
}

const MESSAGE_HASH_KEY = "messages";

export async function saveMessage(env: Env, message: Message): Promise<void> {
  const redis = getRedis(env);
  await redis.hset(MESSAGE_HASH_KEY, { [message.msg_id]: message });
}
