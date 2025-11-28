// IINA Plugin Entry Point for YouTube Chat
// This file runs in IINA's JavaScriptCore context

import { ArchivedChatFetcher } from "./archivedChatFetcher";
import { LiveChatFetcher, type LiveChatMetadata } from "./liveChatFetcher";
import type { ChatMessage } from "./schemas";

// Destructure IINA API modules
const { event, sidebar, standaloneWindow, menu, core, console: logger, utils, preferences, http } = iina;

// Initialize chat fetchers
const liveChatFetcher = new LiveChatFetcher(utils, logger);
const archivedChatFetcher = new ArchivedChatFetcher(utils, http, logger);

// Plugin state
let currentVideoUrl: string | null = null;
let chatData: ChatMessage[] = [];
let chatDataVideoId: string | null = null; // Track which video the chatData belongs to
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
  fontScale: (preferences.get("fontScale") as number | undefined) ?? 100,
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
    fontScale: prefs.fontScale,
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
  chatDataVideoId = videoId;

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
      return { available: false, isLive: false };
    }

    const metadata = JSON.parse(result.stdout);
    const isLive = metadata.is_live === true;
    const subtitles = metadata.subtitles || {};
    const hasChatSubtitle = "live_chat" in subtitles;

    return { available: hasChatSubtitle || isLive, isLive };
  } catch {
    return { available: false, isLive: false };
  }
};

/**
 * Fetch archived chat data using direct YouTube API (no yt-dlp dependency)
 * Reports progress during fetch
 */
const fetchArchivedChatData = async (videoId: string): Promise<void> => {
  try {
    sendToAll("chat-loading", { loading: true });

    const result = await archivedChatFetcher.fetchAllMessages(videoId, (progress) => {
      // Send progress updates to webviews
      sendToAll("chat-progress", {
        fetchedMessages: progress.fetchedMessages,
        currentOffsetMs: progress.currentOffsetMs,
        status: progress.status,
        message: progress.message,
      });
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    chatData = result.messages;
    chatDataVideoId = videoId;

    // Send chat data to all webviews
    sendChatDataTo(sendToAll);
    sendToAll("chat-loading", { loading: false });
  } catch (error) {
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
  // Auto-open chat window if enabled (before download starts)
  if (getPreferences().autoOpenChatWindow) {
    openStandaloneWindow();
  }

  // Now fetch chat data in background (using videoId for direct API access)
  await fetchArchivedChatData(videoId);
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

  const currentVideoId = extractVideoId(currentVideoUrl);

  // Only send chatData if it belongs to the current video
  if (chatData.length > 0 && chatDataVideoId === currentVideoId) {
    sendChatDataTo(sendToSidebar);
  } else if (isLiveStream && chatDataVideoId === currentVideoId) {
    // Live stream is active but no messages yet - show loading
    sendToSidebar("chat-loading", { loading: true });
  } else {
    // No chat data for current video yet, fetch it
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

  const currentVideoId = extractVideoId(currentVideoUrl);

  // Only send chatData if it belongs to the current video
  if (chatData.length > 0 && chatDataVideoId === currentVideoId) {
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
  standaloneWindow.loadFile("dist/sidebar/index.html");

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
  sidebar.loadFile("dist/sidebar/index.html");
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
