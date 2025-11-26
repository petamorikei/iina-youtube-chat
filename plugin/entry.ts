// IINA Plugin Entry Point for YouTube Chat
// This file runs in IINA's JavaScriptCore context

import { LiveChatFetcher, type LiveChatMetadata } from "./liveChatFetcher";
import {
  type AuthorBadge,
  type BadgeType,
  type ChatMessage,
  ChatMessageSchema,
  LiveChatLineSchema,
  type MessageRun,
  type MessageType,
  type SuperChatColors,
} from "./schemas";

// Destructure IINA API modules
const { event, sidebar, standaloneWindow, menu, core, console: logger, utils, file, preferences } = iina;

// Initialize live chat fetcher (uses utils.exec with curl to avoid blocking main thread)
const liveChatFetcher = new LiveChatFetcher(utils, logger);

// Plugin state
let currentVideoUrl: string | null = null;
let chatData: ChatMessage[] = [];
let isStandaloneWindowOpen = false;
let isStandaloneWindowReady = false;

// Live chat state
let isLiveStream = false;
let liveChatMetadata: LiveChatMetadata | null = null;
let liveChatPollingTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Get current preferences
 */
const getPreferences = () => ({
  maxMessages: (preferences.get("maxMessages") as number | undefined) ?? 200,
  scrollDirection: (preferences.get("scrollDirection") as string | undefined) ?? "bottom-to-top",
  showTimestamp: (preferences.get("showTimestamp") as boolean | undefined) ?? true,
  showAuthorName: (preferences.get("showAuthorName") as boolean | undefined) ?? true,
  showAuthorPhoto: (preferences.get("showAuthorPhoto") as boolean | undefined) ?? true,
  autoOpenChatWindow: (preferences.get("autoOpenChatWindow") as boolean | undefined) ?? true,
});

/**
 * Send message to sidebar
 */
const sendToSidebar = (name: string, data: unknown): void => {
  sidebar.postMessage(name, data);
};

/**
 * Send message to standalone window
 */
const sendToStandaloneWindow = (name: string, data: unknown): void => {
  if (isStandaloneWindowOpen && isStandaloneWindowReady) {
    standaloneWindow.postMessage(name, data);
  }
};

/**
 * Send message to all webviews (sidebar and standalone window)
 */
const sendToAll = (name: string, data: unknown): void => {
  sendToSidebar(name, data);
  sendToStandaloneWindow(name, data);
};

/**
 * Check if the URL is a YouTube video
 */
const isYouTubeUrl = (url: string): boolean => {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
};

/**
 * Extract video ID from YouTube URL
 */
const extractVideoId = (url: string): string | null => {
  const patterns = [/youtube\.com\/watch\?v=([^&]+)/, /youtu\.be\/([^?]+)/, /youtube\.com\/embed\/([^?]+)/];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
};

// ============================================================
// Parser Helper Functions
// ============================================================

interface YTMessageRun {
  text?: string;
  emoji?: {
    emojiId?: string;
    shortcuts?: string[];
    image?: { thumbnails: Array<{ url: string; width?: number; height?: number }> };
    isCustomEmoji?: boolean;
  };
}

interface YTAuthorBadge {
  liveChatAuthorBadgeRenderer: {
    icon?: { iconType: string };
    tooltip?: string;
    customThumbnail?: { thumbnails: Array<{ url: string }> };
  };
}

interface YTThumbnails {
  thumbnails: Array<{ url: string; width?: number; height?: number }>;
}

/**
 * Convert YouTube color number to CSS hex string
 */
const colorToHex = (colorNum: number | undefined): string | undefined => {
  if (colorNum === undefined) return undefined;
  // YouTube colors are ARGB format as signed 32-bit integers
  const unsigned = colorNum >>> 0;
  const hex = unsigned.toString(16).padStart(8, "0");
  // Convert ARGB to RGBA CSS format
  const a = hex.slice(0, 2);
  const rgb = hex.slice(2);
  return `#${rgb}${a}`;
};

/**
 * Get the best thumbnail URL (prefer larger size)
 */
