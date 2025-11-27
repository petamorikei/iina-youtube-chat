import type {
  AuthorBadge,
  BadgeType,
  ChatMessage,
  MessageEmoji,
  MessageRun,
  MessageType,
  ScrollDirection,
  SuperChatColors,
  UserPreferences,
} from "./schemas";

export type {
  AuthorBadge,
  BadgeType,
  ChatMessage,
  MessageEmoji,
  MessageRun,
  MessageType,
  ScrollDirection,
  SuperChatColors,
  UserPreferences,
};

export interface ChatProgress {
  fetchedMessages: number;
  currentOffsetMs: number;
  status: "fetching" | "complete" | "error";
  message?: string;
}

export interface AppState {
  loading: boolean;
  error: string | null;
  info: string | null;
  progress: ChatProgress | null;
  messages: ChatMessage[];
  currentPosition: number | null;
  preferences: UserPreferences;
}

export type StatusMessageType = "loading" | "error" | "info";
