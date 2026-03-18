# Bot 与 Backend 通信协议

本文档定义 CF Worker 与 Backend 之间的通信协议。

---

## 概览

```
┌─────────┐                    ┌─────────┐
│  Bot    │  ──backend_queue──▶│ Backend │
│ (Worker)│                    │  (VPS)  │
└─────────┘                    └─────────┘
                                    │
                                    │ 直接调用 Telegram API
                                    ▼
                              Telegram Server
```

Worker 只负责接收 webhook 并写入队列，Telegram API 操作由 Backend 直接执行。

---

## Redis 队列

### 队列名称

| 队列 | 方向 | 用途 |
|------|------|------|
| `backend_queue` | Bot → Backend | 用户消息 |

### Redis 操作

- 写入：`LPUSH backend_queue json_data`
- 读取：`RPOP backend_queue`

---

## Backend 队列消息格式

Bot 收到 Telegram 消息后写入，Backend 消费：

```json
{
  "msg_id": "msg_1710000000_abc123",
  "chat_id": 123456789,
  "user_id": 987654321,
  "username": "john_doe",
  "message_type": "text",
  "content": "用户的输入文本",
  "reply_to_msg_id": null,
  "ack_message_id": 98765,
  "timestamp": 1710000000
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `msg_id` | string | ✓ | 消息唯一标识，格式 `msg_{timestamp}_{random}` |
| `chat_id` | number | ✓ | Telegram chat ID |
| `user_id` | number | ✓ | Telegram user ID |
| `username` | string | | 用户名，可能为空字符串 |
| `message_type` | string | ✓ | 消息类型 |
| `content` | string | ✓ | 消息内容 |
| `reply_to_msg_id` | number \| null | | 回复的消息 ID |
| `ack_message_id` | number \| null | | Bot 发送的 ack 消息 ID，可编辑或删除 |
| `timestamp` | number | ✓ | Unix 时间戳（秒） |

**ack_message_id 说明：**

Bot 收到用户消息后会立即发送一条 ack 消息（`⏳ 收到，正在处理...`），并将该消息的 ID 传入此字段。Backend 可以：
- **编辑 ack 消息**：调用 `editMessageText` 将 ack 改为处理结果
- **删除 ack 消息**：调用 `deleteMessage` 删除 ack，再发送新消息
- **忽略**：直接发送新消息，保留 ack

**message_type 取值：**

| 值 | 说明 |
|----|------|
| `text` | 纯文本消息 |
| `command` | 命令（以 `/` 开头） |
| `photo` | 图片消息，`content` 为 caption |
| `document` | 文件消息，`content` 为 caption |

---

## Telegram API 调用

Backend 直接调用 Telegram Bot API：

**基础 URL：** `https://api.telegram.org/bot{BOT_TOKEN}`

### 常用 API

#### 1. sendMessage - 发送消息

```http
POST /sendMessage
Content-Type: application/json

{
  "chat_id": 123456789,
  "text": "要发送的消息",
  "parse_mode": "Markdown"
}
```

#### 2. editMessageText - 编辑消息

```http
POST /editMessageText
Content-Type: application/json

{
  "chat_id": 123456789,
  "message_id": 98765,
  "text": "编辑后的消息",
  "parse_mode": "Markdown"
}
```

#### 3. deleteMessage - 删除消息

```http
POST /deleteMessage
Content-Type: application/json

{
  "chat_id": 123456789,
  "message_id": 98765
}
```

---

## 典型交互流程

### 场景 1：简单问答（编辑 ack）

```
1. 用户发送 "你好"
2. Bot 发送 ack: "⏳ 收到，正在处理..." (message_id: 456)
3. Bot → backend_queue: {"msg_id": "msg_xxx", "chat_id": 123, "ack_message_id": 456, ...}
4. Backend RPOP 获取消息，处理
5. Backend 调用 editMessageText: {"chat_id": 123, "message_id": 456, "text": "你好！有什么可以帮你的？"}
```

### 场景 2：复杂处理（删除 ack 发新消息）

```
1. 用户发送复杂请求
2. Bot 发送 ack (message_id: 456)
3. Bot → backend_queue: 消息含 ack_message_id
4. Backend 获取消息，执行耗时操作
5. Backend 调用 deleteMessage: {"chat_id": 123, "message_id": 456}
6. Backend 调用 sendMessage: {"chat_id": 123, "text": "✅ 完成！\n结果：..."}
```

---

## Backend 集成示例

### Python

```python
import requests
import json

REDIS_ENDPOINT = "https://xxx.upstash.io"
REDIS_TOKEN = "your-token"
BOT_TOKEN = "your-bot-token"

def redis_command(command: str, args: list):
    url = f"{REDIS_ENDPOINT}/{command}/{REDIS_TOKEN}"
    params = [("args", a) for a in args]
    resp = requests.post(url, params=params)
    return resp.json()

def telegram_api(method: str, data: dict):
    """直接调用 Telegram API"""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    resp = requests.post(url, json=data)
    return resp.json()

def process_messages():
    while True:
        result = redis_command("rpop", ["backend_queue"])
        if not result.get("result"):
            break

        message = json.loads(result["result"])
        chat_id = message["chat_id"]
        ack_msg_id = message.get("ack_message_id")
        content = message["content"]

        # 处理消息...
        output = process(content)

        # 方式1：编辑 ack 消息为结果
        if ack_msg_id:
            telegram_api("editMessageText", {
                "chat_id": chat_id,
                "message_id": ack_msg_id,
                "text": f"✅ 完成！\n\n{output}",
                "parse_mode": "Markdown"
            })
        else:
            # ack 发送失败，直接发新消息
            telegram_api("sendMessage", {
                "chat_id": chat_id,
                "text": output,
                "parse_mode": "Markdown"
            })
```

---

## 注意事项

1. **消息顺序**：使用 LPUSH/RPOP 保证 FIFO
2. **错误处理**：Backend 应实现 Telegram API 调用重试逻辑
3. **超时**：Telegram webhook 要求 5 秒内响应，Bot 收到消息立即返回 200
4. **并发**：Backend 可多进程消费，但同一 chat_id 的消息建议串行处理
5. **API 限流**：Telegram API 有速率限制，注意控制调用频率
