import type {
  AuthorBadge,
  BadgeType,
  ChatMessage,
  MessageEmoji,
  MessageRun,
  MessageType,
  SuperChatColors,
} from "./schemas";

export type { AuthorBadge, BadgeType, ChatMessage, MessageEmoji, MessageRun, MessageType, SuperChatColors };

export interface AppState {
  loading: boolean;
  error: string | null;
  info: string | null;
  messages: ChatMessage[];
  currentPosition: number | null;
}

export type StatusMessageType = "loading" | "error" | "info";
