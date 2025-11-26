import { useEffect, useRef, useState } from "react";
import {
  ChatDataChunkMessageSchema,
  ChatDataCompleteMessageSchema,
  ChatErrorMessageSchema,
  ChatInfoMessageSchema,
  ChatLoadingMessageSchema,
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
    info: null,
    messages: [],
    currentPosition: null,
    preferences: DEFAULT_PREFERENCES,
  });

  // Store chunks temporarily until all are received
  const chunksRef = useRef<Map<number, ChatMessage[]>>(new Map());
  const expectedChunksRef = useRef<number>(0);

  useEffect(() => {
    console.log("[useIINAMessages] useEffect called, registering message handlers");
    console.log("[useIINAMessages] iina object:", typeof iina, iina);

    // Register separate message handlers for each message type
    iina.onMessage("chat-loading", (data: unknown) => {
      const parseResult = ChatLoadingMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-loading message:", parseResult.error);
        return;
      }
      const { loading } = parseResult.data;
      setState((prev) => ({ ...prev, loading, error: null, info: null }));
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

      // Check for missing chunks
      const missingChunks: number[] = [];
      for (let i = 0; i < expectedChunksRef.current; i++) {
        if (!chunksRef.current.has(i)) {
          missingChunks.push(i);
        }
      }
      if (missingChunks.length > 0) {
        console.error(`[useIINAMessages] Missing chunks: ${missingChunks.join(", ")}`);
      }

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

      setState((prev) => ({ ...prev, messages: allMessages, error: null, info: null }));

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
      const { message } = parseResult.data;
      console.error("[useIINAMessages] Chat error:", message);
      setState((prev) => ({ ...prev, error: message, loading: false }));
    });

    iina.onMessage("chat-info", (data: unknown) => {
      const parseResult = ChatInfoMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-info message:", parseResult.error);
        return;
      }
      const { message } = parseResult.data;
      setState((prev) => ({ ...prev, info: message, loading: false }));
    });

    iina.onMessage("live-chat-messages", (data: unknown) => {
      const parseResult = LiveChatMessagesSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid live-chat-messages:", parseResult.error);
        return;
      }
      const { messages: newMessages } = parseResult.data;
      console.log(`[useIINAMessages] Received ${newMessages.length} live chat messages`);
      // Append new messages to existing ones
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, ...newMessages],
        info: null, // Clear info message when receiving chat
      }));
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
    console.log("[useIINAMessages] About to send sidebar-ready message");
    iina.postMessage("sidebar-ready", {});
    console.log("[useIINAMessages] sidebar-ready message sent");
  }, []);

  const handleRetry = () => {
    iina.postMessage("retry-fetch", {});
  };

  return { state, handleRetry };
};
