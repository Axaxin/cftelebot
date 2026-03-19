import type { Env } from "../types";

export async function handleTelegramProxy(
  request: Request,
  env: Env,
  method: string,
): Promise<Response> {
  // Auth check
  const auth = request.headers.get("Authorization");
  if (!env.API_TOKEN || auth !== `Bearer ${env.API_TOKEN}`) {
    return new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, description: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Forward to Telegram API
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const tgResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const result = await tgResponse.json();
  return new Response(JSON.stringify(result), {
    status: tgResponse.status,
    headers: { "Content-Type": "application/json" },
  });
}
