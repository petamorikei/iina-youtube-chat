/**
 * Chat Item Parser - Converts YouTube chat item renderers into ChatMessage objects
 * Shared by the live and archived chat fetchers
 */

import type { AuthorBadge, BadgeType, ChatMessage, MessageRun, MessageType, SuperChatColors } from "../src/schemas";

// ============================================================
// YouTube chat item types
// ============================================================

interface Thumbnail {
  url: string;
  width?: number;
  height?: number;
}

interface MessageRunYT {
  text?: string;
  emoji?: {
    emojiId?: string;
    shortcuts?: string[];
    image?: { thumbnails?: Thumbnail[] };
    isCustomEmoji?: boolean;
  };
}

interface AuthorBadgeYT {
  liveChatAuthorBadgeRenderer: {
    icon?: { iconType?: string };
    tooltip?: string;
    customThumbnail?: { thumbnails?: Thumbnail[] };
  };
}

interface LiveChatRenderer {
  id: string;
  message?: { runs?: MessageRunYT[] };
  authorName?: { simpleText?: string };
  authorPhoto?: { thumbnails?: Thumbnail[] };
  authorExternalChannelId?: string;
  authorBadges?: AuthorBadgeYT[];
  timestampUsec?: string;
  timestampText?: { simpleText?: string };
}

interface LiveChatPaidRenderer extends LiveChatRenderer {
  purchaseAmountText?: { simpleText?: string };
  headerBackgroundColor?: number;
  headerTextColor?: number;
  bodyBackgroundColor?: number;
  bodyTextColor?: number;
  authorNameTextColor?: number;
}

interface LiveChatStickerRenderer {
  id: string;
  authorName?: { simpleText?: string };
  authorPhoto?: { thumbnails?: Thumbnail[] };
  authorExternalChannelId?: string;
  authorBadges?: AuthorBadgeYT[];
  timestampUsec?: string;
  timestampText?: { simpleText?: string };
  purchaseAmountText?: { simpleText?: string };
  sticker?: { thumbnails?: Thumbnail[] };
  backgroundColor?: number;
  authorNameTextColor?: number;
}

interface LiveChatMembershipRenderer {
  id: string;
  authorName?: { simpleText?: string };
  authorPhoto?: { thumbnails?: Thumbnail[] };
  authorExternalChannelId?: string;
  authorBadges?: AuthorBadgeYT[];
  timestampUsec?: string;
  timestampText?: { simpleText?: string };
  headerSubtext?: { runs?: MessageRunYT[] };
  message?: { runs?: MessageRunYT[] };
}

interface LiveChatGiftRenderer {
  id: string;
  authorName?: { simpleText?: string };
  authorPhoto?: { thumbnails?: Thumbnail[] };
  authorExternalChannelId?: string;
  timestampUsec?: string;
  timestampText?: { simpleText?: string };
  header?: {
    liveChatSponsorshipsHeaderRenderer?: {
      primaryText?: { runs?: MessageRunYT[] };
    };
  };
}

interface LiveChatEngagementRenderer {
  id: string;
  message?: { runs?: MessageRunYT[] };
}

export interface ChatItem {
  liveChatTextMessageRenderer?: LiveChatRenderer;
  liveChatPaidMessageRenderer?: LiveChatPaidRenderer;
  liveChatPaidStickerRenderer?: LiveChatStickerRenderer;
  liveChatMembershipItemRenderer?: LiveChatMembershipRenderer;
  liveChatSponsorshipsGiftPurchaseAnnouncementRenderer?: LiveChatGiftRenderer;
  liveChatViewerEngagementMessageRenderer?: LiveChatEngagementRenderer;
}

// Fields a renderer may carry for its display timestamp
interface TimestampSource {
  timestampUsec?: string;
  timestampText?: { simpleText?: string };
}

export type TimestampTextResolver = (renderer: TimestampSource) => string | undefined;

