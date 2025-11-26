import { z } from "zod";

/**
 * Message types
 */
export const MessageTypeSchema = z.enum([
  "text", // Regular text message
  "superchat", // Super Chat (paid message)
  "supersticker", // Super Sticker
  "membership", // Membership join/milestone
  "gift", // Gift membership
  "system", // System/engagement message
]);

export type MessageType = z.infer<typeof MessageTypeSchema>;

/**
 * Author badge types
 */
export const BadgeTypeSchema = z.enum(["verified", "owner", "moderator", "member"]);

export type BadgeType = z.infer<typeof BadgeTypeSchema>;

/**
 * Schema for author badge
 */
export const AuthorBadgeSchema = z.object({
  type: BadgeTypeSchema,
  label: z.string(), // Tooltip text like "Verified", "Owner"
  customIcon: z.string().optional(), // URL for custom badge (member badges)
});

export type AuthorBadge = z.infer<typeof AuthorBadgeSchema>;

/**
 * Schema for emoji in message
 */
export const MessageEmojiSchema = z.object({
  emojiId: z.string(),
  shortcut: z.string().optional(), // e.g., ":heart:"
  imageUrl: z.string().optional(), // Image URL for rendering
  isCustom: z.boolean().optional(), // Channel-specific custom emoji
});

export type MessageEmoji = z.infer<typeof MessageEmojiSchema>;

/**
 * Schema for message run (text or emoji segment)
 */
export const MessageRunSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("emoji"),
    emoji: MessageEmojiSchema,
  }),
]);

export type MessageRun = z.infer<typeof MessageRunSchema>;

/**
 * Schema for Super Chat/Sticker colors
 */
export const SuperChatColorsSchema = z.object({
  headerBackgroundColor: z.string().optional(),
  headerTextColor: z.string().optional(),
  bodyBackgroundColor: z.string().optional(),
  bodyTextColor: z.string().optional(),
  authorNameTextColor: z.string().optional(),
});

export type SuperChatColors = z.infer<typeof SuperChatColorsSchema>;

/**
 * Schema for chat message (extended)
 */
export const ChatMessageSchema = z.object({
  id: z.string(),
  type: MessageTypeSchema,
  timestamp: z.number(), // Video offset in seconds

  // Author info
  author: z.string(),
  authorPhoto: z.string().optional(), // Avatar URL
  authorChannelId: z.string().optional(),
  authorBadges: z.array(AuthorBadgeSchema).optional(),

  // Message content
  message: z.string(), // Plain text representation (for compatibility)
  messageRuns: z.array(MessageRunSchema).optional(), // Rich content with emojis

  // Timestamp display
  timestampText: z.string().optional(), // Formatted like "1:48:06" or "-29:11"

  // Super Chat / Super Sticker specific
  amount: z.string().optional(), // e.g., "$5.00"
  colors: SuperChatColorsSchema.optional(),
  stickerUrl: z.string().optional(), // For super stickers

  // Membership specific
  membershipMonths: z.number().optional(),
  membershipLevel: z.string().optional(),

  // Gift membership specific
  giftCount: z.number().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * Schema for chat-loading message from plugin
 */
export const ChatLoadingMessageSchema = z.object({
  loading: z.boolean(),
});

/**
 * Schema for chat-data-chunk message from plugin
 */
export const ChatDataChunkMessageSchema = z.object({
  chunk: z.array(ChatMessageSchema),
  chunkIndex: z.number(),
  totalChunks: z.number(),
  start: z.number(),
  end: z.number(),
});

/**
 * Schema for chat-data-complete message from plugin
 */
export const ChatDataCompleteMessageSchema = z.object({
  totalMessages: z.number(),
});

/**
 * Schema for chat-error message from plugin
 */
export const ChatErrorMessageSchema = z.object({
  message: z.string(),
  error: z.string().optional(),
});

/**
 * Schema for chat-info message from plugin
 */
export const ChatInfoMessageSchema = z.object({
  message: z.string(),
});

/**
 * Schema for live-chat-messages message from plugin (live stream incremental updates)
 */
export const LiveChatMessagesSchema = z.object({
  messages: z.array(ChatMessageSchema),
});

/**
 * Schema for position-update message from plugin
 */
export const PositionUpdateMessageSchema = z.object({
  position: z.number(),
});

/**
 * Scroll direction type
 */
export const ScrollDirectionSchema = z.enum(["bottom-to-top", "top-to-bottom"]);

export type ScrollDirection = z.infer<typeof ScrollDirectionSchema>;

/**
 * Schema for preferences-update message from plugin
 */
export const PreferencesUpdateMessageSchema = z.object({
  maxMessages: z.number(),
  scrollDirection: ScrollDirectionSchema,
  showTimestamp: z.boolean(),
  showAuthorName: z.boolean(),
  showAuthorPhoto: z.boolean(),
});

/**
 * User preferences type
 */
export interface UserPreferences {
  maxMessages: number;
  scrollDirection: ScrollDirection;
  showTimestamp: boolean;
  showAuthorName: boolean;
  showAuthorPhoto: boolean;
}