const getBestThumbnail = (thumbnails: YTThumbnails | undefined): string | undefined => {
  if (!thumbnails?.thumbnails?.length) return undefined;
  // Sort by width descending, prefer 64x64
  const sorted = [...thumbnails.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
  return sorted[0]?.url;
};

/**
 * Parse author badges from YouTube format
 */
const parseAuthorBadges = (badges: YTAuthorBadge[] | undefined): AuthorBadge[] | undefined => {
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
        customIcon: getBestThumbnail(renderer.customThumbnail),
      });
    }
  }

  return result.length > 0 ? result : undefined;
};

/**
 * Parse message runs from YouTube format to our format
 */
const parseMessageRuns = (runs: YTMessageRun[] | undefined): { text: string; messageRuns: MessageRun[] } => {
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

      // For plain text, prefer shortcut, then emojiId
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
};

/**
 * Parse Super Chat colors
 */
const parseSuperChatColors = (renderer: {
  headerBackgroundColor?: number;
  headerTextColor?: number;
  bodyBackgroundColor?: number;
  bodyTextColor?: number;
  authorNameTextColor?: number;
}): SuperChatColors | undefined => {
  const colors: SuperChatColors = {
    headerBackgroundColor: colorToHex(renderer.headerBackgroundColor),
    headerTextColor: colorToHex(renderer.headerTextColor),
    bodyBackgroundColor: colorToHex(renderer.bodyBackgroundColor),
    bodyTextColor: colorToHex(renderer.bodyTextColor),
    authorNameTextColor: colorToHex(renderer.authorNameTextColor),
  };

  // Return undefined if no colors are set
  const hasColors = Object.values(colors).some((c) => c !== undefined);
  return hasColors ? colors : undefined;
};

// ============================================================
// Main Parser
// ============================================================

/**
 * Parse chat data from live_chat.json format using Zod schemas
 */
