import { z } from "zod";

// ============================================================
// Output Schemas (sent to sidebar)
// ============================================================

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
  label: z.string(),
  customIcon: z.string().optional(),
});

export type AuthorBadge = z.infer<typeof AuthorBadgeSchema>;

/**
 * Schema for emoji in message
 */
export const MessageEmojiSchema = z.object({
  emojiId: z.string(),
  shortcut: z.string().optional(),
  imageUrl: z.string().optional(),
  isCustom: z.boolean().optional(),
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
 * Schema for the parsed chat message (output)
 */
export const ChatMessageSchema = z.object({
  id: z.string(),
  type: MessageTypeSchema,
  timestamp: z.number(),

  // Author info
  author: z.string(),
  authorPhoto: z.string().optional(),
  authorChannelId: z.string().optional(),
  authorBadges: z.array(AuthorBadgeSchema).optional(),

  // Message content
  message: z.string(),
  messageRuns: z.array(MessageRunSchema).optional(),

  // Timestamp display
  timestampText: z.string().optional(),

  // Super Chat / Super Sticker specific
  amount: z.string().optional(),
  colors: SuperChatColorsSchema.optional(),
  stickerUrl: z.string().optional(),

  // Membership specific
  membershipMonths: z.number().optional(),
  membershipLevel: z.string().optional(),

  // Gift membership specific
  giftCount: z.number().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ============================================================
// Input Schemas (yt-dlp live_chat.json parsing)
// ============================================================

/**
 * Schema for thumbnail
 */
const ThumbnailSchema = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/**
 * Schema for thumbnails array
 */
const ThumbnailsSchema = z.object({
  thumbnails: z.array(ThumbnailSchema),
});

/**
 * Schema for message runs (text and emoji) from yt-dlp
 */
const YTMessageRunSchema = z.object({
  text: z.string().optional(),
  emoji: z
    .object({
      emojiId: z.string().optional(),
      shortcuts: z.array(z.string()).optional(),
      image: ThumbnailsSchema.optional(),
      isCustomEmoji: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Schema for author name
 */
const AuthorNameSchema = z.object({
  simpleText: z.string(),
});

/**
 * Schema for message content
 */
const MessageContentSchema = z.object({
  runs: z.array(YTMessageRunSchema),
});

/**
 * Schema for simple text
 */
const SimpleTextSchema = z.object({
  simpleText: z.string(),
});

/**
 * Schema for author badge from yt-dlp
 */
const YTAuthorBadgeRendererSchema = z.object({
  icon: z
    .object({
      iconType: z.string(),
    })
    .optional(),
  tooltip: z.string().optional(),
  customThumbnail: ThumbnailsSchema.optional(),
});

const YTAuthorBadgeSchema = z.object({
  liveChatAuthorBadgeRenderer: YTAuthorBadgeRendererSchema,
});

/**
 * Schema for liveChatTextMessageRenderer
 */
const LiveChatTextMessageRendererSchema = z.object({
  id: z.string().optional(),
  authorName: AuthorNameSchema.optional(),
  authorPhoto: ThumbnailsSchema.optional(),
  authorExternalChannelId: z.string().optional(),
  authorBadges: z.array(YTAuthorBadgeSchema).optional(),
  message: MessageContentSchema.optional(),
  timestampText: SimpleTextSchema.optional(),
  timestampUsec: z.string().optional(),
});

/**
 * Schema for liveChatPaidMessageRenderer (superchat)
 */
const LiveChatPaidMessageRendererSchema = z.object({
  id: z.string().optional(),
  authorName: AuthorNameSchema.optional(),
  authorPhoto: ThumbnailsSchema.optional(),
  authorExternalChannelId: z.string().optional(),
  authorBadges: z.array(YTAuthorBadgeSchema).optional(),
  message: MessageContentSchema.optional(),
  timestampText: SimpleTextSchema.optional(),
  timestampUsec: z.string().optional(),
  purchaseAmountText: SimpleTextSchema.optional(),
  headerBackgroundColor: z.number().optional(),
  headerTextColor: z.number().optional(),
  bodyBackgroundColor: z.number().optional(),
  bodyTextColor: z.number().optional(),
  authorNameTextColor: z.number().optional(),
});

/**
 * Schema for liveChatPaidStickerRenderer (super sticker)
 */
const LiveChatPaidStickerRendererSchema = z.object({
  id: z.string().optional(),
  authorName: AuthorNameSchema.optional(),
  authorPhoto: ThumbnailsSchema.optional(),
  authorExternalChannelId: z.string().optional(),
  authorBadges: z.array(YTAuthorBadgeSchema).optional(),
  timestampText: SimpleTextSchema.optional(),
  timestampUsec: z.string().optional(),
  purchaseAmountText: SimpleTextSchema.optional(),
  sticker: ThumbnailsSchema.optional(),
  moneyChipBackgroundColor: z.number().optional(),
  moneyChipTextColor: z.number().optional(),
  backgroundColor: z.number().optional(),
  authorNameTextColor: z.number().optional(),
});

/**
 * Schema for liveChatMembershipItemRenderer (membership events)
 */
const LiveChatMembershipItemRendererSchema = z.object({
  id: z.string().optional(),
  authorName: AuthorNameSchema.optional(),
  authorPhoto: ThumbnailsSchema.optional(),
  authorExternalChannelId: z.string().optional(),
  authorBadges: z.array(YTAuthorBadgeSchema).optional(),
  timestampText: SimpleTextSchema.optional(),
  timestampUsec: z.string().optional(),
  headerSubtext: MessageContentSchema.optional(), // Contains membership duration
  message: MessageContentSchema.optional(),
});

/**
 * Schema for liveChatSponsorshipsGiftPurchaseAnnouncementRenderer (gift membership)
 */
const LiveChatSponsorshipsGiftPurchaseAnnouncementRendererSchema = z.object({
  id: z.string().optional(),
  authorName: AuthorNameSchema.optional(),
  authorPhoto: ThumbnailsSchema.optional(),
  authorExternalChannelId: z.string().optional(),
  timestampUsec: z.string().optional(),
  header: z
    .object({
      liveChatSponsorshipsHeaderRenderer: z
        .object({
          primaryText: MessageContentSchema.optional(), // Gift count info
        })
        .optional(),
    })
    .optional(),
});

/**
 * Schema for liveChatViewerEngagementMessageRenderer (system messages)
 */
const LiveChatViewerEngagementMessageRendererSchema = z.object({
  id: z.string().optional(),
  timestampUsec: z.string().optional(),
  message: MessageContentSchema.optional(),
  icon: z
    .object({
      iconType: z.string().optional(),
    })
    .optional(),
});

/**
 * Schema for chat item (all possible renderers)
 */
const ChatItemSchema = z.object({
  liveChatTextMessageRenderer: LiveChatTextMessageRendererSchema.optional(),
  liveChatPaidMessageRenderer: LiveChatPaidMessageRendererSchema.optional(),
  liveChatPaidStickerRenderer: LiveChatPaidStickerRendererSchema.optional(),
  liveChatMembershipItemRenderer: LiveChatMembershipItemRendererSchema.optional(),
  liveChatSponsorshipsGiftPurchaseAnnouncementRenderer:
    LiveChatSponsorshipsGiftPurchaseAnnouncementRendererSchema.optional(),
  liveChatViewerEngagementMessageRenderer: LiveChatViewerEngagementMessageRendererSchema.optional(),
});

/**
 * Schema for addChatItemAction
 */
const AddChatItemActionSchema = z.object({
  item: ChatItemSchema,
});

/**
 * Schema for action
 */
const ActionSchema = z.object({
  addChatItemAction: AddChatItemActionSchema.optional(),
});

/**
 * Schema for replayChatItemAction
 */
const ReplayChatItemActionSchema = z.object({
  videoOffsetTimeMsec: z.union([z.string(), z.number()]).optional(),
  actions: z.array(ActionSchema),
});

/**
 * Schema for a line in the live_chat.json file
 */
export const LiveChatLineSchema = z.object({
  replayChatItemAction: ReplayChatItemActionSchema.optional(),
});
