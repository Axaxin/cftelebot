// ============ 环境变量 ============
export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  REDIS_ENDPOINT: string;
  REDIS_TOKEN: string;
  ALLOW_USERIDS: string; // 逗号分隔的用户 ID
}

// ============ Backend 队列消息 ============
export interface BackendMessage {
  msg_id: string;
  chat_id: number;
  user_id: number;
  username: string;
  message_type: "text" | "photo" | "document" | "command";
  content: string;
  reply_to_msg_id: number | null;
  ack_message_id: number | null; // ack 消息的 message_id，backend 可编辑/删除
  timestamp: number;
}

// ============ Telegram Webhook Update ============
export interface TelegramUpdate {
  message?: TelegramMessage;
}

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    username?: string;
    [key: string]: unknown;
  };
  chat: {
    id: number;
    [key: string]: unknown;
  };
  text?: string;
  photo?: unknown;
  document?: unknown;
  caption?: string;
  reply_to_message?: {
    message_id: number;
    [key: string]: unknown;
  };
}
