import type { Env } from "../types";

async function redisCommand(
  env: Env,
  command: string,
  args: string[]
): Promise<{ result?: unknown; error?: string }> {
  const path = args.map(encodeURIComponent).join("/");
  const url = `${env.REDIS_ENDPOINT}/${command}/${path}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.REDIS_TOKEN}`,
    },
  });

  return response.json();
}

export async function redisLPush(
  env: Env,
  key: string,
  value: object
): Promise<void> {
  const result = await redisCommand(env, "lpush", [key, JSON.stringify(value)]);
  if (result.error) {
    throw new Error(result.error);
  }
}

export async function redisRPop<T = unknown>(
  env: Env,
  key: string
): Promise<T | null> {
  const result = await redisCommand(env, "rpop", [key]);
  if (result.result) {
    return JSON.parse(result.result as string);
  }
  return null;
}
