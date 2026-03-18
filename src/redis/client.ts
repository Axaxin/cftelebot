import type { Env } from "../types";

async function redisCommand(
  env: Env,
  command: string,
  args: (string | number)[]
): Promise<{ result?: unknown }> {
  const url = `${env.REDIS_ENDPOINT}/${command}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  return response.json();
}

export async function redisLPush(
  env: Env,
  key: string,
  value: object
): Promise<void> {
  await redisCommand(env, "lpush", [key, JSON.stringify(value)]);
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
