/**
 * Live Chat Fetcher - Fetches live stream chat directly from YouTube's internal API
 * This module is for live streams only. Archived streams should use yt-dlp.
 */

import type { AuthorBadge, BadgeType, ChatMessage, MessageRun, MessageType, SuperChatColors } from "./schemas";

// Types for IINA API
interface IINAConsole {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface IINAUtils {
  exec(path: string, args: string[], cwd?: string): Promise<ExecResult>;
}

// YouTube API types
interface YouTubeContext {
  client: {
    hl: string;
    gl: string;
    clientName: string;
    clientVersion: string;
  };
}

export interface LiveChatMetadata {
  apiKey: string;
  continuation: string;
  context: YouTubeContext;
  isLive: boolean;
}

interface ChatAction {
  addChatItemAction?: {
    item: ChatItem;
  };
}

interface ChatItem {
  liveChatTextMessageRenderer?: LiveChatTextMessageRenderer;
  liveChatPaidMessageRenderer?: LiveChatPaidMessageRenderer;
  liveChatPaidStickerRenderer?: LiveChatPaidStickerRenderer;
  liveChatMembershipItemRenderer?: LiveChatMembershipItemRenderer;
  liveChatSponsorshipsGiftPurchaseAnnouncementRenderer?: LiveChatGiftRenderer;
  liveChatViewerEngagementMessageRenderer?: LiveChatEngagementRenderer;
}

interface LiveChatTextMessageRenderer {
  id: string;
  message?: { runs?: MessageRunYT[] };
  authorName?: { simpleText?: string };
  authorPhoto?: { thumbnails?: Thumbnail[] };
  authorExternalChannelId?: string;
  authorBadges?: AuthorBadgeYT[];
  timestampUsec?: string;
}

interface LiveChatPaidMessageRenderer extends LiveChatTextMessageRenderer {
  purchaseAmountText?: { simpleText?: string };
  headerBackgroundColor?: number;
  headerTextColor?: number;
  bodyBackgroundColor?: number;
  bodyTextColor?: number;
  authorNameTextColor?: number;
}

interface LiveChatPaidStickerRenderer {
  id: string;
  authorName?: { simpleText?: string };
  authorPhoto?: { thumbnails?: Thumbnail[] };
  authorExternalChannelId?: string;
  authorBadges?: AuthorBadgeYT[];
  timestampUsec?: string;
  purchaseAmountText?: { simpleText?: string };
  sticker?: { thumbnails?: Thumbnail[] };
  backgroundColor?: number;
  authorNameTextColor?: number;
}

interface LiveChatMembershipItemRenderer {
  id: string;
  authorName?: { simpleText?: string };
  authorPhoto?: { thumbnails?: Thumbnail[] };
  authorExternalChannelId?: string;
  authorBadges?: AuthorBadgeYT[];
  timestampUsec?: string;
  headerSubtext?: { runs?: MessageRunYT[] };
  message?: { runs?: MessageRunYT[] };
}

interface LiveChatGiftRenderer {
  id: string;
  authorName?: { simpleText?: string };
  authorPhoto?: { thumbnails?: Thumbnail[] };
  authorExternalChannelId?: string;
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

interface MessageRunYT {
  text?: string;
  emoji?: {
    emojiId?: string;
    shortcuts?: string[];
    image?: { thumbnails?: Thumbnail[] };
    isCustomEmoji?: boolean;
  };
}

interface Thumbnail {
  url: string;
  width?: number;
  height?: number;
}

interface AuthorBadgeYT {
  liveChatAuthorBadgeRenderer: {
    icon?: { iconType?: string };
    tooltip?: string;
    customThumbnail?: { thumbnails?: Thumbnail[] };
  };
}

interface LiveChatContinuation {
  timedContinuationData?: {
    continuation: string;
    timeoutMs: number;
  };
  invalidationContinuationData?: {
    continuation: string;
    timeoutMs: number;
  };
  reloadContinuationData?: {
    continuation: string;
    clickTrackingParams?: string;
  };
}

export type LiveChatResult =
  | { success: true; messages: ChatMessage[]; continuation: string | null; timeoutMs: number }
  | { success: false; error: string };

export type MetadataResult =
  | { success: true; metadata: LiveChatMetadata }
  | { success: false; error: string; isNotLive?: boolean };

/**
 * Live Chat Fetcher class
 * Uses curl via utils.exec instead of iina.http to avoid blocking the main thread
 */
export class LiveChatFetcher {
  private utils: IINAUtils;
  private logger: IINAConsole;
  private messageIndex = 0;