/**
 * Convert timestampUsec (microseconds since epoch) to a local time string (HH:MM:SS)
 */
export const formatTimestampUsec = (timestampUsec: string | undefined): string | undefined => {
  if (!timestampUsec) return undefined;
  const usec = Number.parseInt(timestampUsec, 10);
  if (Number.isNaN(usec)) return undefined;
  const date = new Date(usec / 1000); // Convert microseconds to milliseconds
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

export class ChatItemParser {
  private readonly idPrefix: string;
  private readonly resolveTimestampText: TimestampTextResolver;
  private messageIndex = 0;

  /**
   * @param idPrefix Prefix for fallback message IDs (used when YouTube omits an ID)
   * @param resolveTimestampText Returns the display timestamp text for a renderer
   */
  constructor(idPrefix: string, resolveTimestampText: TimestampTextResolver) {
    this.idPrefix = idPrefix;
    this.resolveTimestampText = resolveTimestampText;
  }

  /**
   * Reset the fallback ID counter (call when switching videos)
   */
  reset(): void {
    this.messageIndex = 0;
  }

  /**
   * Parse a chat item into a ChatMessage
   * @param timestamp Video offset in seconds (0 for live messages)
   */
  parseItem(item: ChatItem, timestamp: number): ChatMessage | null {
    const index = this.messageIndex++;

    // Regular text message
    if (item.liveChatTextMessageRenderer) {
      const r = item.liveChatTextMessageRenderer;
      const { text, messageRuns } = this.parseMessageRuns(r.message?.runs);

      if (!text && messageRuns.length === 0) return null;

      return {
        id: r.id || `${this.idPrefix}-${index}`,
        type: "text" as MessageType,
        timestamp,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: text,
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
        timestampText: this.resolveTimestampText(r),
      };
    }

    // Super Chat
    if (item.liveChatPaidMessageRenderer) {
      const r = item.liveChatPaidMessageRenderer;
      const { text, messageRuns } = this.parseMessageRuns(r.message?.runs);

      return {
        id: r.id || `${this.idPrefix}-${index}`,
        type: "superchat" as MessageType,
        timestamp,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: text || "(Super Chat)",
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
        timestampText: this.resolveTimestampText(r),
        amount: r.purchaseAmountText?.simpleText,
        colors: this.parseSuperChatColors(r),
      };
    }

    // Super Sticker
    if (item.liveChatPaidStickerRenderer) {
      const r = item.liveChatPaidStickerRenderer;

      return {
        id: r.id || `${this.idPrefix}-${index}`,
        type: "supersticker" as MessageType,
        timestamp,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: "(Super Sticker)",
        timestampText: this.resolveTimestampText(r),
        amount: r.purchaseAmountText?.simpleText,
        stickerUrl: this.getBestThumbnail(r.sticker?.thumbnails),
        colors: {
          bodyBackgroundColor: this.colorToHex(r.backgroundColor),
          authorNameTextColor: this.colorToHex(r.authorNameTextColor),
        },
      };
    }

    // Membership
    if (item.liveChatMembershipItemRenderer) {
      const r = item.liveChatMembershipItemRenderer;
      const { text: headerText } = this.parseMessageRuns(r.headerSubtext?.runs);
      const { text, messageRuns } = this.parseMessageRuns(r.message?.runs);

      return {
        id: r.id || `${this.idPrefix}-${index}`,
        type: "membership" as MessageType,
        timestamp,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: text || headerText || "(New Member)",
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
        timestampText: this.resolveTimestampText(r),
        membershipLevel: headerText || undefined,
      };
    }

    // Gift Membership
    if (item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer) {
      const r = item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer;
      const { text: giftText } = this.parseMessageRuns(r.header?.liveChatSponsorshipsHeaderRenderer?.primaryText?.runs);

      return {
        id: r.id || `${this.idPrefix}-${index}`,
        type: "gift" as MessageType,
        timestamp,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        message: giftText || "(Gift Membership)",
        timestampText: this.resolveTimestampText(r),
      };
    }

    // System/Engagement message
    if (item.liveChatViewerEngagementMessageRenderer) {
      const r = item.liveChatViewerEngagementMessageRenderer;
      const { text, messageRuns } = this.parseMessageRuns(r.message?.runs);

      if (!text) return null;

      return {
        id: r.id || `${this.idPrefix}-${index}`,
        type: "system" as MessageType,
        timestamp,
        author: "YouTube",
        message: text,
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
      };
    }

    return null;
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private parseMessageRuns(runs: MessageRunYT[] | undefined): { text: string; messageRuns: MessageRun[] } {
    if (!runs?.length) {
      return { text: "", messageRuns: [] };
    }

    const messageRuns: MessageRun[] = [];
    let plainText = "";

    for (const run of runs) {
      if (run.text) {
        plainText += run.text;
        messageRuns.push({ type: "text", text: run.text });
      } else if (run.emoji) {
        const emojiId = run.emoji.emojiId || "";
        const shortcut = run.emoji.shortcuts?.[0];
        const imageUrl = run.emoji.image?.thumbnails?.[0]?.url;
        const isCustom = run.emoji.isCustomEmoji;

        plainText += shortcut || emojiId;
        messageRuns.push({
          type: "emoji",
          emoji: { emojiId, shortcut, imageUrl, isCustom },
        });
      }
    }

    return { text: plainText, messageRuns };
  }

  private parseAuthorBadges(badges: AuthorBadgeYT[] | undefined): AuthorBadge[] | undefined {
    if (!badges?.length) return undefined;

    const result: AuthorBadge[] = [];

    for (const badge of badges) {
      const renderer = badge.liveChatAuthorBadgeRenderer;
      const iconType = renderer.icon?.iconType?.toLowerCase();
      const tooltip = renderer.tooltip || "";

      let badgeType: BadgeType | undefined;

      if (iconType === "verified") {
        badgeType = "verified";
      } else if (iconType === "owner") {
        badgeType = "owner";
      } else if (iconType === "moderator") {
        badgeType = "moderator";
      } else if (iconType === "member" || renderer.customThumbnail) {
        badgeType = "member";
      }

      if (badgeType) {
        result.push({
          type: badgeType,
          label: tooltip,
          customIcon: this.getBestThumbnail(renderer.customThumbnail?.thumbnails),
        });
      }
    }

    return result.length > 0 ? result : undefined;
  }

  private getBestThumbnail(thumbnails: Thumbnail[] | undefined): string | undefined {
    if (!thumbnails?.length) return undefined;
    const sorted = [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
    return sorted[0]?.url;
  }

  private colorToHex(colorNum: number | undefined): string | undefined {
    if (colorNum === undefined) return undefined;
    const unsigned = colorNum >>> 0;
    const hex = unsigned.toString(16).padStart(8, "0");
    const a = hex.slice(0, 2);
    const rgb = hex.slice(2);
    return `#${rgb}${a}`;
  }

  private parseSuperChatColors(renderer: {
    headerBackgroundColor?: number;
    headerTextColor?: number;
    bodyBackgroundColor?: number;
    bodyTextColor?: number;
    authorNameTextColor?: number;
  }): SuperChatColors | undefined {
    const colors: SuperChatColors = {
      headerBackgroundColor: this.colorToHex(renderer.headerBackgroundColor),
      headerTextColor: this.colorToHex(renderer.headerTextColor),
      bodyBackgroundColor: this.colorToHex(renderer.bodyBackgroundColor),
      bodyTextColor: this.colorToHex(renderer.bodyTextColor),
      authorNameTextColor: this.colorToHex(renderer.authorNameTextColor),
    };

    const hasColors = Object.values(colors).some((c) => c !== undefined);
    return hasColors ? colors : undefined;
  }
}
