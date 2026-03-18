# CF Worker Telegram Bot 设计文档

## 项目范围

**本项目只开发 CF Worker**，与后端解耦。Backend 是独立项目。

Worker 只负责接收 Telegram webhook 并写入 Redis Hash，Telegram API 操作由 Backend 直接执行。

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
│  /webhook/telegram  ──────────────► │ HSET → messages
│                                     │
│  /health                            │
└─────────────────────────────────────┘
       │
       │ Redis Hash: messages
       ▼
┌─────────────────────────────────────┐
│   Backend (VPS)                     │
│                                     │
│   轮询 messages Hash                │
│   调用 Claude CLI                   │
│   直接调用 Telegram API             │
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
4. **写入** 消息记录到 Redis Hash

Backend 负责：
1. **轮询** Redis Hash 获取新消息
2. **调用** Claude CLI 处理
3. **直接调用** Telegram API 发送/编辑/删除消息
4. **更新** 消息状态

---

## Redis 配置

使用 Upstash Redis（REST API）：

```
REDIS_ENDPOINT = https://robust-mule-36901.upstash.io
REDIS_TOKEN = upstash-token-xxx
```

---

## 通信协议

### 消息记录 (`messages` Hash)

Worker 收到 Telegram 消息后写入 Redis Hash，Backend 轮询处理：

**存储结构：**
```
Key: messages
Type: Hash
Field: msg_id
Value: Message JSON
```

**消息格式：**
```json
{
  "msg_id": "msg_1710000000_abc123",
  "chat_id": 123456789,
  "user_id": 987654321,
  "username": "john_doe",
  "message_type": "text",
  "content": "用户的输入文本",
  "reply_to_msg_id": null,
  "ack_message_id": 456,
  "ack_status": "pending",
  "message_status": "fresh",
  "created_at": 1710000000,
  "processed_at": null
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `msg_id` | string | 消息唯一标识，格式 `msg_{timestamp}_{random}` |
| `chat_id` | number | Telegram chat ID |
| `user_id` | number | Telegram user ID |
| `username` | string | 用户名，可能为空 |
| `message_type` | string | `text` / `photo` / `document` / `command` |
| `content` | string | 消息内容 |
| `reply_to_msg_id` | number \| null | 回复的消息 ID |
| `ack_message_id` | number \| null | Bot 发送的 ack 消息 ID |
| `ack_status` | string | `pending` / `edited` / `deleted` |
| `message_status` | string | `fresh` / `processing` / `processed` |
| `created_at` | number | 创建时间戳（秒） |
| `processed_at` | number \| null | 处理完成时间戳 |

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
# 查看所有消息
curl -X POST \
  -H "Authorization: Bearer {REDIS_TOKEN}" \
  "{REDIS_ENDPOINT}" \
  -d '["HGETALL", "messages"]'

# 查看消息数量
curl -X POST \
  -H "Authorization: Bearer {REDIS_TOKEN}" \
  "{REDIS_ENDPOINT}" \
  -d '["HLEN", "messages"]'
```

---

## 成本估算

- **CF Worker**：免费层（100 万请求/天）
- **Upstash Redis**：免费层（10,000 命令/天）
- **总成本**：基本零成本（流量小）
