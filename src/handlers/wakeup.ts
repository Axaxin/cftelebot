import { redisRPop } from "../redis/client";
import { executeTelegramAction } from "../telegram/api";
import type { Env, WorkerTask } from "../types";

export async function handleWakeup(env: Env): Promise<Response> {
  let processed = 0;
  let failed = 0;

  // 循环处理所有待执行的任务
  while (true) {
    const task = await redisRPop<WorkerTask>(env, "worker_queue");
    if (!task) break;

    try {
      const result = await executeTelegramAction(env.TELEGRAM_BOT_TOKEN, task);
      if (result.ok) {
        processed++;
      } else {
        failed++;
        console.error("Telegram API 错误:", result.description);
      }
    } catch (e) {
      failed++;
      console.error("执行失败:", e);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed, failed }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