  constructor(utils: IINAUtils, logger: IINAConsole) {
    this.utils = utils;
    this.logger = logger;
  }

  /**
   * Execute curl command and return the response body
   */
  private async curlGet(url: string): Promise<{ success: boolean; body: string; error?: string }> {
    try {
      const result = await this.utils.exec("/usr/bin/curl", [
        "-s", // Silent mode
        "-L", // Follow redirects
        "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "-H", "Accept-Language: en-US,en;q=0.9",
        url,
      ]);

      if (result.status !== 0) {
        return { success: false, body: "", error: `curl failed with status ${result.status}: ${result.stderr}` };
      }

      return { success: true, body: result.stdout };
    } catch (error) {
      return { success: false, body: "", error: `curl error: ${error}` };
    }
  }

  /**
   * Execute curl POST command and return the response body
   */
  private async curlPost(url: string, data: Record<string, unknown>): Promise<{ success: boolean; body: string; error?: string }> {
    try {
      const result = await this.utils.exec("/usr/bin/curl", [
        "-s", // Silent mode
        "-X", "POST",
        "-H", "Content-Type: application/json",
        "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "-d", JSON.stringify(data),
        url,
      ]);

      if (result.status !== 0) {
        return { success: false, body: "", error: `curl failed with status ${result.status}: ${result.stderr}` };
      }

      return { success: true, body: result.stdout };
    } catch (error) {
      return { success: false, body: "", error: `curl error: ${error}` };
    }
  }

  /**
   * Fetch metadata from YouTube video page to get API key, context, and continuation token
   * Uses yt-dlp for live detection and simple pattern matching for tokens
   */
  async fetchMetadata(videoId: string): Promise<MetadataResult> {
    this.logger.log(`[LiveChatFetcher] fetchMetadata for video: ${videoId}`);

    try {
      // Step 1: Use yt-dlp to check if video is live (more reliable than parsing HTML)
      const ytdlpResult = await this.utils.exec("/opt/homebrew/bin/yt-dlp", [
        "--dump-json",
        "--no-download",
        `https://www.youtube.com/watch?v=${videoId}`,
      ]);

      if (ytdlpResult.status !== 0) {
        return { success: false, error: `yt-dlp failed: ${ytdlpResult.stderr}` };
      }

      let videoInfo: Record<string, unknown>;
      try {
        videoInfo = JSON.parse(ytdlpResult.stdout);
      } catch {
        return { success: false, error: "Failed to parse yt-dlp output" };
      }

      const isLive = videoInfo.is_live === true;
      this.logger.log(`[LiveChatFetcher] yt-dlp is_live: ${isLive}`);

      if (!isLive) {
        return { success: false, error: "Video is not a live stream", isNotLive: true };
      }

      // Step 2: Fetch HTML to get API key and continuation token
      const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const response = await this.curlGet(pageUrl);

      if (!response.success) {
        return { success: false, error: response.error || "Failed to fetch video page" };
      }

      const html = response.body;
      this.logger.log(`[LiveChatFetcher] HTML fetched, length: ${html.length}`);

      // Extract API key
      const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      if (!apiKeyMatch) {
        return { success: false, error: "Could not find API key in page" };
      }
      const apiKey = apiKeyMatch[1];
      this.logger.log(`[LiveChatFetcher] API key found`);

      // Extract continuation token directly from HTML (avoid full JSON parsing)
      // Look for the longest continuation token (likely the live chat one)
      const continuationMatches = html.match(/"continuation":"([^"]+)"/g);
      if (!continuationMatches || continuationMatches.length === 0) {
        return { success: false, error: "Could not find continuation token" };
      }

      // Find the longest continuation token (live chat tokens are typically longer)
      let continuation = "";
      for (const match of continuationMatches) {
        const token = match.replace(/"continuation":"/, "").replace(/"$/, "");
        if (token.length > continuation.length) {
          continuation = token;
        }
      }
      this.logger.log(`[LiveChatFetcher] Continuation token found, length: ${continuation.length}`);

      // Extract client context
      const clientVersionMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);
      const hlMatch = html.match(/"HL":"([^"]+)"/);
      const glMatch = html.match(/"GL":"([^"]+)"/);

