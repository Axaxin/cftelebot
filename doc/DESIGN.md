# CF Worker Telegram Bot 设计文档

## 项目范围

**本项目只开发 CF Worker**，与后端解耦。Backend 是独立项目。

Worker 只负责接收 Telegram webhook 并写入 Redis Stream，Telegram API 操作由 Backend 直接执行。

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
│  /webhook/telegram  ──────────────► │ XADD → tg_messages
│                                     │
│  /health                            │
└─────────────────────────────────────┘
       │
       │ Redis Stream: tg_messages
       ▼
┌─────────────────────────────────────┐
│   Backend (VPS)                     │
│                                     │
│   XREADGROUP 消费消息               │
│   调用 Claude CLI                   │
│   直接调用 Telegram API             │
│   XACK 确认消息                     │
└─────────────────────────────────────┘
```

**设计原因：**
- CF Worker 提供 webhook 公网端点是核心价值
- 本地 Backend 长轮询 Telegram 不稳定，但 API 操作稳定
- Backend 直接操作 TG API 更灵活，无需 Worker 中转

---

## 核心职责

CF Worker 负责：
1. **接收** Telegram webhook（用户消息）
2. **校验** 用户白名单
3. **发送** ack 消息
4. **写入** 消息记录到 Redis Stream

Backend 负责：
1. **消费** Redis Stream 获取新消息（XREADGROUP）
2. **调用** Claude CLI 处理
3. **直接调用** Telegram API 发送/编辑/删除消息
4. **确认** 消息处理完成（XACK）

---

## Redis 配置

使用 Upstash Redis（REST API）：

```
REDIS_ENDPOINT = https://robust-mule-36901.upstash.io
REDIS_TOKEN = upstash-token-xxx
```

---

## 通信协议

### 消息记录 (`tg_messages` Stream)

Worker 收到 Telegram 消息后写入 Redis Stream，Backend 通过消费者组读取：

**存储结构：**
```
Key: tg_messages
Type: Stream
```

**消费者组设置（Backend 启动时执行）：**
```bash
XGROUP CREATE tg_messages backend_group $ MKSTREAM
```

**消息格式：**
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

> 注：Bot 收到用户消息后会立即发送 ack 消息（`⏳ 收到，正在处理...`），Backend 可选择编辑或删除该消息。

---

## CF Worker 实现

### 项目结构

```
cftelebot/
├── src/
│   ├── index.ts           # 主入口
│   ├── handlers/
│   │   └── telegram.ts    # Telegram webhook 处理
│   ├── redis/
│   │   └── client.ts      # Upstash Redis SDK
│   └── types.ts           # TypeScript 类型定义
├── wrangler.toml          # Cloudflare 配置
├── package.json
└── tsconfig.json
```

### 环境变量

在 Cloudflare Dashboard → Workers → cftelebot → Settings → Variables and Secrets → **Secrets** 标签中配置：

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `TELEGRAM_BOT_TOKEN` | ✓ | Telegram Bot Token |
| `REDIS_ENDPOINT` | ✓ | Upstash Redis endpoint |
| `REDIS_TOKEN` | ✓ | Upstash Redis token |
| `ALLOW_USERIDS` | ✓ | 白名单用户 ID，逗号分隔 |

### 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/webhook/telegram` | POST | Telegram webhook |
| `/health` | GET | 健康检查 |

---

## Telegram 配置

### 设置 Webhook

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<worker-domain>/webhook/telegram" \
  -d "allowed_updates=[\"message\"]"
```

### 验证 Webhook

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

---

## 部署

```bash
npm install      # 安装依赖
npm run dev      # 本地开发
npm run deploy   # 部署
npm run tail     # 查看日志
```

---

## 监控和调试

### CF Worker 日志

```bash
npm run tail
```

### Redis 监控

```bash
# 查看 Stream 消息
curl -X POST \
  -H "Authorization: Bearer {REDIS_TOKEN}" \
  "{REDIS_ENDPOINT}" \
  -d '["XRANGE", "tg_messages", "-", "+", "COUNT", 10]'

# 查看 Stream 信息
curl -X POST \
  -H "Authorization: Bearer {REDIS_TOKEN}" \
  "{REDIS_ENDPOINT}" \
  -d '["XINFO", "STREAM", "tg_messages"]'

# 查看消费者组信息
curl -X POST \
  -H "Authorization: Bearer {REDIS_TOKEN}" \
  "{REDIS_ENDPOINT}" \
  -d '["XINFO", "GROUPS", "tg_messages"]'
```

---

## 成本估算

- **CF Worker**：免费层（100 万请求/天）
- **Upstash Redis**：免费层（10,000 命令/天）
- **总成本**：基本零成本（流量小）
