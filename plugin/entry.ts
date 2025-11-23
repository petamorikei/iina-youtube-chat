// IINA Plugin Entry Point for YouTube Chat
// This file runs in IINA's JavaScriptCore context

// Destructure IINA API modules
const { event, sidebar, core, console: logger } = iina;

// Plugin state
let currentVideoUrl: string | null = null;
let chatData: unknown[] = [];

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
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?]+)/,
    /youtube\.com\/embed\/([^?]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
};

/**
 * Fetch chat data using yt-dlp
 */
const fetchChatData = async (videoUrl: string): Promise<void> => {
  try {
    sidebar.postMessage("chat-loading", { loading: true });

    // TODO: Execute yt-dlp and fetch chat data
    // This will be implemented in the next phase
    logger.log(`Fetching chat data for: ${videoUrl}`);

    // Placeholder: Send empty chat data for now
    chatData = [];
    sidebar.postMessage("chat-data", { messages: chatData });
    sidebar.postMessage("chat-loading", { loading: false });
  } catch (error) {
    logger.error(`Error fetching chat data: ${error}`);
    sidebar.postMessage("chat-error", {
      message: "Failed to fetch chat data",
      error: String(error),
    });
    sidebar.postMessage("chat-loading", { loading: false });
  }
};

/**
 * Handle file loaded event
 */
const onFileLoaded = (): void => {
  const url = core.status.url;

  if (!url) {
    logger.log("No URL available");
    return;
  }

  logger.log(`File loaded: ${url}`);

  if (!isYouTubeUrl(url)) {
    logger.log("Not a YouTube URL");
    sidebar.postMessage("chat-info", {
      message: "This is not a YouTube video",
    });
    return;
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    logger.log("Could not extract video ID");
    sidebar.postMessage("chat-error", {
      message: "Could not extract YouTube video ID",
    });
    return;
  }

  logger.log(`YouTube video detected: ${videoId}`);
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

  // TODO: Filter and send messages based on current position
  // This will be implemented in the next phase
  logger.log(`Position changed: ${position}`);
};

/**
 * Handle retry-fetch message from sidebar
 */
const onRetryFetch = (_data: unknown): void => {
  if (currentVideoUrl) {
    fetchChatData(currentVideoUrl);
  }
};

// Register event listeners
event.on("iina.file-loaded", (_url: string) => onFileLoaded());
event.on("mpv.time-pos.changed", onPositionChanged);
sidebar.onMessage("retry-fetch", onRetryFetch);

logger.log("YouTube Chat plugin initialized");