      const context: YouTubeContext = {
        client: {
          hl: hlMatch?.[1] || "en",
          gl: glMatch?.[1] || "US",
          clientName: "WEB",
          clientVersion: clientVersionMatch?.[1] || "2.20231219.04.00",
        },
      };

      this.logger.log(`[LiveChatFetcher] Metadata fetched successfully`);

      return {
        success: true,
        metadata: {
          apiKey,
          continuation,
          context,
          isLive,
        },
      };
    } catch (error) {
      return { success: false, error: `Failed to fetch metadata: ${error}` };
    }
  }

  /**
   * Fetch live chat messages using continuation token
   */
  async fetchLiveChat(metadata: LiveChatMetadata): Promise<LiveChatResult> {
    const apiUrl = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${metadata.apiKey}`;

    try {
      const response = await this.curlPost(apiUrl, {
        context: metadata.context,
        continuation: metadata.continuation,
      });

      if (!response.success) {
        return { success: false, error: response.error || "API request failed" };
      }

      let data: Record<string, unknown>;
      try {
        if (!response.body) {
          return { success: false, error: "Empty response from API" };
        }
        data = JSON.parse(response.body);
      } catch (parseError) {
        this.logger.error(`[LiveChatFetcher] Parse error: ${parseError}`);
        return { success: false, error: "Failed to parse API response" };
      }

      // Extract messages
      const messages = this.parseActions(data);

      // Extract next continuation
      const continuationData = this.extractContinuationFromResponse(data);
      const nextContinuation = continuationData?.continuation || null;
      const timeoutMs = continuationData?.timeoutMs || 5000;

      return {
        success: true,
        messages,
        continuation: nextContinuation,
        timeoutMs,
      };
    } catch (error) {
      return { success: false, error: `Failed to fetch live chat: ${error}` };
    }
  }

  /**
   * Reset message index (call when switching videos)
   */
  resetMessageIndex(): void {
    this.messageIndex = 0;
  }

  // ============================================================
  // Private Helper Methods
  // ============================================================

  private extractContinuationFromResponse(
    data: Record<string, unknown>,
  ): { continuation: string; timeoutMs: number } | null {
    const liveChatContinuation = data.continuationContents as Record<string, unknown> | undefined;
    const liveChatRenderer = liveChatContinuation?.liveChatContinuation as Record<string, unknown> | undefined;
    const continuations = liveChatRenderer?.continuations as LiveChatContinuation[] | undefined;

    if (continuations && continuations.length > 0) {
      const cont = continuations[0];
      const timedCont = cont.timedContinuationData || cont.invalidationContinuationData;
      if (timedCont) {
        return {
          continuation: timedCont.continuation,
          timeoutMs: timedCont.timeoutMs || 5000,
        };
      }
      // Handle reloadContinuationData (no timeoutMs, use default polling interval)
      if (cont.reloadContinuationData) {
        return {
          continuation: cont.reloadContinuationData.continuation,
          timeoutMs: 5000, // Default polling interval for reload continuation
        };
      }
    }

    return null;
  }

  private parseActions(data: Record<string, unknown>): ChatMessage[] {
    const messages: ChatMessage[] = [];

    const liveChatContinuation = data.continuationContents as Record<string, unknown> | undefined;
    const liveChatRenderer = liveChatContinuation?.liveChatContinuation as Record<string, unknown> | undefined;
    const actions = liveChatRenderer?.actions as ChatAction[] | undefined;

    if (!actions) return messages;

    for (const action of actions) {
      const item = action.addChatItemAction?.item;
      if (!item) continue;

      const msg = this.parseItem(item);
      if (msg) {
        messages.push(msg);
      }
    }

    return messages;
  }

  private parseItem(item: ChatItem): ChatMessage | null {
    const index = this.messageIndex++;

    // Regular text message
    if (item.liveChatTextMessageRenderer) {
      const r = item.liveChatTextMessageRenderer;
      const { text, messageRuns } = this.parseMessageRuns(r.message?.runs);

      if (!text && messageRuns.length === 0) return null;

      return {
        id: r.id || `live-${index}`,
        type: "text" as MessageType,
        timestamp: 0, // Live messages don't have video-relative timestamps
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: text,
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
      };
    }

    // Super Chat
    if (item.liveChatPaidMessageRenderer) {
      const r = item.liveChatPaidMessageRenderer;
      const { text, messageRuns } = this.parseMessageRuns(r.message?.runs);

      return {
        id: r.id || `live-${index}`,
        type: "superchat" as MessageType,
        timestamp: 0,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: text || "(Super Chat)",
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
        amount: r.purchaseAmountText?.simpleText,
        colors: this.parseSuperChatColors(r),
      };
    }

    // Super Sticker
    if (item.liveChatPaidStickerRenderer) {
      const r = item.liveChatPaidStickerRenderer;

      return {
        id: r.id || `live-${index}`,
        type: "supersticker" as MessageType,
        timestamp: 0,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: "(Super Sticker)",
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
        id: r.id || `live-${index}`,
        type: "membership" as MessageType,
        timestamp: 0,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: text || headerText || "(New Member)",
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
        membershipLevel: headerText || undefined,
      };
    }

    // Gift Membership
    if (item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer) {
      const r = item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer;
      const { text: giftText } = this.parseMessageRuns(r.header?.liveChatSponsorshipsHeaderRenderer?.primaryText?.runs);

      return {
        id: r.id || `live-${index}`,
        type: "gift" as MessageType,
        timestamp: 0,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        message: giftText || "(Gift Membership)",
      };
    }

    // System/Engagement message
    if (item.liveChatViewerEngagementMessageRenderer) {
      const r = item.liveChatViewerEngagementMessageRenderer;
      const { text, messageRuns } = this.parseMessageRuns(r.message?.runs);

      if (!text) return null;

      return {
        id: r.id || `live-${index}`,
        type: "system" as MessageType,
        timestamp: 0,
        author: "YouTube",
        message: text,
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
      };
    }

    return null;
  }

  private parseMessageRuns(runs: MessageRunYT[] | undefined): { text: string; messageRuns: MessageRun[] } {
    if (!runs?.length) {
      return { text: "", messageRuns: [] };
    }

    const messageRuns: MessageRun[] = [];
    let plainText = "";

    for (const run of runs) {
      if (run.text) {
        plainText += run.text;
        messageRuns.push({
          type: "text",
          text: run.text,
        });
      } else if (run.emoji) {
        const emojiId = run.emoji.emojiId || "";
        const shortcut = run.emoji.shortcuts?.[0];
        const imageUrl = run.emoji.image?.thumbnails?.[0]?.url;
        const isCustom = run.emoji.isCustomEmoji;

        plainText += shortcut || emojiId;

        messageRuns.push({
          type: "emoji",
          emoji: {
            emojiId,
            shortcut,
            imageUrl,
            isCustom,
          },
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
