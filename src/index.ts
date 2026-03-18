import { handleTelegramWebhook } from "./handlers/telegram";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Telegram webhook - 使用简单路径
    if (url.pathname === "/webhook/telegram" && request.method === "POST") {
      return handleTelegramWebhook(request, env);
    }

    // 健康检查
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