const parseChatData = (fileContent: string): ChatMessage[] => {
  const messages: ChatMessage[] = [];
  const lines = fileContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    try {
      const jsonData = JSON.parse(line);
      const parseResult = LiveChatLineSchema.safeParse(jsonData);

      if (!parseResult.success) {
        // Only log every 100th failure to avoid spam
        if (i % 100 === 0) {
          logger.warn(`[parseChatData] Schema validation failed for line ${i + 1}`);
        }
        continue;
      }

      const entry = parseResult.data;
      const replayAction = entry.replayChatItemAction;

      if (!replayAction?.actions) {
        continue;
      }

      const timestamp = replayAction.videoOffsetTimeMsec
        ? Number(replayAction.videoOffsetTimeMsec) / 1000 // Convert ms to seconds
        : 0;

      for (const action of replayAction.actions) {
        const item = action.addChatItemAction?.item;
        if (!item) continue;

        let chatMessage: ChatMessage | null = null;

        // Handle regular text messages
        if (item.liveChatTextMessageRenderer) {
          const r = item.liveChatTextMessageRenderer;
          const { text, messageRuns } = parseMessageRuns(r.message?.runs);

          if (text || messageRuns.length > 0) {
            chatMessage = {
              id: r.id || `${timestamp}-${messages.length}`,
              type: "text" as MessageType,
              timestamp,
              author: r.authorName?.simpleText || "Unknown",
              authorPhoto: getBestThumbnail(r.authorPhoto),
              authorChannelId: r.authorExternalChannelId,
              authorBadges: parseAuthorBadges(r.authorBadges),
              message: text,
              messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
              timestampText: r.timestampText?.simpleText,
            };
          }
        }

        // Handle Super Chat (paid messages)
        if (item.liveChatPaidMessageRenderer) {
          const r = item.liveChatPaidMessageRenderer;
          const { text, messageRuns } = parseMessageRuns(r.message?.runs);

          chatMessage = {
            id: r.id || `${timestamp}-${messages.length}`,
            type: "superchat" as MessageType,
            timestamp,
            author: r.authorName?.simpleText || "Unknown",
            authorPhoto: getBestThumbnail(r.authorPhoto),
            authorChannelId: r.authorExternalChannelId,
            authorBadges: parseAuthorBadges(r.authorBadges),
            message: text || "(Super Chat)",
            messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
            timestampText: r.timestampText?.simpleText,
            amount: r.purchaseAmountText?.simpleText,
            colors: parseSuperChatColors(r),
          };
        }

        // Handle Super Sticker
        if (item.liveChatPaidStickerRenderer) {
          const r = item.liveChatPaidStickerRenderer;

          chatMessage = {
            id: r.id || `${timestamp}-${messages.length}`,
            type: "supersticker" as MessageType,
            timestamp,
            author: r.authorName?.simpleText || "Unknown",
            authorPhoto: getBestThumbnail(r.authorPhoto),
            authorChannelId: r.authorExternalChannelId,
            authorBadges: parseAuthorBadges(r.authorBadges),
            message: "(Super Sticker)",
            timestampText: r.timestampText?.simpleText,
            amount: r.purchaseAmountText?.simpleText,
            stickerUrl: getBestThumbnail(r.sticker),
            colors: {
              bodyBackgroundColor: colorToHex(r.backgroundColor),
              authorNameTextColor: colorToHex(r.authorNameTextColor),
            },
          };
        }

        // Handle Membership events
        if (item.liveChatMembershipItemRenderer) {
          const r = item.liveChatMembershipItemRenderer;
          const { text: headerText } = parseMessageRuns(r.headerSubtext?.runs);
          const { text, messageRuns } = parseMessageRuns(r.message?.runs);

          chatMessage = {
            id: r.id || `${timestamp}-${messages.length}`,
            type: "membership" as MessageType,
            timestamp,
            author: r.authorName?.simpleText || "Unknown",
            authorPhoto: getBestThumbnail(r.authorPhoto),
            authorChannelId: r.authorExternalChannelId,
            authorBadges: parseAuthorBadges(r.authorBadges),
            message: text || headerText || "(New Member)",
            messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
            timestampText: r.timestampText?.simpleText,
            membershipLevel: headerText || undefined,
          };
        }

        // Handle Gift Membership
        if (item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer) {
          const r = item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer;
          const { text: giftText } = parseMessageRuns(r.header?.liveChatSponsorshipsHeaderRenderer?.primaryText?.runs);

          chatMessage = {
            id: r.id || `${timestamp}-${messages.length}`,
            type: "gift" as MessageType,
            timestamp,
            author: r.authorName?.simpleText || "Unknown",
            authorPhoto: getBestThumbnail(r.authorPhoto),
            authorChannelId: r.authorExternalChannelId,
            message: giftText || "(Gift Membership)",
          };
        }

        // Handle System/Engagement messages
        if (item.liveChatViewerEngagementMessageRenderer) {
          const r = item.liveChatViewerEngagementMessageRenderer;
          const { text, messageRuns } = parseMessageRuns(r.message?.runs);

          if (text) {
            chatMessage = {
              id: r.id || `${timestamp}-${messages.length}`,
              type: "system" as MessageType,
              timestamp,
              author: "YouTube",
              message: text,
              messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
            };
          }
        }

        // Validate and add message
        if (chatMessage) {
          const validationResult = ChatMessageSchema.safeParse(chatMessage);
          if (validationResult.success) {
            messages.push(validationResult.data);
          } else {
            logger.warn(`[parseChatData] Invalid message structure at line ${i + 1}`);
          }
        }
      }
    } catch (error) {
      // Only log every 100th error to avoid spam
      if (i % 100 === 0) {
        logger.warn(`[parseChatData] Failed to parse line ${i + 1}: ${error}`);
      }
    }
  }

  logger.log(`[parseChatData] Parsed ${messages.length} messages`);
  return messages;
};

/**
 * Send preferences to a specific webview
 */
const sendPreferencesTo = (sendFn: (name: string, data: unknown) => void): void => {
  const prefs = getPreferences();
  sendFn("preferences-update", {
    maxMessages: prefs.maxMessages,
    scrollDirection: prefs.scrollDirection,
    showTimestamp: prefs.showTimestamp,
    showAuthorName: prefs.showAuthorName,
    showAuthorPhoto: prefs.showAuthorPhoto,
  });
};

/**
 * Send chat data to a specific webview (sidebar or standalone window)
 */
const sendChatDataTo = (sendFn: (name: string, data: unknown) => void): void => {
  const CHUNK_SIZE = 100;
  const totalChunks = Math.ceil(chatData.length / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, chatData.length);
    const chunk = chatData.slice(start, end);

    sendFn("chat-data-chunk", {
      chunk,
      chunkIndex: i,
      totalChunks,
      start,
      end,
    });
  }

  sendFn("chat-data-complete", { totalMessages: chatData.length });
};

// ============================================================
// Live Chat Functions
// ============================================================

/**
 * Stop live chat polling
 */
