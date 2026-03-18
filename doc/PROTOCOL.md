# Bot 与 Backend 通信协议

本文档定义 CF Worker 与 Backend 之间的通信协议。

---

## 概览

```
┌─────────┐                    ┌─────────┐
│  Bot    │  ──backend_queue──▶│ Backend │
│ (Worker)│                    │  (VPS)  │
│         │  ◀──worker_queue───│         │
└─────────┘                    └─────────┘
     ▲                              │
     └──────── POST /wakeup ────────┘
```

---

## Redis 队列

### 队列名称

| 队列 | 方向 | 用途 |
|------|------|------|
| `backend_queue` | Bot → Backend | 用户消息 |
| `worker_queue` | Backend → Bot | Telegram 操作任务 |

### Redis 操作

- 写入：`LPUSH queue_name json_data`
- 读取：`RPOP queue_name`

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
- **编辑 ack 消息**：用 `edit_message` 将 ack 改为处理结果
- **删除 ack 消息**：用 `delete_message` 删除 ack，再发送新消息
- **忽略**：直接发送新消息，保留 ack

**message_type 取值：**

| 值 | 说明 |
|----|------|
| `text` | 纯文本消息 |
| `command` | 命令（以 `/` 开头） |
| `photo` | 图片消息，`content` 为 caption |
| `document` | 文件消息，`content` 为 caption |

---

## Worker 队列任务格式

Backend 处理完成后写入，Bot 消费并执行：

```json
{
  "action": "send_message",
  "chat_id": 123456789,
  "data": {}
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `action` | string | ✓ | 操作类型 |
| `chat_id` | number | ✓ | Telegram chat ID |
| `data` | object | ✓ | 操作参数 |

### action 类型

#### 1. send_message - 发送消息

```json
{
  "action": "send_message",
  "chat_id": 123456789,
  "data": {
    "text": "要发送的消息",
    "parse_mode": "Markdown",
    "reply_to_msg_id": null,
    "disable_notification": false
  }
}
```

| data 字段 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|:----:|--------|------|
| `text` | string | ✓ | - | 消息文本 |
| `parse_mode` | string | | `Markdown` | `Markdown` 或 `HTML` |
| `reply_to_msg_id` | number | | - | 回复指定消息 |
| `disable_notification` | boolean | | `false` | 静默发送 |

#### 2. edit_message - 编辑消息

```json
{
  "action": "edit_message",
  "chat_id": 123456789,
  "data": {
    "message_id": 98765,
    "text": "编辑后的消息",
    "parse_mode": "Markdown"
  }
}
```

| data 字段 | 类型 | 必填 | 说明 |
|-----------|------|:----:|------|
| `message_id` | number | ✓ | 要编辑的消息 ID |
| `text` | string | ✓ | 新的消息文本 |
| `parse_mode` | string | | `Markdown` 或 `HTML` |

#### 3. delete_message - 删除消息

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
|-----------|------|:----:|------|
| `message_id` | number | ✓ | 要删除的消息 ID |

---

## 唤醒端点

Backend 写入任务后调用此端点通知 Bot 处理。

**请求：**
```
POST /wakeup
Authorization: Bearer {API_TOKEN}
```

**响应：**
```json
{
  "ok": true,
  "processed": 3,
  "failed": 0
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `ok` | boolean | 是否成功 |
| `processed` | number | 成功处理的任务数 |
| `failed` | number | 失败的任务数 |

**错误响应：**
```json
{
  "ok": false,
  "error": "Unauthorized"
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
5. Backend → worker_queue: {"action": "edit_message", "chat_id": 123, "data": {"message_id": 456, "text": "你好！有什么可以帮你的？"}}
6. Backend POST /wakeup
7. Bot 编辑 ack 消息为结果
```

### 场景 2：复杂处理（删除 ack 发新消息）

```
1. 用户发送复杂请求
2. Bot 发送 ack (message_id: 456)
3. Bot → backend_queue: 消息含 ack_message_id
4. Backend 获取消息，执行耗时操作
5. Backend → worker_queue: {"action": "delete_message", "data": {"message_id": 456}}
6. Backend → worker_queue: {"action": "send_message", "data": {"text": "✅ 完成！\n结果：..."}}
7. Backend POST /wakeup
8. Bot 删除 ack，发送新消息
```

### 场景 3：多任务批量处理

```
1. Backend 连续 LPUSH 多个任务到 worker_queue
2. Backend POST /wakeup 一次
3. Bot 循环 RPOP 处理所有任务
```

---

## Redis 连接示例

### Python

```python
import requests
import json

REDIS_ENDPOINT = "https://xxx.upstash.io"
REDIS_TOKEN = "your-token"
WORKER_URL = "https://your-worker.workers.dev"
API_TOKEN = "your-api-token"

def redis_command(command: str, args: list):
    url = f"{REDIS_ENDPOINT}/{command}/{REDIS_TOKEN}"
    params = [("args", a) for a in args]
    resp = requests.post(url, params=params)
    return resp.json()

def push_task(action: str, chat_id: int, data: dict):
    """推送任务到 worker_queue"""
    task = {"action": action, "chat_id": chat_id, "data": data}
    redis_command("lpush", ["worker_queue", json.dumps(task)])

def wakeup_worker():
    """唤醒 Bot"""
    requests.post(
        f"{WORKER_URL}/wakeup",
        headers={"Authorization": f"Bearer {API_TOKEN}"}
    )

# 读取消息
result = redis_command("rpop", ["backend_queue"])
if result.get("result"):
    message = json.loads(result["result"])
    chat_id = message["chat_id"]
    ack_msg_id = message.get("ack_message_id")
    content = message["content"]

    # 处理消息...
    output = process(content)

    # 方式1：编辑 ack 消息为结果
    if ack_msg_id:
        push_task("edit_message", chat_id, {
            "message_id": ack_msg_id,
            "text": f"✅ 完成！\n\n{output}",
            "parse_mode": "Markdown"
        })
    else:
        # ack 发送失败，直接发新消息
        push_task("send_message", chat_id, {
            "text": output,
            "parse_mode": "Markdown"
        })

    wakeup_worker()
```

---

## 注意事项

1. **消息顺序**：使用 LPUSH/RPOP 保证 FIFO
2. **错误处理**：Bot 执行失败会记录日志但不重试，Backend 如需确保送达应实现重试逻辑
3. **超时**：Telegram webhook 要求 5 秒内响应，Bot 收到消息立即返回 200，不等待 Backend
4. **并发**：Backend 可多进程消费，但同一 chat_id 的消息建议串行处理
