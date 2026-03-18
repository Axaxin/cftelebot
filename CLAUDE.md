# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目范围

**本项目只开发 CF Worker**，与后端解耦。Backend 是独立项目。

## 架构

```
用户消息 → Worker 检查白名单 → 发送 ack → 写入 Redis Hash[messages]
                                                      ↓
                                                 Backend 轮询
                                                      ↓
                                              Backend 直接调用 Telegram API
```

Worker 只负责接收 webhook 和写入消息记录，Telegram API 操作由 Backend 直接执行。

## 开发命令

```bash
npm install      # 安装依赖
npm run dev      # 本地开发
npm run deploy   # 部署
npm run tail     # 查看日志
```

## 环境变量

**重要：使用 Secrets 配置，避免部署时被覆盖**

在 Cloudflare Dashboard → Workers → cftelebot → Settings → Variables and Secrets → **Secrets** 标签中配置：

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `TELEGRAM_BOT_TOKEN` | ✓ | Telegram Bot Token |
| `REDIS_ENDPOINT` | ✓ | Upstash Redis endpoint (如 `https://xxx.upstash.io`) |
| `REDIS_TOKEN` | ✓ | Upstash Redis token |
| `ALLOW_USERIDS` | ✓ | 白名单用户 ID，逗号分隔 (如 `123456,789012`) |

**注意：** `ALLOW_USERIDS` 未设置时，Bot 不回复任何消息。

## 端点

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/webhook/telegram` | POST | - | Telegram webhook |
| `/health` | GET | - | 健康检查 |

## Upstash Redis

使用 `@upstash/redis` SDK，专为 Cloudflare Workers 优化：

```typescript
import { Redis } from "@upstash/redis/cloudflare";

const redis = new Redis({
  url: env.REDIS_ENDPOINT,
  token: env.REDIS_TOKEN,
});

// 使用 Hash 存储消息，key 为 msg_id
await redis.hset("messages", { [msgId]: messageRecord });
```

SDK 底层使用 HTTP REST API，无需 TCP 连接。

## 核心流程

1. **收到用户消息** → 检查白名单 → 发送 ack → 写入 `messages` Hash

## 消息记录格式

```typescript
interface Message {
  msg_id: string;           // 消息唯一标识
  chat_id: number;          // Telegram chat ID
  user_id: number;          // Telegram user ID
  username: string;         // 用户名
  message_type: string;     // text / photo / document / command
  content: string;          // 消息内容
  reply_to_msg_id: number | null;
  ack_message_id: number | null;  // ack 消息 ID
  ack_status: "pending" | "edited" | "deleted";
  message_status: "fresh" | "processing" | "processed";
  created_at: number;       // 创建时间戳
  processed_at: number | null;  // 处理时间戳
}
```

## Telegram Webhook 设置

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<worker-domain>/webhook/telegram" \
  -d "allowed_updates=[\"message\"]"
```

## 文档

- `doc/DESIGN.md` - 设计文档
- `doc/PROTOCOL.md` - 通信协议（供 Backend 参考）
