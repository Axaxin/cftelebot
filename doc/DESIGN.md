# CF Worker Telegram Bot 设计文档

## 项目范围

**本项目只开发 CF Worker**，与后端解耦。Backend 是独立项目。

Worker 提供给 Backend 的接口：
- 消息队列协议（Redis）
- 唤醒端点 (`POST /wakeup`)

---

## 概述

轻量级 Telegram Bot 网关，部署在 Cloudflare Workers，作为 Bot 和后端 Backend 之间的消息桥接层。

**架构简图：**
```
┌─────────────┐
│   Telegram  │
│   Server    │
└──────┬──────┘
       │ webhook (用户消息)
       ▼
┌─────────────────────────────────────┐
│          CF Worker (网关)            │
│                                     │
│  /webhook/telegram/{token}  ──────► │ LPUSH → backend_queue
│                                     │
│  /wakeup  ◄───────────────────────  │ RPOP ← worker_queue
│       │                             │        ↓
│       └─────────────────────────────┘    sendTelegramMessage
└─────────────────────────────────────┘
       ▲
       │ POST /wakeup (唤醒端点)
       │
┌──────┴──────┐
│   Backend   │
│   (VPS)     │
│             │
│ RPOP ← backend_queue
│ 调用 Claude CLI
│ LPUSH → worker_queue
│ POST /wakeup
└─────────────┘
```

---

## 核心职责

CF Worker 负责：
1. **接收** Telegram webhook（用户消息）→ 写入 `backend_queue`
2. **接收** Backend 唤醒请求 → 从 `worker_queue` 取结果 → 发送 Telegram 消息

Backend 负责：
1. **消费** `backend_queue` 中的消息
2. **调用** Claude CLI 处理
3. **写入** 结果到 `worker_queue`
4. **调用** `/wakeup` 端点唤醒 Worker

---

## Redis 配置

使用 Upstash Redis（REST API）：

```
REDIS_ENDPOINT = https://robust-mule-36901.upstash.io
REDIS_TOKEN = upstash-token-xxx
```

请求格式：
```
POST {REDIS_ENDPOINT}/{command}/{token}?args={args}
Authorization: Bearer {REDIS_TOKEN}
```

---

## 通信协议

### 1. Backend 任务队列 (`backend_queue`)

Worker 收到 Telegram 消息后 LPUSH，供 Backend 消费：

```json
{
  "msg_id": "msg_abc123",
  "chat_id": 123456789,
  "user_id": 987654321,
  "username": "john_doe",
  "message_type": "text",
  "content": "用户的输入文本",
  "reply_to_msg_id": null,
  "ack_message_id": 456,
  "timestamp": 1710000000
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `msg_id` | string | ✓ | 消息唯一标识，格式 `msg_{timestamp}_{random}` |
| `chat_id` | number | ✓ | Telegram chat ID |
| `user_id` | number | ✓ | Telegram user ID |
| `username` | string | | 用户名，可能为空 |
| `message_type` | string | ✓ | 消息类型：`text` / `photo` / `document` / `command` |
| `content` | string | ✓ | 消息内容（文本/命令/command 参数） |
| `reply_to_msg_id` | number | | 回复的消息 ID（如果是回复消息） |
| `ack_message_id` | number | | Bot 发送的 ack 消息 ID，Backend 可编辑/删除 |
| `timestamp` | number | ✓ | Unix 时间戳（秒） |

> 注：Bot 收到用户消息后会立即发送 ack 消息（`⏳ 收到，正在处理...`），Backend 可选择编辑或删除该消息。

### 2. Worker 任务队列 (`worker_queue`)

Backend 处理完成后 LPUSH，Worker 被唤醒后执行 Telegram API 调用：

```json
{
  "action": "send_message",
  "chat_id": 123456789,
  "data": {
    // 根据 action 不同而变化
  }
}
```

#### 支持的 Action

**① `send_message` - 发送消息**

```json
{
  "action": "send_message",
  "chat_id": 123456789,
  "data": {
    "text": "要发送的消息内容",
    "parse_mode": "Markdown",
    "reply_to_msg_id": null,
    "disable_notification": false
  }
}
```

| data 字段 | 类型 | 必填 | 说明 |
|-----------|------|------|------|
| `text` | string | ✓ | 消息文本 |
| `parse_mode` | string | | 解析模式：`Markdown` / `HTML`，默认 `Markdown` |
| `reply_to_msg_id` | number | | 回复指定消息 |
| `disable_notification` | boolean | | 静默发送 |

**② `edit_message` - 编辑消息**

```json
{
  "action": "edit_message",
  "chat_id": 123456789,
  "data": {
    "message_id": 98765,
    "text": "编辑后的消息内容",
    "parse_mode": "Markdown"
  }
}
```

| data 字段 | 类型 | 必填 | 说明 |
|-----------|------|------|------|
| `message_id` | number | ✓ | 要编辑的消息 ID |
| `text` | string | ✓ | 新的消息文本 |
| `parse_mode` | string | | 解析模式 |

**③ `delete_message` - 删除消息**

```json
{
  "action": "delete_message",
  "chat_id": 123456789,
  "data": {
    "message_id": 98765
  }
}
```

| data 字段 | 类型 | 必填 | 说明 |
|-----------|------|------|------|
| `message_id` | number | ✓ | 要删除的消息 ID |

#### 典型使用场景

**场景 1：直接回复**
```json
{
  "action": "send_message",
  "chat_id": 123456789,
  "data": {
    "text": "处理完成！结果如下...",
    "parse_mode": "Markdown"
  }
}
```

**场景 2：先发送"处理中"，再编辑为结果**
```json
// 第一次推送（发送处理中提示）
{
  "action": "send_message",
  "chat_id": 123456789,
  "data": {
    "text": "⏳ 正在处理..."
  }
}

