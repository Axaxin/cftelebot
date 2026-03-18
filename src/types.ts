// ============ 环境变量 ============
export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  REDIS_ENDPOINT: string;
  REDIS_TOKEN: string;
  ALLOW_USERIDS: string; // 逗号分隔的用户 ID
}

// ============ 消息记录 ============
export interface Message {
  msg_id: string;
  chat_id: number;
  user_id: number;
  username: string;
  message_type: "text" | "photo" | "document" | "command";
  content: string;
  reply_to_msg_id: number | null;
  ack_message_id: number | null;
  ack_status: "pending" | "edited" | "deleted";
  message_status: "fresh" | "processing" | "processed";
  created_at: number;
  processed_at: number | null;
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