const stopLiveChatPolling = (): void => {
  if (liveChatPollingTimer) {
    clearTimeout(liveChatPollingTimer);
    liveChatPollingTimer = null;
  }
  isLiveStream = false;
  liveChatMetadata = null;
};

/**
 * Poll for live chat messages
 */
const pollLiveChat = async (): Promise<void> => {
  if (!liveChatMetadata || !isLiveStream) {
    return;
  }

  const result = await liveChatFetcher.fetchLiveChat(liveChatMetadata);

  if (!result.success) {
    logger.error(`[pollLiveChat] Error: ${result.error}`);
    // Continue polling even on error
    liveChatPollingTimer = setTimeout(pollLiveChat, 5000);
    return;
  }

  // Add new messages to chatData
  if (result.messages.length > 0) {
    const isFirstBatch = chatData.length === 0;
    chatData.push(...result.messages);

    // Log first batch to confirm polling works
    if (isFirstBatch) {
      logger.log(`[pollLiveChat] First batch received: ${result.messages.length} messages`);
    }

    // Send new messages to all webviews
    sendToAll("live-chat-messages", { messages: result.messages });
  }

  // Update continuation token
  if (result.continuation) {
    liveChatMetadata = {
      ...liveChatMetadata,
      continuation: result.continuation,
    };
  }

  // Schedule next poll
  if (isLiveStream && result.continuation) {
    const pollInterval = Math.max(result.timeoutMs, 1000); // Minimum 1 second
    liveChatPollingTimer = setTimeout(pollLiveChat, pollInterval);
  } else {
    stopLiveChatPolling();
  }
};

/**
 * Start fetching live chat
 */
const startLiveChat = async (videoId: string): Promise<boolean> => {
  logger.log(`[startLiveChat] Starting for video: ${videoId}`);

  // Reset state
  liveChatFetcher.resetMessageIndex();
  chatData = [];

  // Fetch metadata
  const metadataResult = await liveChatFetcher.fetchMetadata(videoId);

  if (!metadataResult.success) {
    if (metadataResult.isNotLive) {
      logger.log("[startLiveChat] Not a live stream, falling back to yt-dlp");
      return false; // Not a live stream, fall back to yt-dlp
    }
    logger.error(`[startLiveChat] Failed to fetch metadata: ${metadataResult.error}`);
    sendToAll("chat-error", {
      message: "Failed to fetch live chat metadata",
      error: metadataResult.error,
    });
    return true; // Tried live, but failed
  }

  // Store metadata and mark as live
  liveChatMetadata = metadataResult.metadata;
  isLiveStream = true;

  logger.log("[startLiveChat] Live stream detected, starting polling");
  sendToAll("chat-info", { message: "Live stream detected - fetching live chat..." });

  // Auto-open chat window if enabled
  if (getPreferences().autoOpenChatWindow) {
    openStandaloneWindow();
  }

  // Start polling
  pollLiveChat();

  return true; // Handled as live stream
};

/**
 * Find yt-dlp executable path
 */
const findYtdlpPath = (): string => {
  const commonPaths = [
    "/opt/homebrew/bin/yt-dlp", // macOS Apple Silicon (Homebrew)
    "/usr/local/bin/yt-dlp", // macOS Intel (Homebrew) / Linux
    "/usr/bin/yt-dlp", // Linux system package
  ];

  for (const path of commonPaths) {
    if (utils.fileInPath(path)) {
      return path;
    }
  }
  return "yt-dlp"; // Fallback to PATH lookup
};

/**
 * Check if chat is available for a video using yt-dlp metadata
 * Returns true if chat is available, false otherwise
 */
const checkChatAvailability = async (videoUrl: string): Promise<{ available: boolean; isLive: boolean }> => {
  const ytdlpPath = findYtdlpPath();

  try {
    const result = await utils.exec(ytdlpPath, ["--dump-json", "--no-download", videoUrl]);

    if (result.status !== 0) {
      logger.warn(`[checkChatAvailability] yt-dlp failed: ${result.stderr}`);
      return { available: false, isLive: false };
    }

    const metadata = JSON.parse(result.stdout);
    const isLive = metadata.is_live === true;
    const subtitles = metadata.subtitles || {};
    const hasChatSubtitle = "live_chat" in subtitles;

    logger.log(`[checkChatAvailability] isLive: ${isLive}, hasChatSubtitle: ${hasChatSubtitle}`);

    return { available: hasChatSubtitle || isLive, isLive };
  } catch (error) {
    logger.error(`[checkChatAvailability] Error: ${error}`);
    return { available: false, isLive: false };
  }
};