// 第二次推送（编辑为实际结果，Backend 需记录 message_id）
{
  "action": "edit_message",
  "chat_id": 123456789,
  "data": {
    "message_id": 98765,
    "text": "✅ 处理完成！\n\n结果：..."
  }
}
```

**场景 3：错误处理**
```json
{
  "action": "send_message",
  "chat_id": 123456789,
  "data": {
    "text": "❌ 处理失败：超时",
    "parse_mode": "HTML"
  }
}
```

### 3. 唤醒端点

**Endpoint:** `GET/POST /wakeup`

Backend 写入任务队列后调用此端点唤醒 Worker。

**Response:**
```json
{
  "ok": true,
  "processed": 3,
  "failed": 0
}
```

---

## CF Worker 实现

### 项目结构

```
cf-worker-telegram-bot/
├── src/
│   ├── index.ts           # 主入口
│   ├── handlers/
│   │   ├── telegram.ts    # Telegram webhook 处理
│   │   ├── wakeup.ts      # 唤醒处理（消费 worker_queue）
│   │   └── health.ts      # 健康检查
│   ├── redis/
│   │   └── client.ts      # Upstash Redis REST API
│   ├── telegram/
│   │   └── api.ts         # Telegram API 调用
│   └── types.ts           # TypeScript 类型定义
├── wrangler.toml          # Cloudflare 配置
├── package.json
└── tsconfig.json
```

### 环境变量（wrangler.toml）

```toml
[vars]
TELEGRAM_BOT_TOKEN = "your-bot-token"

# 在 Cloudflare Dashboard 中配置，不建议写在代码中：
# REDIS_ENDPOINT = "https://xxx.upstash.io"
# REDIS_TOKEN = "your-upstash-token"
# ALLOW_USERIDS = "123456,789012"
# API_TOKEN = "your-api-token"
```

### 核心代码框架

> 注：以下为简化示例，实际代码见 `src/` 目录

#### 1. 主入口（index.ts）

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Telegram webhook
    if (url.pathname === `/webhook/telegram/${env.TELEGRAM_BOT_TOKEN}` && request.method === "POST") {
      return handleTelegramWebhook(request, env);
    }

    // Backend 唤醒端点（需鉴权）
    if (url.pathname === "/wakeup" && request.method === "POST") {
      const auth = request.headers.get("Authorization");
      const token = auth?.replace("Bearer ", "");
      if (!token || token !== env.API_TOKEN) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
      }
      return handleWakeup(env);
    }

    // 健康检查
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
};
```

#### 2. Telegram Webhook 处理（handlers/telegram.ts）

```typescript
const ACK_MESSAGE = "⏳ 收到，正在处理...";

async function handleTelegramWebhook(request: Request, env: Env) {
  const update = await request.json();

  if (!update.message) {
    return new Response("OK", { status: 200 });
  }

  const message = update.message;

  // 检查用户白名单
  if (!isUserAllowed(message.from.id, env.ALLOW_USERIDS)) {
    return new Response("OK", { status: 200 }); // 静默忽略
  }

  // 判断消息类型...

  // 发送 ack 消息
  let ackMessageId: number | null = null;
  const ackResult = await telegramSendMessage(env.TELEGRAM_BOT_TOKEN, message.chat.id, {
    text: ACK_MESSAGE,
  });
  if (ackResult.ok && ackResult.result?.message_id) {
    ackMessageId = ackResult.result.message_id;
  }

  const queueMessage: BackendMessage = {
    msg_id: `msg_${Date.now()}_${random}`,
    chat_id: message.chat.id,
    user_id: message.from.id,
    username: message.from.username || "",
    message_type: messageType,
    content: content,
    reply_to_msg_id: message.reply_to_message?.message_id || null,
    ack_message_id: ackMessageId, // 传递给 Backend
    timestamp: Math.floor(Date.now() / 1000),
  };

  await redisLPush(env, "backend_queue", queueMessage);
  return new Response("OK", { status: 200 });
}
```

