# CF Telebot

Cloudflare Worker Telegram Bot 网关。

## 功能

- 接收 Telegram webhook，写入消息到 Redis Hash
- 用户白名单控制
- 自动发送 ack 消息
- 消息状态追踪（fresh/processing/processed）

## 架构

```
用户消息 → Worker 检查白名单 → 发送 ack → 写入 Redis Hash[messages]
                                                      ↓
                                                 Backend 轮询
                                                      ↓
                                              Backend 直接调用 Telegram API
```

Worker 只负责接收 webhook 和写入消息记录，Telegram API 操作由 Backend 直接执行。

## 部署

1. Fork 本仓库
2. Cloudflare Dashboard → Workers → Create → Connect to Git
3. 选择仓库，自动部署
4. 在 Settings → Variables and Secrets → **Secrets** 中配置环境变量

## 环境变量

| 变量 | 说明 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `REDIS_ENDPOINT` | Upstash Redis endpoint |
| `REDIS_TOKEN` | Upstash Redis token |
| `ALLOW_USERIDS` | 白名单用户 ID，逗号分隔 |

## 消息格式

```json
{
  "msg_id": "msg_1710000000_abc123",
  "chat_id": 123456789,
  "user_id": 987654321,
  "username": "john_doe",
  "message_type": "text",
  "created_at": 1710000000,
  "ack_message_id": 456,
  "ack_status": "pending",
  "message_status": "fresh",
  "processed_at": null,
  "raw_message": { ... }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `msg_id` | string | 消息唯一标识，格式 `msg_{timestamp}_{random}` |
| `chat_id` | number | Telegram chat ID |
| `user_id` | number | Telegram user ID |
| `username` | string | 用户名，可能为空 |
| `message_type` | string | text/command/photo/video/audio/document/animation/voice/video_note/sticker/contact/location/venue/poll/dice/game/other |
| `created_at` | number | 收到消息的时间戳（秒） |
| `ack_message_id` | number \| null | Bot 发送的 ack 消息 ID |
| `ack_status` | string | `pending` / `edited` / `deleted` |
| `message_status` | string | `fresh` / `processing` / `processed` |
| `processed_at` | number \| null | 处理完成时间戳 |
| `raw_message` | object | 完整的 Telegram Message 对象 |

## 文档

- [设计文档](doc/DESIGN.md)

## License

MIT