/**
 * Download archived chat data using yt-dlp (called after window is already open)
 */
const downloadArchivedChatData = async (videoUrl: string): Promise<void> => {
  logger.log(`[downloadArchivedChatData] Downloading for: ${videoUrl}`);

  const ytdlpPath = findYtdlpPath();
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error("Could not extract video ID");
  }

  const tmpDir = "/tmp";
  const outputTemplate = `${tmpDir}/iina-youtube-chat-${videoId}`;
  const chatFilePath = `${outputTemplate}.live_chat.json`;

  // Execute yt-dlp to download live chat
  const result = await utils.exec(
    ytdlpPath,
    [
      "--write-subs",
      "--sub-lang",
      "live_chat",
      "--skip-download",
      "--extractor-args",
      "youtube:player_client=default",
      "-o",
      outputTemplate,
      videoUrl,
    ],
    tmpDir,
  );

  if (result.status !== 0) {
    throw new Error(`yt-dlp failed with status ${result.status}: ${result.stderr}`);
  }

  if (!file.exists(chatFilePath)) {
    throw new Error(`Chat file not found: ${chatFilePath}`);
  }

  const chatFileContent = file.read(chatFilePath);
  if (!chatFileContent) {
    throw new Error("Failed to read chat file");
  }

  chatData = parseChatData(chatFileContent);
  logger.log(`[downloadArchivedChatData] Parsed ${chatData.length} messages`);

  // Send chat data to all webviews
  sendChatDataTo(sendToAll);
};

/**
 * Fetch chat data using yt-dlp (for archived streams)
 */
const fetchArchivedChatData = async (videoUrl: string): Promise<void> => {
  logger.log(`[fetchArchivedChatData] Fetching for: ${videoUrl}`);
  try {
    sendToAll("chat-loading", { loading: true });

    await downloadArchivedChatData(videoUrl);

    sendToAll("chat-loading", { loading: false });
  } catch (error) {
    logger.error(`[fetchArchivedChatData] ERROR: ${error}`);
    sendToAll("chat-error", {
      message: "Failed to fetch chat data",
      error: String(error),
    });
    sendToAll("chat-loading", { loading: false });
  }
};

/**
 * Fetch chat data - uses metadata-first approach for faster window opening
 * 1. Quick metadata check with yt-dlp --dump-json
 * 2. If chat available, open window immediately with loading state
 * 3. Download full chat data in background
 */
const fetchChatData = async (videoUrl: string): Promise<void> => {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    sendToAll("chat-error", { message: "Could not extract video ID" });
    return;
  }

  // Stop any existing live chat polling
  stopLiveChatPolling();

  // First, do a quick metadata check to see if chat is available
  sendToAll("chat-info", { message: "Checking for chat data..." });
  const { available, isLive } = await checkChatAvailability(videoUrl);

  if (!available) {
    sendToAll("chat-info", { message: "No chat data available for this video" });
    return;
  }

  // Chat is available
  if (isLive) {
    // For live streams, use live chat API (startLiveChat will auto-open window)
    const handled = await startLiveChat(videoId);
    if (handled) {
      sendToAll("chat-loading", { loading: false });
      return;
    }
    // If live chat API failed, fall through to archived approach
  }

  // For archived streams: open window immediately, then download in background
  logger.log("[fetchChatData] Archived chat detected, opening window immediately");

  // Auto-open chat window if enabled (before download starts)
  if (getPreferences().autoOpenChatWindow) {
    openStandaloneWindow();
  }

  // Now download chat data in background
  await fetchArchivedChatData(videoUrl);
};

/**
 * Handle file loaded event
 */
const onFileLoaded = (): void => {
  // Stop any existing live chat polling when file changes
  stopLiveChatPolling();

  const url = core.status.url;

  if (!url) {
    return;
  }

  if (!isYouTubeUrl(url)) {
    sendToAll("chat-info", {
      message: "This is not a YouTube video",
    });
    return;
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    sendToAll("chat-error", {
      message: "Could not extract YouTube video ID",
    });
    return;
  }

  logger.log(`[onFileLoaded] YouTube video detected: ${videoId}`);
  currentVideoUrl = url;

  // Fetch chat data
  fetchChatData(url);
};

