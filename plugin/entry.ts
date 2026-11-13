// IINA Plugin Entry Point for YouTube Chat
// This file runs in IINA's JavaScriptCore context

import type { ChatMessage } from "../src/schemas";
import { ArchivedChatFetcher } from "./archivedChatFetcher";
import { LiveChatFetcher, type LiveChatMetadata } from "./liveChatFetcher";
import { buildWatchUrl, extractVideoId, isYouTubeUrl } from "./youtubeUrl";

// Destructure IINA API modules
const { event, sidebar, standaloneWindow, menu, core, console: logger, utils, preferences, http } = iina;

// Initialize chat fetchers
const liveChatFetcher = new LiveChatFetcher(utils, logger);
const archivedChatFetcher = new ArchivedChatFetcher(http, logger);

// Minimum interval between position updates sent to webviews
const POSITION_UPDATE_INTERVAL_MS = 200;

type SendFn = (name: string, data: unknown) => void;

// Plugin state
let currentVideoId: string | null = null;
let chatData: ChatMessage[] = [];
let isStandaloneWindowOpen = false;
let isStandaloneWindowReady = false;

// Last informational/error status, replayed to webviews that become ready later
let lastStatus: { name: "chat-info" | "chat-error"; data: unknown } | null = null;

// Warning shown alongside loaded chat (e.g. partially fetched archive), replayed to webviews that open later
let lastWarning: { message: string; error: string } | null = null;

// Incremented whenever the current chat session is invalidated (new file, retry).
// Async work captures the value when it starts and drops its results once it no longer matches.
let fetchGeneration = 0;

// Position update throttling state
let lastPositionSentAt = 0;
let positionUpdateTimer: ReturnType<typeof setTimeout> | null = null;

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
const sendToSidebar: SendFn = (name, data) => {
  sidebar.postMessage(name, data);
};

/**
 * Send message to standalone window
 */
const sendToStandaloneWindow: SendFn = (name, data) => {
  if (isStandaloneWindowOpen && isStandaloneWindowReady) {
    standaloneWindow.postMessage(name, data);
  }
};

/**
 * Send message to all webviews (sidebar and standalone window)
 */
const sendToAll: SendFn = (name, data) => {
  sendToSidebar(name, data);
  sendToStandaloneWindow(name, data);
};

/**
 * Send an informational message to all webviews and remember it for webviews that open later
 */
const sendInfo = (message: string): void => {
  const data = { message };
  lastStatus = { name: "chat-info", data };
  sendToAll("chat-info", data);
};

/**
 * Send an error message to all webviews and remember it for webviews that open later
 */
const sendError = (message: string, error?: string): void => {
  const data = error ? { message, error } : { message };
  lastStatus = { name: "chat-error", data };
  sendToAll("chat-error", data);
};

/**
 * Check whether async work started in the given generation is still current
 */
const isCurrent = (generation: number): boolean => generation === fetchGeneration;

/**
 * Send preferences to a specific webview
 */
