import { handleTelegramWebhook } from "./handlers/telegram";
import { handleWakeup } from "./handlers/wakeup";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Telegram webhook - 使用简单路径
    if (url.pathname === "/webhook/telegram" && request.method === "POST") {
      return handleTelegramWebhook(request, env);
    }

    // Backend 唤醒端点（需要鉴权）
    if (url.pathname === "/wakeup" && request.method === "POST") {
      // 验证 Authorization header
      const auth = request.headers.get("Authorization");
      const token = auth?.replace("Bearer ", "");

      if (!token || token !== env.API_TOKEN) {
        return new Response(
          JSON.stringify({ ok: false, error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }

      return handleWakeup(env);
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
