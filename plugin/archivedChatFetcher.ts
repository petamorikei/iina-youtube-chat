/**
 * Archived Chat Fetcher - Fetches archived livestream chat directly from YouTube's internal API
 * Based on yt-dlp's youtube_live_chat.py implementation (downloader/youtube_live_chat.py)
 * This module is for archived streams only (youtube_live_chat_replay protocol)
 *
 * Flow (based on yt-dlp):
 * 1. Fetch video page → extract ytcfg and initial continuation from ytInitialData
 * 2. Fetch chat_page_url (HTML) → extract ytInitialData (with JSON fallback)
 * 3. Try to switch to unfiltered chat (all messages, not just "Top chat")
 * 4. Loop: POST to get_live_chat_replay API endpoint until no more continuations
 */

import type { AuthorBadge, BadgeType, ChatMessage, MessageRun, MessageType, SuperChatColors } from "./schemas";

// Types for IINA API
interface IINAConsole {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

interface HTTPRequestOption {
  params?: Record<string, string>;
  headers?: Record<string, string>;
  data?: unknown;
}

interface HTTPResponse {
  text: string;
  data: unknown | null;
  statusCode: number;
  reason: string;
}

interface IINAHTTP {
  get(url: string, options: HTTPRequestOption): Promise<HTTPResponse>;
  post(url: string, options: HTTPRequestOption): Promise<HTTPResponse>;
}

interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface IINAUtils {
  exec(path: string, args: string[], cwd?: string): Promise<ExecResult>;
}

// Parallel fetch configuration
const PARALLEL_WORKERS = 10;

// Progress callback type
export type ProgressCallback = (progress: {
  fetchedMessages: number;
  currentOffsetMs: number;
  status: "fetching" | "complete" | "error";
  message?: string;
}) => void;

// YouTube API types
interface InnertubeContext {
  client: {
    hl: string;
    gl: string;
    clientName: string;
    clientVersion: string;
    userAgent?: string;
    visitorData?: string;
  };
  clickTracking?: {
    clickTrackingParams: string;
  };
}

interface YtCfg {
  INNERTUBE_API_KEY?: string;
  INNERTUBE_CONTEXT?: InnertubeContext;
  INNERTUBE_CONTEXT_CLIENT_NAME?: number;
}

// Chat message types from YouTube
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

interface ChatItem {
  liveChatTextMessageRenderer?: LiveChatRenderer;
  liveChatPaidMessageRenderer?: LiveChatPaidRenderer;
  liveChatPaidStickerRenderer?: LiveChatStickerRenderer;
  liveChatMembershipItemRenderer?: LiveChatMembershipRenderer;
  liveChatSponsorshipsGiftPurchaseAnnouncementRenderer?: LiveChatGiftRenderer;
  liveChatViewerEngagementMessageRenderer?: LiveChatEngagementRenderer;
}

interface ReplayChatItemAction {
  actions?: Array<{ addChatItemAction?: { item: ChatItem } }>;
  videoOffsetTimeMsec?: string;
}

interface ChatAction {
  replayChatItemAction?: ReplayChatItemAction;
  addChatItemAction?: { item: ChatItem };
}

// Result type
export type ArchivedChatResult = { success: true; messages: ChatMessage[] } | { success: false; error: string };

// Segment worker result for parallel fetching
interface SegmentWorkerResult {
  workerId: number;
  messages: ChatMessage[];
  fragments: number;
  startOffsetMs: number;
  endOffsetMs: number;
}

/**
 * Archived Chat Fetcher class
 * Fetches all chat messages from archived YouTube livestreams
 */
export class ArchivedChatFetcher {
  private http: IINAHTTP;
  private messageIndex = 0;

  constructor(_utils: IINAUtils, http: IINAHTTP, _logger: IINAConsole) {
    this.http = http;
  }

  // ============================================================
  // HTTP Helpers
  // Uses IINA's native HTTP API to avoid exec buffer issues
  // ============================================================

  private async httpGet(url: string): Promise<{ success: boolean; body: string; error?: string }> {
    try {
      const response = await this.http.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return {
          success: false,
          body: "",
          error: `HTTP GET failed (status ${response.statusCode}): ${response.reason}`,
        };
      }

      return { success: true, body: response.text };
    } catch (error) {
      return { success: false, body: "", error: `HTTP GET error: ${error}` };
    }
  }

