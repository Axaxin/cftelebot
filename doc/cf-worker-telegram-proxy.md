# CF Worker Telegram API Proxy — Implementation Spec

## Goal

Add outbound Telegram API proxy endpoints to the CF Worker, so the local backend
can call CF Worker instead of calling `api.telegram.org` directly. CF Worker has
stable global network access to Telegram, avoiding local proxy jitter.

## Architecture After Change

```
Backend → CF Worker /api/<method> → Telegram API
```

Authentication: Backend sends `Authorization: Bearer <API_TOKEN>` header.
CF Worker adds the bot token and forwards to Telegram.

---

## CF Worker Changes (`cftelebot`)

### 1. New Route

In `src/index.ts`, add a route for `POST /api/:method`:

```
POST /api/sendMessage
POST /api/editMessageText
POST /api/deleteMessage
POST /api/answerCallbackQuery
POST /api/sendInlineKeyboard  (optional, same as sendMessage with reply_markup)
```

All routes share the same handler logic.

### 2. New Handler: `src/handlers/telegram_proxy.ts`

```typescript
import { Env } from '../types';

export async function handleTelegramProxy(
  request: Request,
  env: Env,
  method: string,
): Promise<Response> {
  // Auth check
  const auth = request.headers.get('Authorization');
  if (!env.API_TOKEN || auth !== `Bearer ${env.API_TOKEN}`) {
    return new Response(JSON.stringify({ ok: false, description: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, description: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Forward to Telegram API
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
  const tgResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await tgResponse.json();
  return new Response(JSON.stringify(result), {
    status: tgResponse.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 3. Wire up route in `src/index.ts`

```typescript
import { handleTelegramProxy } from './handlers/telegram_proxy';

// In the fetch handler, add before the final 404:
const apiMatch = url.pathname.match(/^\/api\/(\w+)$/);
if (apiMatch && request.method === 'POST') {
  return handleTelegramProxy(request, env, apiMatch[1]);
}
```

### 4. No new environment variables needed

`API_TOKEN` and `TELEGRAM_BOT_TOKEN` already exist in Cloudflare Dashboard.

---

## totoro-gateway Backend Changes

### 1. `src/totoro_gateway/config.py` — add CF Worker config

```python
# CF Worker (for Telegram API proxy)
cf_worker_url: str | None = Field(default=None, description="CF Worker base URL, e.g. https://xxx.workers.dev")
cf_api_token: str | None = Field(default=None, description="CF Worker API token")
```

### 2. `src/totoro_gateway/telegram.py` — use CF Worker URL when configured

Change `_get_url()` and `__init__()`:

```python
def __init__(self) -> None:
    self._semaphore = asyncio.Semaphore(1)
    self._use_cf_proxy = bool(settings.cf_worker_url and settings.cf_api_token)
    timeout = httpx.Timeout(total=30.0, connect=5.0)
    # No proxy needed if using CF Worker
    if self._use_cf_proxy:
        self._client = httpx.AsyncClient(timeout=timeout)
        log.info("Telegram", proxy="using CF Worker proxy")
    elif settings.http_proxy:
        self._client = httpx.AsyncClient(timeout=timeout, proxy=settings.http_proxy)
        log.info("Telegram", proxy=f"using HTTP proxy: {settings.http_proxy}")
    else:
        self._client = httpx.AsyncClient(timeout=timeout)

def _get_url(self, method: str) -> str:
    if self._use_cf_proxy:
        return f"{settings.cf_worker_url.rstrip('/')}/api/{method}"
    return self.BASE_URL.format(token=settings.bot_token, method=method)
```

Change `_call()` to add auth header when using CF Worker:

```python
async def _call(self, method: str, **params: Any) -> dict[str, Any]:
    url = self._get_url(method)
    headers = {'Content-Type': 'application/json'}
    if self._use_cf_proxy:
        headers['Authorization'] = f'Bearer {settings.cf_api_token}'

    async with self._semaphore:
        try:
            response = await self._client.post(url, json=params, headers=headers)
            ...
```

### 3. `.env` — add new variables

```env
CF_WORKER_URL=https://your-worker.workers.dev
CF_API_TOKEN=your_api_token_here
```

When `CF_WORKER_URL` and `CF_API_TOKEN` are set, the backend routes all Telegram
API calls through CF Worker. The local `HTTP_PROXY` / `SOCKS5_PROXY` is only used
for Redis if needed (Redis uses a separate client in `redis_client.py`).

---

## Summary of Files to Change

| Project | File | Change |
|---------|------|--------|
| cftelebot | `src/handlers/telegram_proxy.ts` | New file |
| cftelebot | `src/index.ts` | Add `/api/:method` route |
| totoro-gateway | `src/totoro_gateway/config.py` | Add `cf_worker_url`, `cf_api_token` |
| totoro-gateway | `src/totoro_gateway/telegram.py` | Use CF Worker URL + auth header |
| totoro-gateway | `.env` | Add `CF_WORKER_URL`, `CF_API_TOKEN` |
