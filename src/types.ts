// ============ 环境变量 ============
export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  REDIS_ENDPOINT: string;
  REDIS_TOKEN: string;
  ALLOW_USERIDS: string; // 逗号分隔的用户 ID
  API_TOKEN: string; // Bearer token for /api/* proxy endpoints
}

// ============ 消息记录 ============
// 消息类型：基于 Telegram Message 中存在的字段判断
export type MessageType =
  | "text"
  | "command"
  | "photo"
  | "video"
  | "audio"
  | "document"
  | "animation"
  | "voice"
  | "video_note"
  | "sticker"
  | "contact"
  | "location"
  | "venue"
  | "poll"
  | "dice"
  | "game"
  | "callback"
  | "other";

export interface Message {
  // === 核心字段（用于索引/查询）===
  msg_id: string; // 内部唯一标识
  chat_id: number;
  user_id: number;
  username: string;
  message_type: MessageType;
  created_at: number; // 收到消息的时间戳

  // === 自定义状态字段 ===
  ack_message_id: number | null;
  ack_status: "pending" | "edited" | "deleted";
  message_status: "fresh" | "processing" | "processed";
  processed_at: number | null;

  // === callback_query 专用字段（非 callback 时为空字符串）===
  callback_id: string;
  callback_data: string;
  message_id: string;

  // === 原始 Telegram Message / CallbackQuery ===
  raw_message: TelegramMessage | TelegramCallbackQuery;
}

// ============ Telegram Webhook Update ============
export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    is_bot?: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    [key: string]: unknown;
  };
  message: TelegramMessage;
  data?: string;
  [key: string]: unknown;
}

// 宽松定义，接受 Telegram API 返回的完整 Message 对象
export interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    is_bot?: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    [key: string]: unknown;
  };
  chat: {
    id: number;
    type: string;
    title?: string;
    username?: string;
    [key: string]: unknown;
  };
  date: number;
  text?: string;
  entities?: unknown[];
  caption?: string;
  // 媒体类型
  photo?: unknown;
  video?: unknown;
  audio?: unknown;
  document?: unknown;
  animation?: unknown;
  voice?: unknown;
  video_note?: unknown;
  sticker?: unknown;
  // 其他消息类型
  contact?: unknown;
  location?: unknown;
  venue?: unknown;
  poll?: unknown;
  dice?: unknown;
  game?: unknown;
  // 回复相关
  reply_to_message?: TelegramMessage;
  // 其他字段
  [key: string]: unknown;
}