#### 3. 唤醒处理（handlers/wakeup.ts）

```typescript
async function handleWakeup(request: Request, env: Env) {
  let processed = 0;
  let failed = 0;

  // 循环处理所有待执行的任务
  while (true) {
    const task = await redisRPop(env, "worker_queue");
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

  return new Response(JSON.stringify({ ok: true, processed, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function executeTelegramAction(token: string, task: WorkerTask) {
  const { action, chat_id, data } = task;

  switch (action) {
    case "send_message":
      return await telegramSendMessage(token, chat_id, data);

    case "edit_message":
      return await telegramEditMessage(token, chat_id, data);

    case "delete_message":
      return await telegramDeleteMessage(token, chat_id, data);

    default:
      return { ok: false, description: `Unknown action: ${action}` };
  }
}
```

#### 4. Redis REST API（redis/client.ts）

```typescript
async function redisCommand(env: Env, command: string, args: string[]) {
  const url = `${env.REDIS_ENDPOINT}/${command}/${env.REDIS_TOKEN}?${args.map(a => `args=${encodeURIComponent(a)}`).join("&")}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.REDIS_TOKEN}` },
  });
  return response.json();
}

export async function redisLPush(env: Env, key: string, value: object) {
  return redisCommand(env, "lpush", [key, JSON.stringify(value)]);
}

export async function redisRPop(env: Env, key: string): Promise<object | null> {
  const result = await redisCommand(env, "rpop", [key]);
  if (result.result) {
    return JSON.parse(result.result);
  }
  return null;
}
```

#### 5. Telegram API（telegram/api.ts）

```typescript
const TELEGRAM_API = "https://api.telegram.org/bot";

export async function telegramSendMessage(
  token: string,
  chatId: number,
  data: SendMessageData
) {
  const url = `${TELEGRAM_API}${token}/sendMessage`;

  const body = {
    chat_id: chatId,
    text: data.text,
    parse_mode: data.parse_mode || "Markdown",
    reply_to_message_id: data.reply_to_msg_id,
    disable_notification: data.disable_notification,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json();
}

export async function telegramEditMessage(
  token: string,
  chatId: number,
  data: EditMessageData
) {
  const url = `${TELEGRAM_API}${token}/editMessageText`;

  const body = {
    chat_id: chatId,
    message_id: data.message_id,
    text: data.text,
    parse_mode: data.parse_mode || "Markdown",
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json();
}

export async function telegramDeleteMessage(
  token: string,
  chatId: number,
  data: DeleteMessageData
) {
  const url = `${TELEGRAM_API}${token}/deleteMessage`;

  const body = {
    chat_id: chatId,
    message_id: data.message_id,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json();
}
```

### 类型定义（types.ts）

```typescript
export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  REDIS_ENDPOINT: string;
  REDIS_TOKEN: string;
  ALLOW_USERIDS: string;  // 逗号分隔的用户 ID
  API_TOKEN: string;      // 唤醒端点鉴权
}

// ============ Backend 队列消息 ============
export interface BackendMessage {
  msg_id: string;
  chat_id: number;
  user_id: number;
  username: string;
  message_type: "text" | "photo" | "document" | "command";
  content: string;
  reply_to_msg_id: number | null;
  ack_message_id: number | null;  // ack 消息的 message_id
  timestamp: number;
}

// ============ Worker 队列任务 ============
export type TelegramAction = "send_message" | "edit_message" | "delete_message";

export interface WorkerTask {
  action: TelegramAction;
  chat_id: number;
  data: SendMessageData | EditMessageData | DeleteMessageData;
}

export interface SendMessageData {
  text: string;
  parse_mode?: "Markdown" | "HTML";
  reply_to_msg_id?: number;
  disable_notification?: boolean;
}

export interface EditMessageData {
  message_id: number;
  text: string;
  parse_mode?: "Markdown" | "HTML";
}

export interface DeleteMessageData {
  message_id: number;
}
```

