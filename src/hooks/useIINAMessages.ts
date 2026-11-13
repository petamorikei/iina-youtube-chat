import { useEffect, useRef, useState } from "react";
import {
  ChatDataChunkMessageSchema,
  ChatDataCompleteMessageSchema,
  ChatErrorMessageSchema,
  ChatInfoMessageSchema,
  ChatLoadingMessageSchema,
  ChatProgressMessageSchema,
  ChatWarningMessageSchema,
  LiveChatMessagesSchema,
  PositionUpdateMessageSchema,
  PreferencesUpdateMessageSchema,
} from "../schemas";
import type { AppState, ChatMessage } from "../types";

const DEFAULT_PREFERENCES = {
  maxMessages: 200,
  scrollDirection: "bottom-to-top" as const,
  showTimestamp: true,
  showAuthorName: true,
  showAuthorPhoto: true,
  fontScale: 100,
};

export const useIINAMessages = () => {
  const [state, setState] = useState<AppState>({
    loading: true, // Start with loading state until plugin sends actual status
    error: null,
    errorDetail: null,
    info: null,
    warning: null,
    warningDetail: null,
    progress: null,
    messages: [],
    currentPosition: null,
    preferences: DEFAULT_PREFERENCES,
  });

  // Store chunks temporarily until all are received
  const chunksRef = useRef<Map<number, ChatMessage[]>>(new Map());
  const expectedChunksRef = useRef<number>(0);

  useEffect(() => {
    // Register separate message handlers for each message type

    // Clear all chat state (sent by the plugin when the video changes or a fetch restarts)
    iina.onMessage("chat-reset", () => {
      chunksRef.current.clear();
      expectedChunksRef.current = 0;
      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        errorDetail: null,
        info: null,
        warning: null,
        warningDetail: null,
        progress: null,
        messages: [],
        currentPosition: null,
      }));
    });

    iina.onMessage("chat-loading", (data: unknown) => {
      const parseResult = ChatLoadingMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-loading message:", parseResult.error);
        return;
      }
      const { loading } = parseResult.data;
      setState((prev) =>
        loading
          ? // Starting to load: clear previous status
            { ...prev, loading, error: null, errorDetail: null, info: null, warning: null, warningDetail: null }
          : // Finished loading: keep any error/info that was reported
            { ...prev, loading, progress: null },
      );
    });

    iina.onMessage("chat-progress", (data: unknown) => {
      const parseResult = ChatProgressMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-progress message:", parseResult.error);
        return;
      }
      const progress = parseResult.data;
      setState((prev) => ({
        ...prev,
        progress: progress.status === "complete" ? null : progress,
      }));
    });

    iina.onMessage("chat-data-chunk", (data: unknown) => {
      const parseResult = ChatDataChunkMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-data-chunk message:", parseResult.error);
        return;
      }

      const { chunk, chunkIndex, totalChunks } = parseResult.data;

      // Store chunk
      chunksRef.current.set(chunkIndex, chunk);
      expectedChunksRef.current = totalChunks;
    });

    iina.onMessage("chat-data-complete", (data: unknown) => {
      const parseResult = ChatDataCompleteMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-data-complete message:", parseResult.error);
        return;
      }

      const { totalMessages } = parseResult.data;

      // Assemble all chunks in order
      const allMessages: ChatMessage[] = [];
      for (let i = 0; i < expectedChunksRef.current; i++) {
        const chunk = chunksRef.current.get(i);
        if (chunk) {
          allMessages.push(...chunk);
        } else {
          console.error(`[useIINAMessages] Missing chunk ${i}`);
        }
      }

      if (allMessages.length !== totalMessages) {
        console.error(`[useIINAMessages] Message count mismatch: expected ${totalMessages}, got ${allMessages.length}`);
      }

      setState((prev) => ({ ...prev, messages: allMessages, error: null, errorDetail: null, info: null }));

      // Clear chunks
      chunksRef.current.clear();
      expectedChunksRef.current = 0;
    });

    iina.onMessage("chat-error", (data: unknown) => {
      const parseResult = ChatErrorMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-error message:", parseResult.error);
        return;
      }
      const { message, error } = parseResult.data;
      console.error("[useIINAMessages] Chat error:", message, error ?? "");
      setState((prev) => ({
        ...prev,
        error: message,
        errorDetail: error ?? null,
        info: null,
        loading: false,
        progress: null,
      }));
    });

    iina.onMessage("chat-warning", (data: unknown) => {
      const parseResult = ChatWarningMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-warning message:", parseResult.error);
        return;
      }
      const { message, error } = parseResult.data;
      setState((prev) => ({ ...prev, warning: message, warningDetail: error ?? null }));
    });

    iina.onMessage("chat-info", (data: unknown) => {
      const parseResult = ChatInfoMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-info message:", parseResult.error);
        return;
      }
      const { message } = parseResult.data;
      setState((prev) => ({ ...prev, info: message, error: null, errorDetail: null, loading: false }));
    });

    iina.onMessage("live-chat-messages", (data: unknown) => {
      const parseResult = LiveChatMessagesSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid live-chat-messages:", parseResult.error);
        return;
      }
      const { messages: newMessages } = parseResult.data;
      setState((prev) => {
        // Append new messages, keeping only the latest maxMessages (0 = keep all).
        // Older live messages are never displayed, so holding them would only use memory.
        const { maxMessages } = prev.preferences;
        const merged = [...prev.messages, ...newMessages];
        const messages = maxMessages > 0 && merged.length > maxMessages ? merged.slice(-maxMessages) : merged;
        return {
          ...prev,
          messages,
          loading: false, // Clear loading state when receiving chat
          info: null, // Clear info message when receiving chat
        };
      });
    });

    iina.onMessage("position-update", (data: unknown) => {
      const parseResult = PositionUpdateMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid position-update message:", parseResult.error);
        return;
      }
      const { position } = parseResult.data;
      setState((prev) => ({ ...prev, currentPosition: position }));
    });

    iina.onMessage("preferences-update", (data: unknown) => {
      const parseResult = PreferencesUpdateMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid preferences-update message:", parseResult.error);
        return;
      }
      const { maxMessages, scrollDirection, showTimestamp, showAuthorName, showAuthorPhoto, fontScale } =
        parseResult.data;
      setState((prev) => ({
        ...prev,
        preferences: { maxMessages, scrollDirection, showTimestamp, showAuthorName, showAuthorPhoto, fontScale },
      }));
    });

    // Send ready signal to plugin to request current data
    iina.postMessage("sidebar-ready", {});
  }, []);

  const handleRetry = () => {
    iina.postMessage("retry-fetch", {});
  };

  return { state, handleRetry };
};
