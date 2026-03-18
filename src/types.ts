// ============ 环境变量 ============
export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  REDIS_ENDPOINT: string;
  REDIS_TOKEN: string;
  ALLOW_USERIDS: string; // 逗号分隔的用户 ID
  API_TOKEN: string; // 唤醒端点鉴权
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

// ============ Worker 队列任务 ============
export type TelegramAction = "send_message" | "edit_message" | "delete_message";

export interface WorkerTask {
  action: TelegramAction;
  chat_id: number;
  data: SendMessageData | EditMessageData | DeleteMessageData;
}

export interface SendMessageData {
  text: string;
  parse_mode?: "Markdown" | "HTML";
  reply_to_msg_id?: number;
  disable_notification?: boolean;
}

export interface EditMessageData {
  message_id: number;
  text: string;
  parse_mode?: "Markdown" | "HTML";
}

export interface DeleteMessageData {
  message_id: number;
}

// ============ Telegram API 响应 ============
export interface TelegramApiResponse {
  ok: boolean;
  result?: {
    message_id?: number;
    [key: string]: unknown;
  };
  description?: string;
  error_code?: number;
}
