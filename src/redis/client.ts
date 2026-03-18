import type { Env } from "../types";

async function redisCommand(
  env: Env,
  command: string,
  args: (string | number)[]
): Promise<{ result?: unknown; error?: string }> {
  const url = `${env.REDIS_ENDPOINT}/${command}`;

  console.log(`Redis command: ${command}, args: ${JSON.stringify(args)}`);
  console.log(`Redis endpoint: ${env.REDIS_ENDPOINT}`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  const result = await response.json();
  console.log(`Redis response: ${JSON.stringify(result)}`);
  return result;
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