---

## Telegram 配置

### 1. 设置 Webhook

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<worker-domain>/webhook/telegram/<BOT_TOKEN>" \
  -d "allowed_updates=[\"message\"]"
```

### 2. 验证 Webhook

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

---

## 部署步骤

### 1. 创建项目

```bash
npm create cloudflare@latest cf-worker-telegram-bot -- --type typescript
cd cf-worker-telegram-bot
```

### 2. 配置 wrangler.toml

```toml
name = "cf-worker-telegram-bot"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
TELEGRAM_BOT_TOKEN = "your-bot-token"

[[env.production.vars]]
REDIS_ENDPOINT = "https://robust-mule-36901.upstash.io"
REDIS_TOKEN = "your-upstash-token"
```

### 3. 部署

```bash
npx wrangler deploy
```

---

## Backend 集成指南

### 1. 消费消息并推送任务

```python
import requests
import json
import time
import random

REDIS_ENDPOINT = "https://robust-mule-36901.upstash.io"
REDIS_TOKEN = "your-token"
WORKER_URL = "https://your-worker.workers.dev"

def redis_command(command: str, args: list):
    url = f"{REDIS_ENDPOINT}/{command}/{REDIS_TOKEN}"
    params = [("args", a) for a in args]
    resp = requests.post(url, params=params)
    return resp.json()

def push_worker_task(action: str, chat_id: int, data: dict):
    """推送任务到 worker_queue"""
    task = {
        "action": action,
        "chat_id": chat_id,
        "data": data,
    }
    redis_command("lpush", ["worker_queue", json.dumps(task)])

def wakeup_worker():
    """唤醒 Worker 处理任务"""
    try:
        requests.post(f"{WORKER_URL}/wakeup", timeout=10)
    except Exception as e:
        print(f"唤醒失败: {e}")

def process_messages():
    while True:
        # RPOP 从 backend_queue 取消息
        result = redis_command("rpop", ["backend_queue"])
        if not result.get("result"):
            break

        message = json.loads(result["result"])
        msg_id = message["msg_id"]
        chat_id = message["chat_id"]
        content = message["content"]

        print(f"处理消息 [{msg_id}]: {content[:50]}...")

        # 发送"处理中"提示
        push_worker_task("send_message", chat_id, {
            "text": "⏳ 正在处理..."
        })
        wakeup_worker()

        # 调用 Claude CLI 处理
        output = run_claude_cli(content)

        # 编辑为最终结果
        push_worker_task("send_message", chat_id, {
            "text": f"✅ 处理完成:\n\n{output}",
            "parse_mode": "Markdown"
        })
        wakeup_worker()

def run_claude_cli(prompt: str) -> str:
    """调用 Claude CLI"""
    # 实际实现...
    return "处理结果..."
```

### 2. 错误处理

```python
def send_error(chat_id: int, error_msg: str):
    """发送错误消息"""
    push_worker_task("send_message", chat_id, {
        "text": f"❌ 错误: {error_msg}",
        "parse_mode": "HTML"
    })
    wakeup_worker()
```

---

## 监控和调试

### 1. CF Worker 日志

```bash
npx wrangler tail
```

### 2. Redis 监控

```bash
# 查看队列长度
curl "{REDIS_ENDPOINT}/llen/{REDIS_TOKEN}?args=backend_queue"
curl "{REDIS_ENDPOINT}/llen/{REDIS_TOKEN}?args=worker_queue"

# 查看队列内容（不弹出）
curl "{REDIS_ENDPOINT}/lrange/{REDIS_TOKEN}?args=worker_queue&args=0&args=-1"
```

---

## 扩展建议

1. **批量唤醒**：支持一次处理多条结果
2. **速率限制**：加入用户级别的请求限制
3. **结果缓存**：对相同输入缓存 Claude 结果
4. **会话管理**：维护用户对话上下文

---

## 问题排查

| 问题 | 原因 | 解决方案 |
|------|------|--------|
| Webhook 收不到消息 | Token 错误或 URL 不对 | 检查 setWebhook 命令和日志 |
| Redis 连接失败 | Endpoint 或 Token 错误 | 验证 Upstash 配置 |
| 唤醒后无消息 | 队列为空 | 检查 Backend 是否正确 LPUSH |
| 消息发送失败 | Telegram API 限流 | 检查 parse_mode 格式 |

---

## 成本估算

- **CF Worker**：免费层（100 万请求/天）
- **Upstash Redis**：免费层（10,000 命令/天）
- **总成本**：基本零成本（流量小）

