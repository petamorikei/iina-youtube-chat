/**
 * Live Chat Fetcher - Fetches live stream chat directly from YouTube's internal API
 * This module is for live streams only. Archived streams are handled by ArchivedChatFetcher.
 */

import type { ChatMessage } from "../src/schemas";
import { type ChatItem, ChatItemParser, formatTimestampUsec } from "./chatItemParser";

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

export type MetadataResult = { success: true; metadata: LiveChatMetadata } | { success: false; error: string };

// Common curl options: show errors, fail on HTTP errors, and never hang indefinitely
const CURL_BASE_ARGS = ["-sS", "--fail", "--max-time", "30"];

/**
 * Live Chat Fetcher class
 * Uses curl via utils.exec instead of iina.http to avoid blocking the main thread
 */
export class LiveChatFetcher {
  private utils: IINAUtils;
  private logger: IINAConsole;
  // Live renderers only carry an epoch timestamp, shown as local time
  private parser = new ChatItemParser("live", (renderer) => formatTimestampUsec(renderer.timestampUsec));

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
        ...CURL_BASE_ARGS,
        "-L", // Follow redirects
        "-A",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "-H",
        "Accept-Language: en-US,en;q=0.9",
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
  private async curlPost(
    url: string,
    data: Record<string, unknown>,
  ): Promise<{ success: boolean; body: string; error?: string }> {
    try {
      const result = await this.utils.exec("/usr/bin/curl", [
        ...CURL_BASE_ARGS,
        "-X",
        "POST",
        "-H",
        "Content-Type: application/json",
        "-A",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "-d",
        JSON.stringify(data),
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
   * The caller must have already confirmed that the video is live (via yt-dlp metadata)
   */
  async fetchMetadata(videoId: string): Promise<MetadataResult> {
    try {
      // Fetch HTML to get API key and continuation token
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
      this.logger.log("[LiveChatFetcher] API key found");

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

      this.logger.log("[LiveChatFetcher] Metadata fetched successfully");

      return {
        success: true,
        metadata: {
          apiKey,
          continuation,
          context,
          isLive: true,
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
    this.parser.reset();
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

      const msg = this.parser.parseItem(item, 0); // Live messages have no video-relative timestamp
      if (msg) {
        messages.push(msg);
      }
    }

    return messages;
  }
}