const sendPreferencesTo = (sendFn: SendFn): void => {
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
 * Send the current playback position to a specific webview
 */
const sendPositionTo = (sendFn: SendFn): void => {
  const position = core.status.position;
  if (typeof position === "number") {
    sendFn("position-update", { position });
  }
};

/**
 * Send chat data to a specific webview (sidebar or standalone window)
 */
const sendChatDataTo = (sendFn: SendFn): void => {
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

  // Send the current position so the webview filters messages immediately (even while paused)
  sendPositionTo(sendFn);
};

/**
 * Send the current state to a webview that just became ready
 */
const sendCurrentStateTo = (sendFn: SendFn): void => {
  sendPreferencesTo(sendFn);

  if (!currentVideoId) {
    if (lastStatus) {
      sendFn(lastStatus.name, lastStatus.data);
    } else {
      sendFn("chat-info", { message: "Open a YouTube video to see chat" });
    }
    return;
  }

  if (chatData.length > 0) {
    sendChatDataTo(sendFn);
    sendFn("chat-loading", { loading: false });
    if (lastWarning) {
      sendFn("chat-warning", lastWarning);
    }
  } else if (lastStatus) {
    sendFn(lastStatus.name, lastStatus.data);
  } else {
    // Fetch is in progress
    sendFn("chat-loading", { loading: true });
  }
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
 * Invalidate the current chat session and clear chat state in plugin and webviews
 * Returns the new generation number
 */
const resetChatState = (): number => {
  fetchGeneration++;
  stopLiveChatPolling();
  chatData = [];
  lastStatus = null;
  lastWarning = null;

  if (positionUpdateTimer) {
    clearTimeout(positionUpdateTimer);
    positionUpdateTimer = null;
  }
  lastPositionSentAt = 0;

  sendToAll("chat-reset", {});
  return fetchGeneration;
};

/**
 * Poll for live chat messages
 */
const pollLiveChat = async (generation: number): Promise<void> => {
  if (!isCurrent(generation) || !liveChatMetadata || !isLiveStream) {
    return;
  }

  const result = await liveChatFetcher.fetchLiveChat(liveChatMetadata);

  // The video may have changed while the request was in flight
  if (!isCurrent(generation) || !liveChatMetadata || !isLiveStream) {
    return;
  }

  if (!result.success) {
    logger.error(`[pollLiveChat] Error: ${result.error}`);
    // Continue polling even on error
    liveChatPollingTimer = setTimeout(() => pollLiveChat(generation), 5000);
    return;
  }

  // Add new messages to chatData
  if (result.messages.length > 0) {
    chatData.push(...result.messages);

    // Live messages older than maxMessages are never displayed, so don't keep them (0 = keep all)
    const { maxMessages } = getPreferences();
    if (maxMessages > 0 && chatData.length > maxMessages) {
      chatData = chatData.slice(-maxMessages);
    }

    // Send new messages to all webviews
    sendToAll("live-chat-messages", { messages: result.messages });
  }

  // Schedule next poll
  if (result.continuation) {
    liveChatMetadata = {
      ...liveChatMetadata,
      continuation: result.continuation,
    };
    const pollInterval = Math.max(result.timeoutMs, 1000); // Minimum 1 second
    liveChatPollingTimer = setTimeout(() => pollLiveChat(generation), pollInterval);
  } else {
    stopLiveChatPolling();
  }
};

/**
 * Start fetching live chat
 */
const startLiveChat = async (videoId: string, generation: number): Promise<void> => {
  liveChatFetcher.resetMessageIndex();

  const metadataResult = await liveChatFetcher.fetchMetadata(videoId);
  if (!isCurrent(generation)) {
    return;
  }

  if (!metadataResult.success) {
    logger.error(`[startLiveChat] Failed to fetch metadata: ${metadataResult.error}`);
    sendError("Failed to fetch live chat metadata", metadataResult.error);
    return;
  }

  // Store metadata and mark as live
  liveChatMetadata = metadataResult.metadata;
  isLiveStream = true;

  sendInfo("Live stream detected - fetching live chat...");

  // Auto-open chat window if enabled
  if (getPreferences().autoOpenChatWindow) {
    openStandaloneWindow();
  }

  // Start polling
  pollLiveChat(generation);
};

// ============================================================
// Chat Availability (yt-dlp)
// ============================================================

/**
 * Find yt-dlp executable path
 * Returns null if yt-dlp cannot be found
 */
const findYtdlpPath = (): string | null => {
  const commonPaths = [
    "/opt/homebrew/bin/yt-dlp", // macOS Apple Silicon (Homebrew)
    "/usr/local/bin/yt-dlp", // macOS Intel (Homebrew)
    "/usr/bin/yt-dlp", // System package
  ];

  for (const path of commonPaths) {
    if (utils.fileInPath(path)) {
      return path;
    }
  }

  // Fallback to PATH lookup
  return utils.fileInPath("yt-dlp") ? "yt-dlp" : null;
};

type ChatAvailability =
  | { kind: "available"; isLive: boolean }
  | { kind: "unavailable" }
  | { kind: "error"; message: string; error: string };

/**
 * Check if chat is available for a video using yt-dlp metadata
 */
const checkChatAvailability = async (ytdlpPath: string, videoId: string): Promise<ChatAvailability> => {
  let result: Awaited<ReturnType<typeof utils.exec>>;
  try {
    // Use the canonical watch URL so playlist parameters don't make yt-dlp dump a whole playlist
    result = await utils.exec(ytdlpPath, ["--dump-json", "--no-download", buildWatchUrl(videoId)]);
  } catch (error) {
    logger.error(`[checkChatAvailability] Failed to run yt-dlp: ${error}`);
    return { kind: "error", message: "Failed to run yt-dlp", error: String(error) };
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    logger.error(`[checkChatAvailability] yt-dlp exited with status ${result.status}: ${stderr}`);
    const lastLine = stderr.split("\n").pop() || `yt-dlp exited with status ${result.status}`;
    return { kind: "error", message: "Failed to fetch video information", error: lastLine };
  }

  let metadata: { is_live?: unknown; subtitles?: Record<string, unknown> | null };
  try {
    metadata = JSON.parse(result.stdout);
  } catch (error) {
    logger.error(`[checkChatAvailability] Failed to parse yt-dlp output: ${error}`);
    return { kind: "error", message: "Failed to parse video information", error: String(error) };
  }

  const isLive = metadata.is_live === true;
  const hasChatSubtitle = "live_chat" in (metadata.subtitles || {});

  return hasChatSubtitle || isLive ? { kind: "available", isLive } : { kind: "unavailable" };
};

// ============================================================
// Archived Chat
// ============================================================

/**
 * Fetch archived chat data using direct YouTube API
 * Reports progress during fetch
 */
const fetchArchivedChatData = async (videoId: string, generation: number): Promise<void> => {
  // Webviews that become ready during the download should show the loading state, not a stale status
  lastStatus = null;
  sendToAll("chat-loading", { loading: true });

  try {
    const result = await archivedChatFetcher.fetchAllMessages(
      videoId,
      (progress) => {
        if (!isCurrent(generation)) {
          return;
        }
        sendToAll("chat-progress", {
          fetchedMessages: progress.fetchedMessages,
          currentOffsetMs: progress.currentOffsetMs,
          status: progress.status,
          message: progress.message,
        });
      },
      () => !isCurrent(generation),
    );

    if (!isCurrent(generation)) {
      return;
    }

    if (!result.success) {
      logger.error(`[fetchArchivedChatData] ${result.error}`);
      sendError("Failed to fetch chat data", result.error);
      return;
    }

    if (result.messages.length === 0) {
      if (result.incomplete) {
        // Nothing was fetched, but only because some segments failed: let the user retry
        sendError("Failed to fetch chat data", result.incomplete.error);
      } else {
        sendInfo("No chat data available for this video");
      }
      return;
    }

    chatData = result.messages;

    // Send chat data to all webviews
    sendChatDataTo(sendToAll);
    sendToAll("chat-loading", { loading: false });

    if (result.incomplete) {
      lastWarning = {
        message: "Some chat messages could not be fetched",
        error: `${result.incomplete.failedSegments} of the time segments stopped early: ${result.incomplete.error}`,
      };
      sendToAll("chat-warning", lastWarning);
    }
  } catch (error) {
    if (!isCurrent(generation)) {
      return;
    }
    logger.error(`[fetchArchivedChatData] Unexpected error: ${error}`);
    sendError("Unexpected error occurred", String(error));
  }
};

/**
 * Fetch chat data - uses metadata-first approach for faster window opening
 * 1. Quick metadata check with yt-dlp --dump-json
 * 2. If chat available, open window immediately with loading state
 * 3. Download full chat data in background
 */
const fetchChatData = async (videoId: string): Promise<void> => {
  const generation = resetChatState();

  const ytdlpPath = findYtdlpPath();
  if (!ytdlpPath) {
    sendError(
      "yt-dlp not found",
      "yt-dlp is required to fetch YouTube chat. Install it (e.g. `brew install yt-dlp`) and click Retry.",
    );
    return;
  }

  // Quick metadata check
  sendInfo("Checking for chat data...");
  const availability = await checkChatAvailability(ytdlpPath, videoId);
  if (!isCurrent(generation)) {
    return;
  }

  if (availability.kind === "error") {
    sendError(availability.message, availability.error);
    return;
  }

  if (availability.kind === "unavailable") {
    sendInfo("No chat data available for this video");
    return;
  }

  if (availability.isLive) {
    await startLiveChat(videoId, generation);
    return;
  }

  // For archived streams: open window immediately, then download in background
  if (getPreferences().autoOpenChatWindow) {
    openStandaloneWindow();
  }

  await fetchArchivedChatData(videoId, generation);
};

// ============================================================
// Event Handlers
// ============================================================

/**
 * Handle file loaded event
 */
const onFileLoaded = (): void => {
  const url = core.status.url;
  const videoId = url ? extractVideoId(url) : null;

  if (videoId) {
    currentVideoId = videoId;
    fetchChatData(videoId);
    return;
  }

  // Not a YouTube video: clear chat from the previous file
  currentVideoId = null;
  resetChatState();

  if (!url) {
    sendInfo("Open a YouTube video to see chat");
    return;
  }

  if (!isYouTubeUrl(url)) {
    sendInfo("This is not a YouTube video");
    return;
  }

  sendError("Could not extract YouTube video ID");
};

/**
 * Send the current playback position to all webviews
 */
const flushPositionUpdate = (): void => {
  positionUpdateTimer = null;
  lastPositionSentAt = Date.now();
  sendPositionTo(sendToAll);
};

/**
 * Handle playback position changes (throttled)
 */
const onPositionChanged = (): void => {
  if (!currentVideoId || chatData.length === 0) {
    return;
  }

  // A trailing update is already scheduled
  if (positionUpdateTimer) {
    return;
  }

  const elapsed = Date.now() - lastPositionSentAt;
  if (elapsed >= POSITION_UPDATE_INTERVAL_MS) {
    flushPositionUpdate();
  } else {
    positionUpdateTimer = setTimeout(flushPositionUpdate, POSITION_UPDATE_INTERVAL_MS - elapsed);
  }
};

/**
 * Handle retry-fetch message from webviews
 */
const onRetryFetch = (_data: unknown): void => {
  if (currentVideoId) {
    fetchChatData(currentVideoId);
  }
};

/**
 * Handle sidebar-ready message from sidebar
 */
const onSidebarReady = (_data: unknown): void => {
  sendCurrentStateTo(sendToSidebar);
};

/**
 * Handle sidebar-ready message from standalone window
 */
const onStandaloneWindowReady = (_data: unknown): void => {
  isStandaloneWindowReady = true;
  sendCurrentStateTo((name, data) => standaloneWindow.postMessage(name, data));
};

/**
 * Open standalone chat window (if not already open)
 */
const openStandaloneWindow = (): void => {
  if (isStandaloneWindowOpen) {
    return;
  }

  standaloneWindow.loadFile("dist/sidebar/index.html");
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
  sidebar.loadFile("dist/sidebar/index.html");
  sidebar.onMessage("retry-fetch", onRetryFetch);
  sidebar.onMessage("sidebar-ready", onSidebarReady);

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
  // Stop live chat polling and drop in-flight results
  fetchGeneration++;
  stopLiveChatPolling();
});

event.on("mpv.time-pos.changed", onPositionChanged);
