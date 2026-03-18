# CF Telebot

Cloudflare Worker Telegram Bot 网关。

## 功能

- 接收 Telegram webhook，转发消息到 Redis 队列
- 用户白名单控制
- 自动发送 ack 消息
- 支持发送、编辑、删除 Telegram 消息

## 部署

1. Fork 本仓库
2. Cloudflare Dashboard → Workers → Create → Connect to Git
3. 选择仓库，自动部署
4. 在 Settings → Variables 中配置环境变量

## 环境变量

| 变量 | 说明 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `REDIS_ENDPOINT` | Upstash Redis endpoint |
| `REDIS_TOKEN` | Upstash Redis token |
| `ALLOW_USERIDS` | 白名单用户 ID，逗号分隔 |
| `API_TOKEN` | 唤醒端点鉴权 token |

## 文档

- [设计文档](doc/DESIGN.md)
- [通信协议](doc/PROTOCOL.md)

## License

MIT