/**
 * Handle playback position changes
 */
const onPositionChanged = (): void => {
  const position = core.status.position;
  if (!currentVideoUrl || chatData.length === 0 || position === null) {
    return;
  }

  // Send current position to all webviews for timestamp-based filtering
  sendToAll("position-update", { position });
};

/**
 * Handle retry-fetch message from sidebar
 */
const onRetryFetch = (_data: unknown): void => {
  if (currentVideoUrl) {
    fetchChatData(currentVideoUrl);
  }
};

/**
 * Handle sidebar-ready message from sidebar
 * Send current state when sidebar is ready
 */
const onSidebarReady = (_data: unknown): void => {
  logger.log("[onSidebarReady] Sidebar ready");
  // Send current preferences to sidebar only
  sendPreferencesTo(sendToSidebar);

  if (!currentVideoUrl) {
    // No video loaded yet - clear loading state and show info message
    sendToSidebar("chat-info", { message: "Open a YouTube video to see chat" });
    return;
  }

  if (chatData.length > 0) {
    sendChatDataTo(sendToSidebar);
  } else if (isLiveStream) {
    // Live stream is active but no messages yet - show loading
    sendToSidebar("chat-loading", { loading: true });
  } else {
    // No chat data yet, fetch it
    fetchChatData(currentVideoUrl);
  }
};

/**
 * Handle standalone-window-ready message from standalone window
 * Send current state when standalone window is ready
 */
const onStandaloneWindowReady = (_data: unknown): void => {
  isStandaloneWindowReady = true;

  // Send current preferences to standalone window only
  sendPreferencesTo((name, data) => standaloneWindow.postMessage(name, data));

  if (!currentVideoUrl) {
    // No video loaded yet - clear loading state and show info message
    standaloneWindow.postMessage("chat-info", { message: "Open a YouTube video to see chat" });
    return;
  }

  if (chatData.length > 0) {
    sendChatDataTo((name, data) => standaloneWindow.postMessage(name, data));
  } else {
    // Video is loading but chat data not yet available - show loading state
    standaloneWindow.postMessage("chat-loading", { loading: true });
  }
  // Note: Don't fetch chat data again; sidebar already handles this
};

/**
 * Open standalone chat window (if not already open)
 */
const openStandaloneWindow = (): void => {
  if (isStandaloneWindowOpen) {
    return; // Already open
  }

  // Load the HTML file first
  standaloneWindow.loadFile("sidebar/index.html");

  // Register message handlers AFTER loadFile
  // This ensures handlers are active for the newly loaded webview
  standaloneWindow.onMessage("retry-fetch", onRetryFetch);
  standaloneWindow.onMessage("sidebar-ready", onStandaloneWindowReady);

  standaloneWindow.setProperty({
    title: "YouTube Chat",
    resizable: true,
    hudWindow: true,
    fullSizeContentView: true,
    hideTitleBar: false,
  });
  standaloneWindow.setFrame(400, 600, null, null);
  standaloneWindow.open();
  isStandaloneWindowOpen = true;
};

/**
 * Toggle standalone chat window
 */
const toggleStandaloneWindow = (): void => {
  if (isStandaloneWindowOpen) {
    standaloneWindow.close();
    isStandaloneWindowOpen = false;
    isStandaloneWindowReady = false;
  } else {
    openStandaloneWindow();
  }
};

// Register event listeners
event.on("iina.window-loaded", () => {
  logger.log("[event] iina.window-loaded");
  // Initialize sidebar
  sidebar.loadFile("sidebar/index.html");
  sidebar.onMessage("retry-fetch", onRetryFetch);
  sidebar.onMessage("sidebar-ready", onSidebarReady);

  // Add menu item to toggle standalone chat window
  const chatWindowMenuItem = menu.item("Open Chat Window", toggleStandaloneWindow);
  menu.addItem(chatWindowMenuItem);
});

event.on("iina.file-loaded", (_url: string) => {
  onFileLoaded();
});

event.on("iina.window-will-close", () => {
  // Close standalone chat window when player window closes
  if (isStandaloneWindowOpen) {
    standaloneWindow.close();
    isStandaloneWindowOpen = false;
    isStandaloneWindowReady = false;
  }
  // Stop live chat polling
  stopLiveChatPolling();
});

event.on("mpv.time-pos.changed", onPositionChanged);
