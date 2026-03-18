# Bot 与 Backend 通信协议

本文档定义 CF Worker 与 Backend 之间的通信协议。

---

## 概览

```
┌─────────┐                    ┌─────────┐
│  Bot    │  ──HSET messages──▶│ Backend │
│ (Worker)│                    │  (VPS)  │
└─────────┘                    └─────────┘
                                    │
                                    │ 直接调用 Telegram API
                                    ▼
                              Telegram Server
```

Worker 只负责接收 webhook 并写入消息记录，Telegram API 操作由 Backend 直接执行。

---

## Redis 存储

### 数据结构

| Key | Type | 说明 |
|-----|------|------|
| `messages` | Hash | 消息记录，field 为 msg_id |

### Redis 操作

- **写入消息**：`HSET messages {msg_id} {json}`
- **获取单条**：`HGET messages {msg_id}`
- **获取所有**：`HGETALL messages`
- **更新消息**：`HSET messages {msg_id} {json}`（覆盖）

---

## 消息记录格式

Bot 收到 Telegram 消息后写入，Backend 轮询处理：

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
| `username` | string | 用户名，可能为空字符串 |
| `message_type` | string | `text` / `command` / `photo` / `document` |
| `content` | string | 消息内容 |
| `reply_to_msg_id` | number \| null | 回复的消息 ID |
| `ack_message_id` | number \| null | Bot 发送的 ack 消息 ID |
| `ack_status` | string | `pending` / `edited` / `deleted` |
| `message_status` | string | `fresh` / `processing` / `processed` |
| `created_at` | number | 创建时间戳（秒） |
| `processed_at` | number \| null | 处理完成时间戳 |

### 字段说明

**ack_status：**
- `pending` - 初始状态，ack 消息未被处理
- `edited` - Backend 已编辑 ack 消息为结果
- `deleted` - Backend 已删除 ack 消息

**message_status：**
- `fresh` - 新消息，等待处理
- `processing` - Backend 正在处理
- `processed` - 处理完成

**message_type：**
- `text` - 纯文本消息
- `command` - 命令（以 `/` 开头）
- `photo` - 图片消息，`content` 为 caption
- `document` - 文件消息，`content` 为 caption

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
3. Bot HSET messages: {..., ack_message_id: 456, ack_status: "pending", message_status: "fresh"}
4. Backend 轮询发现 fresh 消息
5. Backend 更新 message_status: "processing"
6. Backend 处理消息
7. Backend 调用 editMessageText 编辑 ack 为结果
8. Backend 更新 ack_status: "edited", message_status: "processed", processed_at: timestamp
```

### 场景 2：复杂处理（删除 ack 发新消息）

```
1. 用户发送复杂请求
2. Bot 发送 ack (message_id: 456)
3. Bot HSET messages: {..., ack_message_id: 456, message_status: "fresh"}
4. Backend 轮询发现 fresh 消息
5. Backend 更新 message_status: "processing"
6. Backend 执行耗时操作
7. Backend 调用 deleteMessage 删除 ack
8. Backend 调用 sendMessage 发送结果
9. Backend 更新 ack_status: "deleted", message_status: "processed", processed_at: timestamp
```

---

## Backend 集成示例

### Python

```python
import requests
import json
import time

REDIS_ENDPOINT = "https://xxx.upstash.io"
REDIS_TOKEN = "your-token"
BOT_TOKEN = "your-bot-token"

def redis_command(command: str, args: list):
    url = f"{REDIS_ENDPOINT}"
    headers = {"Authorization": f"Bearer {REDIS_TOKEN}"}
    resp = requests.post(url, headers=headers, json=[command] + args)
    return resp.json()

def get_all_messages():
    """获取所有消息"""
    result = redis_command("HGETALL", ["messages"])
    if result.get("result"):
        messages = {}
        for i in range(0, len(result["result"]), 2):
            msg_id = result["result"][i]
            msg_data = json.loads(result["result"][i + 1])
            messages[msg_id] = msg_data
        return messages
    return {}

def update_message(msg_id: str, data: dict):
    """更新消息"""
    redis_command("HSET", ["messages", msg_id, json.dumps(data)])

def telegram_api(method: str, data: dict):
    """直接调用 Telegram API"""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    resp = requests.post(url, json=data)
    return resp.json()

def process_messages():
    messages = get_all_messages()

    for msg_id, msg in messages.items():
        if msg["message_status"] != "fresh":
            continue

        # 标记处理中
        msg["message_status"] = "processing"
        update_message(msg_id, msg)

        chat_id = msg["chat_id"]
        ack_msg_id = msg.get("ack_message_id")
        content = msg["content"]

        # 处理消息
        output = process(content)

        # 编辑 ack 消息
        if ack_msg_id:
            telegram_api("editMessageText", {
                "chat_id": chat_id,
                "message_id": ack_msg_id,
                "text": f"✅ 完成！\n\n{output}",
                "parse_mode": "Markdown"
            })
            msg["ack_status"] = "edited"
        else:
            # 发送新消息
            telegram_api("sendMessage", {
                "chat_id": chat_id,
                "text": output,
                "parse_mode": "Markdown"
            })

        # 标记完成
        msg["message_status"] = "processed"
        msg["processed_at"] = int(time.time())
        update_message(msg_id, msg)

def process(content: str) -> str:
    """处理消息内容"""
    return f"处理结果: {content}"

# 轮询
while True:
    process_messages()
    time.sleep(1)
```

---

## 注意事项

1. **消息去重**：使用 msg_id 作为 Hash field，天然去重
2. **状态管理**：Backend 负责更新 message_status 和 ack_status
3. **并发安全**：更新消息前先检查状态，避免重复处理
4. **错误处理**：Backend 应实现 Telegram API 调用重试逻辑
5. **API 限流**：Telegram API 有速率限制，注意控制调用频率