  private async httpPost(
    url: string,
    data: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<{ success: boolean; body: string; error?: string }> {
    try {
      const response = await this.http.post(url, {
        headers,
        data,
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return {
          success: false,
          body: "",
          error: `HTTP POST failed (status ${response.statusCode}): ${response.reason}`,
        };
      }

      return { success: true, body: response.text };
    } catch (error) {
      return { success: false, body: "", error: `HTTP POST error: ${error}` };
    }
  }

  // ============================================================
  // Data Extraction (based on yt-dlp's _base.py)
  // ============================================================

  /**
   * Extract ytcfg from webpage HTML
   * Based on yt-dlp's extract_ytcfg (_base.py:927-933)
   * Pattern: ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;
   *
   * yt-dlp code:
   *   return self._parse_json(
   *       self._search_regex(
   *           r'ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;', webpage, 'ytcfg',
   *           default='{}'), video_id, fatal=False) or {}
   */
  private extractYtcfg(html: string): YtCfg | null {
    const match = html.match(/ytcfg\.set\s*\(\s*(\{.+?\})\s*\)\s*;/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }

  /**
   * JavaScript equivalent of Python's json.JSONDecoder.raw_decode
   * Parses JSON from the beginning of the string and returns the parsed object
   * and the index where parsing ended, ignoring any extra content.
   *
   * This matches yt-dlp's LenientJSONDecoder with ignore_extra=True
   */
  private rawDecode(s: string): { obj: unknown; endIndex: number } | null {
    if (!s || (s[0] !== "{" && s[0] !== "[")) {
      return null;
    }

    // Use brace counting to find where the first complete JSON object ends,
    // then validate with JSON.parse
    let depth = 0;
    let inString = false;
    let i = 0;

    while (i < s.length) {
      const char = s[i];

      if (inString) {
        if (char === "\\") {
          i += 2;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        i++;
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{" || char === "[") {
        depth++;
      } else if (char === "}" || char === "]") {
        depth--;
        if (depth === 0) {
          // Found potential end of JSON, try to parse
          const jsonStr = s.substring(0, i + 1);
          try {
            const obj = JSON.parse(jsonStr);
            return { obj, endIndex: i + 1 };
          } catch {
            // Brace counting found wrong position, continue
          }
        }
      }
      i++;
    }

    return null;
  }

  /**
   * Search for JSON in a string, similar to yt-dlp's _search_json
   *
   * yt-dlp's _search_json:
   * 1. Uses regex to capture from first { to last } (greedy with contains_pattern=r'{(?s:.+)}')
   * 2. Uses LenientJSONDecoder.raw_decode to parse just the valid JSON
   *
   * @param startPattern - Regex pattern to find the start (e.g., /ytInitialData\s*=/)
   * @param html - HTML string to search in
   */
  private searchJson(startPattern: RegExp, html: string): Record<string, unknown> | null {
    const match = startPattern.exec(html);
    if (!match) {
      return null;
    }

    // Find the first { after the pattern match
    let jsonStart = match.index + match[0].length;
    while (jsonStart < html.length && /\s/.test(html[jsonStart])) {
      jsonStart++;
    }

    if (html[jsonStart] !== "{") {
      return null;
    }

    // yt-dlp's contains_pattern=r'{(?s:.+)}' captures from first { to last }
    // Find the last } in the string
    const lastBrace = html.lastIndexOf("}");
    if (lastBrace <= jsonStart) {
      return null;
    }

    // Extract substring from first { to last }
    const jsonCandidate = html.substring(jsonStart, lastBrace + 1);

    // Use raw_decode to parse just the valid JSON from the beginning
    const result = this.rawDecode(jsonCandidate);
    if (result) {
      return result.obj as Record<string, unknown>;
    }

    return null;
  }

  /**
   * Extract ytInitialData from webpage HTML
   * Based on yt-dlp's extract_yt_initial_data (_base.py:847-848)
   *
   * yt-dlp code:
   *   def extract_yt_initial_data(self, item_id, webpage, fatal=True):
   *       return self._search_json(self._YT_INITIAL_DATA_RE, webpage, 'yt initial data', item_id, fatal=fatal)
   *
   * _YT_INITIAL_DATA_RE = r'(?:window\s*\[\s*["\']ytInitialData["\']\s*\]|ytInitialData)\s*='
   */
  private extractYtInitialData(html: string): Record<string, unknown> | null {
    const pattern = /(?:window\s*\[\s*["']ytInitialData["']\s*\]|ytInitialData)\s*=/;
    return this.searchJson(pattern, html);
  }

  /**
   * Try to get data from HTML, with JSON fallback
   * Based on yt-dlp's download_and_parse_fragment (youtube_live_chat.py:116-121)
   */
  private extractDataFromResponse(response: string): Record<string, unknown> | null {
    // First try to extract ytInitialData from HTML
    const data = this.extractYtInitialData(response);
    if (data) {
      return data;
    }

    // Fallback: try parsing the entire response as JSON (for API responses)
    try {
      return JSON.parse(response);
    } catch {
      return null;
    }
  }

  /**
   * Get liveChatContinuation from data
   * Based on yt-dlp (youtube_live_chat.py:122-124)
   */
  private getLiveChatContinuation(data: Record<string, unknown>): Record<string, unknown> | null {
    // try_get(data, lambda x: x['continuationContents']['liveChatContinuation'], dict)
    const continuationContents = data.continuationContents as Record<string, unknown> | undefined;
    const liveChatContinuation = continuationContents?.liveChatContinuation as Record<string, unknown> | undefined;
    return liveChatContinuation || null;
  }

  // ============================================================
  // Continuation Handling (based on yt-dlp's youtube_live_chat.py)
  // ============================================================

  /**
   * Extract initial continuation from video page ytInitialData
   * Based on yt-dlp (youtube_live_chat.py:145-147)
   */
  private extractInitialContinuation(ytInitialData: Record<string, unknown>): string | null {
    try {
      // data['contents']['twoColumnWatchNextResults']['conversationBar']['liveChatRenderer']['continuations'][0]['reloadContinuationData']['continuation']
      const contents = ytInitialData.contents as Record<string, unknown> | undefined;
      const twoColumn = contents?.twoColumnWatchNextResults as Record<string, unknown> | undefined;
      const conversationBar = twoColumn?.conversationBar as Record<string, unknown> | undefined;
      const liveChatRenderer = conversationBar?.liveChatRenderer as Record<string, unknown> | undefined;
      const continuations = liveChatRenderer?.continuations as Array<Record<string, unknown>> | undefined;

      if (continuations && continuations.length > 0) {
        const reloadData = continuations[0].reloadContinuationData as Record<string, unknown> | undefined;
        return (reloadData?.continuation as string) || null;
      }
    } catch {
      // Ignore
    }
    return null;
  }

  /**
   * Try to get unfiltered chat continuation (all messages, not just "Top chat")
   * Based on yt-dlp's try_refresh_replay_beginning (youtube_live_chat.py:63-75)
   */
  private tryGetUnfilteredContinuation(liveChatContinuation: Record<string, unknown>): {
    continuation: string | null;
    clickTrackingParams: string | null;
  } {
    try {
      // x['header']['liveChatHeaderRenderer']['viewSelector']['sortFilterSubMenuRenderer']['subMenuItems'][1]['continuation']['reloadContinuationData']
      const header = liveChatContinuation.header as Record<string, unknown> | undefined;
      const headerRenderer = header?.liveChatHeaderRenderer as Record<string, unknown> | undefined;
      const viewSelector = headerRenderer?.viewSelector as Record<string, unknown> | undefined;
      const subMenuRenderer = viewSelector?.sortFilterSubMenuRenderer as Record<string, unknown> | undefined;
      const subMenuItems = subMenuRenderer?.subMenuItems as Array<Record<string, unknown>> | undefined;

      // [1] = second option = unfiltered chat
      if (subMenuItems && subMenuItems.length > 1) {
        const continuation = subMenuItems[1].continuation as Record<string, unknown> | undefined;
        const reloadData = continuation?.reloadContinuationData as Record<string, unknown> | undefined;

        if (reloadData) {
          return {
            continuation: (reloadData.continuation as string) || null,
            clickTrackingParams: (reloadData.trackingParams as string) || null,
          };
        }
      }
    } catch {
      // Ignore
    }

    return { continuation: null, clickTrackingParams: null };
  }

  /**
   * Parse actions from liveChatContinuation (replay mode)
   * Based on yt-dlp's parse_actions_replay (youtube_live_chat.py:44-61)
   */
  private parseReplayResponse(liveChatContinuation: Record<string, unknown>): {
    actions: ChatAction[];
    continuation: string | null;
    clickTrackingParams: string | null;
    offset: number | null;
  } {
    const rawActions = liveChatContinuation.actions as ChatAction[] | undefined;
    const actions = rawActions || [];

    // Get offset from last action
    let offset: number | null = null;
    for (const action of actions) {
      if (action.replayChatItemAction?.videoOffsetTimeMsec) {
        offset = Number.parseInt(action.replayChatItemAction.videoOffsetTimeMsec, 10);
      }
    }

    // Extract continuation
    // x['continuations'][0]['liveChatReplayContinuationData']
    const continuations = liveChatContinuation.continuations as Array<Record<string, unknown>> | undefined;
    let continuation: string | null = null;
    let clickTrackingParams: string | null = null;

    if (continuations && continuations.length > 0) {
      const contData = continuations[0].liveChatReplayContinuationData as Record<string, unknown> | undefined;
      if (contData) {
        continuation = (contData.continuation as string) || null;
        clickTrackingParams = (contData.clickTrackingParams as string) || null;
      }
    }

    return { actions, continuation, clickTrackingParams, offset };
  }

  // ============================================================
  // Parallel Fetch Helpers
  // ============================================================

  /**
   * Fetch a single API fragment with optional seek offset
   */
  private async fetchFragment(
    apiUrl: string,
    context: InnertubeContext,
    continuation: string,
    headers: Record<string, string>,
    seekOffsetMs?: number,
  ): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
    const requestData: Record<string, unknown> = {
      context,
      continuation,
    };

    if (seekOffsetMs !== undefined && seekOffsetMs > 0) {
      requestData.currentPlayerState = { playerOffsetMs: String(seekOffsetMs) };
    }

    const response = await this.httpPost(apiUrl, requestData, headers);
    if (!response.success) {
      return { success: false, error: response.error };
    }

    try {
      const data = JSON.parse(response.body);
      return { success: true, data };
    } catch {
      const rawResult = this.rawDecode(response.body);
      if (rawResult) {
        return { success: true, data: rawResult.obj as Record<string, unknown> };
      }
      return { success: false, error: "Failed to parse response" };
    }
  }

  /**
   * Extract ytInitialPlayerResponse from webpage HTML
   * This contains videoDetails with lengthSeconds
   */
  private extractPlayerResponse(html: string): Record<string, unknown> | null {
    const pattern = /ytInitialPlayerResponse\s*=\s*/;
    return this.searchJson(pattern, html);
  }

  /**
   * Extract video duration from HTML page
   * Tries multiple methods to find lengthSeconds
   */
  private extractVideoDurationFromHtml(html: string): number | null {
    // Method 1: Extract from ytInitialPlayerResponse.videoDetails.lengthSeconds
    try {
      const playerResponse = this.extractPlayerResponse(html);
      if (playerResponse) {
        const videoDetails = playerResponse.videoDetails as Record<string, unknown> | undefined;
        if (videoDetails?.lengthSeconds) {
          const seconds = Number.parseInt(videoDetails.lengthSeconds as string, 10);
          if (!Number.isNaN(seconds) && seconds > 0) {
            return seconds * 1000; // Return in milliseconds
          }
        }
      }
    } catch {
      // Continue to fallback
    }

    // Method 2: Direct regex search as fallback
    try {
      const match = html.match(/"lengthSeconds":"(\d+)"/);
      if (match) {
        const seconds = Number.parseInt(match[1], 10);
        if (!Number.isNaN(seconds) && seconds > 0) {
          return seconds * 1000;
        }
      }
    } catch {
      // Ignore
    }

    return null;
  }

  /**
   * Fetch a segment of chat messages (for parallel worker)
   */
  private async fetchSegment(
    workerId: number,
    apiUrl: string,
    context: InnertubeContext,
    initialContinuation: string,
    headers: Record<string, string>,
    startOffsetMs: number,
    endOffsetMs: number,
    onProgress?: (workerId: number, messageCount: number) => void,
  ): Promise<SegmentWorkerResult> {
    const messages: ChatMessage[] = [];
    let fragments = 0;
    let actualStartOffsetMs = startOffsetMs;
    let actualEndOffsetMs = startOffsetMs;

    // First request with seek
    let result = await this.fetchFragment(apiUrl, context, initialContinuation, headers, startOffsetMs);
    if (!result.success || !result.data) {
      return { workerId, messages, fragments, startOffsetMs: actualStartOffsetMs, endOffsetMs: actualEndOffsetMs };
    }

    let lcc = this.getLiveChatContinuation(result.data);

    while (lcc) {
      fragments++;
      const parsed = this.parseReplayResponse(lcc);
      const segmentMessages = this.parseActions(parsed.actions);

      // Filter messages within our segment range
      for (const msg of segmentMessages) {
        const msgOffsetMs = msg.timestamp * 1000;
        if (msgOffsetMs >= startOffsetMs && msgOffsetMs < endOffsetMs) {
          messages.push(msg);
          if (msgOffsetMs > actualEndOffsetMs) actualEndOffsetMs = msgOffsetMs;
          if (fragments === 1 && messages.length === 1) actualStartOffsetMs = msgOffsetMs;
        }
      }

      onProgress?.(workerId, messages.length);

      // Check if we've passed our segment end
      if (parsed.offset !== null && parsed.offset >= endOffsetMs) {
        break;
      }

      // Get next continuation
      if (!parsed.continuation) break;

      result = await this.fetchFragment(apiUrl, context, parsed.continuation, headers);
      if (!result.success || !result.data) break;

      lcc = this.getLiveChatContinuation(result.data);
    }

    return { workerId, messages, fragments, startOffsetMs: actualStartOffsetMs, endOffsetMs: actualEndOffsetMs };
  }

  // ============================================================
  // Main Fetch Method
  // ============================================================

  /**
   * Fetch all archived chat messages
   * Main entry point - follows yt-dlp's real_download flow (youtube_live_chat.py:19-192)
   */
  async fetchAllMessages(videoId: string, onProgress?: ProgressCallback): Promise<ArchivedChatResult> {
    this.messageIndex = 0;
    const allMessages: ChatMessage[] = [];

    onProgress?.({ fetchedMessages: 0, currentOffsetMs: 0, status: "fetching", message: "Fetching video page..." });

    // ========================================
    // Step 1: Fetch video page and extract initial data
    // ========================================
    const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const videoPageResponse = await this.httpGet(videoPageUrl);
    if (!videoPageResponse.success) {
      return { success: false, error: videoPageResponse.error || "Failed to fetch video page" };
    }

    const videoHtml = videoPageResponse.body;

    // Extract ytcfg
    const ytcfg = this.extractYtcfg(videoHtml);
    if (!ytcfg) {
      return { success: false, error: "Could not extract YouTube configuration" };
    }

    const apiKey = ytcfg.INNERTUBE_API_KEY;
    const innertubeContext = ytcfg.INNERTUBE_CONTEXT;

    if (!apiKey || !innertubeContext) {
      return { success: false, error: "Missing API key or context" };
    }

    const visitorData = innertubeContext.client.visitorData;
    const clientVersion = innertubeContext.client.clientVersion;
    const userAgent = innertubeContext.client.userAgent;

    // Extract ytInitialData from video page
    const videoYtInitialData = this.extractYtInitialData(videoHtml);
    if (!videoYtInitialData) {
      return { success: false, error: "Could not extract initial data from video page" };
    }

    // Get initial continuation from video page
    let continuationId = this.extractInitialContinuation(videoYtInitialData);
    if (!continuationId) {
      return { success: false, error: "No chat replay available for this video" };
    }

    // ========================================
    // Step 2: Fetch first chat page (fragment 1)
    // ========================================
    onProgress?.({ fetchedMessages: 0, currentOffsetMs: 0, status: "fetching", message: "Fetching chat page..." });

    const chatPageUrl = `https://www.youtube.com/live_chat_replay?continuation=${continuationId}`;
    const chatPageResponse = await this.httpGet(chatPageUrl);
    if (!chatPageResponse.success) {
      return { success: false, error: chatPageResponse.error || "Failed to fetch chat page" };
    }

    // Extract data from chat page (ytInitialData or direct JSON)
    const chatPageData = this.extractDataFromResponse(chatPageResponse.body);
    if (!chatPageData) {
      return { success: false, error: "Could not parse chat page data" };
    }

    // Get liveChatContinuation from chat page data
    const liveChatContinuation = this.getLiveChatContinuation(chatPageData);
    if (!liveChatContinuation) {
      return { success: false, error: "No chat data found" };
    }

    // ========================================
    // Step 3: Try to get unfiltered chat (fragment 1 only)
    // ========================================
    const unfilteredCont = this.tryGetUnfilteredContinuation(liveChatContinuation);

    if (unfilteredCont.continuation) {
      // Use unfiltered continuation
      continuationId = unfilteredCont.continuation;
    } else {
      // Parse actions from first page
      const firstParsed = this.parseReplayResponse(liveChatContinuation);
      const firstMessages = this.parseActions(firstParsed.actions);
      allMessages.push(...firstMessages);

      // If no continuation, can't proceed with parallel fetch
      if (!firstParsed.continuation) {
        onProgress?.({
          fetchedMessages: allMessages.length,
          currentOffsetMs: firstParsed.offset || 0,
          status: "complete",
          message: `Fetched ${allMessages.length} messages`,
        });
        return { success: true, messages: allMessages };
      }

      continuationId = firstParsed.continuation;
      const offset = firstParsed.offset || 0;

      if (firstMessages.length > 0) {
        onProgress?.({
          fetchedMessages: allMessages.length,
          currentOffsetMs: offset,
          status: "fetching",
          message: `Fetched ${allMessages.length} messages...`,
        });
      }
    }

    // ========================================
    // Step 4: Parallel fetch of remaining fragments
    // ========================================
    const apiUrl = `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay?key=${apiKey}`;

    // Build headers for API requests
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-YouTube-Client-Name": "1",
      "X-YouTube-Client-Version": clientVersion,
      Origin: "https://www.youtube.com",
    };

    if (visitorData) {
      headers["X-Goog-Visitor-Id"] = visitorData;
    }

    if (userAgent) {
      headers["User-Agent"] = userAgent;
    }

    // Get video duration from video page HTML (no additional HTTP requests needed)
    let videoDurationMs = this.extractVideoDurationFromHtml(videoHtml);
    if (!videoDurationMs) {
      // Fallback: use a default duration (2 hours)
      videoDurationMs = 2 * 60 * 60 * 1000;
    }

    // Divide into segments
    const segmentDuration = videoDurationMs / PARALLEL_WORKERS;
    const segments: { start: number; end: number }[] = [];

    for (let i = 0; i < PARALLEL_WORKERS; i++) {
      segments.push({
        start: Math.floor(i * segmentDuration),
        end: Math.floor((i + 1) * segmentDuration),
      });
    }
    // Ensure last segment goes past the end
    segments[PARALLEL_WORKERS - 1].end = videoDurationMs + 60000;

    // Track progress per worker
    const workerProgress = new Array(PARALLEL_WORKERS).fill(0);
    const updateProgress = (workerId: number, messageCount: number) => {
      workerProgress[workerId] = messageCount;
      const total = workerProgress.reduce((a, b) => a + b, 0) + allMessages.length;
      onProgress?.({
        fetchedMessages: total,
        currentOffsetMs: 0,
        status: "fetching",
        message: `Fetched ${total.toLocaleString()} messages...`,
      });
    };

    // Launch parallel workers
    onProgress?.({
      fetchedMessages: allMessages.length,
      currentOffsetMs: 0,
      status: "fetching",
      message: "Fetching chat messages...",
    });

    const workerPromises = segments.map((seg, i) =>
      this.fetchSegment(i, apiUrl, innertubeContext, continuationId, headers, seg.start, seg.end, updateProgress),
    );

    const workerResults = await Promise.all(workerPromises);

    // Merge and deduplicate
    const seenIds = new Set<string>();

    // Add messages from initial fetch
    for (const msg of allMessages) {
      seenIds.add(msg.id);
    }

    // Sort workers by start offset and merge
    workerResults.sort((a, b) => a.startOffsetMs - b.startOffsetMs);

    for (const result of workerResults) {
      for (const msg of result.messages) {
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          allMessages.push(msg);
        }
      }
    }

    // Sort by timestamp
    allMessages.sort((a, b) => a.timestamp - b.timestamp);

    onProgress?.({
      fetchedMessages: allMessages.length,
      currentOffsetMs: allMessages.length > 0 ? allMessages[allMessages.length - 1].timestamp * 1000 : 0,
      status: "complete",
      message: `Fetched ${allMessages.length} messages`,
    });

    return { success: true, messages: allMessages };
  }

  // ============================================================
  // Message Parsing
  // ============================================================

  private parseActions(actions: ChatAction[]): ChatMessage[] {
    const messages: ChatMessage[] = [];

    for (const action of actions) {
      // Handle replay format: replayChatItemAction contains nested actions
      if (action.replayChatItemAction) {
        const offsetMs = Number.parseInt(action.replayChatItemAction.videoOffsetTimeMsec || "0", 10);
        const timestamp = offsetMs / 1000;

        for (const innerAction of action.replayChatItemAction.actions || []) {
          const item = innerAction.addChatItemAction?.item;
          if (item) {
            const msg = this.parseItem(item, timestamp);
            if (msg) {
              messages.push(msg);
            }
          }
        }
      }
      // Handle direct addChatItemAction (for some edge cases)
      else if (action.addChatItemAction?.item) {
        const msg = this.parseItem(action.addChatItemAction.item, 0);
        if (msg) {
          messages.push(msg);
        }
      }
    }

    return messages;
  }

  private parseItem(item: ChatItem, timestamp: number): ChatMessage | null {
    const index = this.messageIndex++;

    // Regular text message
    if (item.liveChatTextMessageRenderer) {
      const r = item.liveChatTextMessageRenderer;
      const { text, messageRuns } = this.parseMessageRuns(r.message?.runs);

      if (!text && messageRuns.length === 0) return null;

      return {
        id: r.id || `archived-${index}`,
        type: "text" as MessageType,
        timestamp,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: text,
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
        timestampText: r.timestampText?.simpleText,
      };
    }

    // Super Chat
    if (item.liveChatPaidMessageRenderer) {
      const r = item.liveChatPaidMessageRenderer;
      const { text, messageRuns } = this.parseMessageRuns(r.message?.runs);

      return {
        id: r.id || `archived-${index}`,
        type: "superchat" as MessageType,
        timestamp,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: text || "(Super Chat)",
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
        timestampText: r.timestampText?.simpleText,
        amount: r.purchaseAmountText?.simpleText,
        colors: this.parseSuperChatColors(r),
      };
    }

    // Super Sticker
    if (item.liveChatPaidStickerRenderer) {
      const r = item.liveChatPaidStickerRenderer;

      return {
        id: r.id || `archived-${index}`,
        type: "supersticker" as MessageType,
        timestamp,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: "(Super Sticker)",
        timestampText: r.timestampText?.simpleText,
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
        id: r.id || `archived-${index}`,
        type: "membership" as MessageType,
        timestamp,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        authorBadges: this.parseAuthorBadges(r.authorBadges),
        message: text || headerText || "(New Member)",
        messageRuns: messageRuns.length > 0 ? messageRuns : undefined,
        timestampText: r.timestampText?.simpleText,
        membershipLevel: headerText || undefined,
      };
    }

    // Gift Membership
    if (item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer) {
      const r = item.liveChatSponsorshipsGiftPurchaseAnnouncementRenderer;
      const { text: giftText } = this.parseMessageRuns(r.header?.liveChatSponsorshipsHeaderRenderer?.primaryText?.runs);

      return {
        id: r.id || `archived-${index}`,
        type: "gift" as MessageType,
        timestamp,
        author: r.authorName?.simpleText || "Unknown",
        authorPhoto: this.getBestThumbnail(r.authorPhoto?.thumbnails),
        authorChannelId: r.authorExternalChannelId,
        message: giftText || "(Gift Membership)",
        timestampText: r.timestampText?.simpleText,
      };
    }

    // System/Engagement message
    if (item.liveChatViewerEngagementMessageRenderer) {
      const r = item.liveChatViewerEngagementMessageRenderer;
      const { text, messageRuns } = this.parseMessageRuns(r.message?.runs);

      if (!text) return null;

      return {
        id: r.id || `archived-${index}`,
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
