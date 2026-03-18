import { Redis } from "@upstash/redis/cloudflare";
import type { Env } from "../types";

function getRedis(env: Env): Redis {
  return new Redis({
    url: env.REDIS_ENDPOINT,
    token: env.REDIS_TOKEN,
  });
}

export async function redisLPush(
  env: Env,
  key: string,
  value: object
): Promise<void> {
  const redis = getRedis(env);
  await redis.lpush(key, value);
}

export async function redisRPop<T = unknown>(
  env: Env,
  key: string
): Promise<T | null> {
  const redis = getRedis(env);
  return redis.rpop<T>(key);
}
