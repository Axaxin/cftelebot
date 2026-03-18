# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目范围

**本项目只开发 CF Worker**，与后端解耦。Backend 是独立项目。

## 架构

```
用户消息 → Worker 检查白名单 → 发送 ack → 写入 Redis[backend_queue]
                                                      ↓
                                                 Backend 消费
                                                      ↓
                                           写入 Redis[worker_queue]
                                                      ↓
                                           POST /wakeup 唤醒 Worker
                                                      ↓
Telegram ← Worker 从 worker_queue 取任务 → 执行 Telegram API
```

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
| `API_TOKEN` | ✓ | 唤醒端点鉴权 token |

**注意：** `ALLOW_USERIDS` 未设置时，Bot 不回复任何消息。

## 端点

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/webhook/telegram` | POST | - | Telegram webhook |
| `/wakeup` | POST | Bearer token | Backend 唤醒 Worker |
| `/health` | GET | - | 健康检查 |

## Upstash Redis REST API

使用 URL 路径格式，不是 JSON body：

```
GET {REDIS_ENDPOINT}/{command}/{arg1}/{arg2}/...
Authorization: Bearer {REDIS_TOKEN}
```

示例：
```
GET https://xxx.upstash.io/lpush/backend_queue/{json_data}
GET https://xxx.upstash.io/rpop/backend_queue
```

## 核心流程

1. **收到用户消息** → 检查白名单 → 发送 ack → 写入 `backend_queue`
2. **被唤醒** → 从 `worker_queue` 取任务 → 执行 Telegram API (send/edit/delete)

## Telegram Webhook 设置

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://<worker-domain>/webhook/telegram" \
  -d "allowed_updates=[\"message\"]"
```

## 文档

- `doc/DESIGN.md` - 设计文档
- `doc/PROTOCOL.md` - 通信协议（供 Backend 参考）
