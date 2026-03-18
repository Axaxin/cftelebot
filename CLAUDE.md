# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目范围

**本项目只开发 CF Worker**，与后端解耦。Backend 是独立项目。

## 架构

```
用户消息 → Worker 发送 ack → Redis[backend_queue] → Backend
                                    ↑                    ↓
                                    │            Redis[worker_queue]
                                    │                    ↓
Telegram ← Worker 执行任务 ←──── POST /wakeup (唤醒)
```

## 开发命令

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 部署
npm run deploy

# 查看日志
npm run tail
```

## 环境变量

在 Cloudflare Dashboard 中配置：

| 变量 | 必填 | 说明 |
|------|:----:|------|
| `TELEGRAM_BOT_TOKEN` | ✓ | Telegram Bot Token |
| `REDIS_ENDPOINT` | ✓ | Upstash Redis endpoint (如 https://xxx.upstash.io) |
| `REDIS_TOKEN` | ✓ | Upstash Redis token |
| `ALLOW_USERIDS` | ✓ | 允许使用的用户 ID，逗号分隔 (如 `123456,789012`) |
| `API_TOKEN` | ✓ | 唤醒端点鉴权 token |

**注意：** `ALLOW_USERIDS` 未设置时，Bot 不回复任何消息。

## 端点

| 端点 | 方法 | 鉴权 | 说明 |
|------|------|------|------|
| `/webhook/telegram/{token}` | POST | - | Telegram webhook |
| `/wakeup` | POST | Bearer token | Backend 唤醒 Worker |
| `/health` | GET | - | 健康检查 |

## 核心流程

1. **收到用户消息** → 检查白名单 → 发送 ack 消息 → 写入 `backend_queue`
2. **被唤醒** → 从 `worker_queue` 取任务 → 执行 Telegram API

## 文档

- `doc/DESIGN.md` - 设计文档
- `doc/PROTOCOL.md` - 通信协议（供 Backend 参考）
