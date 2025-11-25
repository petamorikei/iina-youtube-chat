import { useEffect, useRef, useState } from "react";
import {
  ChatDataChunkMessageSchema,
  ChatDataCompleteMessageSchema,
  ChatErrorMessageSchema,
  ChatInfoMessageSchema,
  ChatLoadingMessageSchema,
  PositionUpdateMessageSchema,
} from "../schemas";
import type { AppState, ChatMessage } from "../types";

interface DebugInfo {
  handlerRegistered: boolean;
  messagesReceived: number;
  lastMessageName: string | null;
  lastUpdate: string;
  chatDataReceived: boolean;
  chatDataError: string | null;
  positionUpdateCount: number;
}

export const useIINAMessages = () => {
  console.log("[useIINAMessages] Hook initialized");

  const [state, setState] = useState<AppState>({
    loading: false,
    error: null,
    info: null,
    messages: [],
    currentPosition: null,
  });

  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    handlerRegistered: false,
    messagesReceived: 0,
    lastMessageName: null,
    lastUpdate: new Date().toISOString(),
    chatDataReceived: false,
    chatDataError: null,
    positionUpdateCount: 0,
  });

  // Store chunks temporarily until all are received
  const chunksRef = useRef<Map<number, ChatMessage[]>>(new Map());
  const expectedChunksRef = useRef<number>(0);

  useEffect(() => {
    console.log("[useIINAMessages] Setting up message handlers");
    console.log("[useIINAMessages] typeof iina:", typeof iina);
    console.log("[useIINAMessages] typeof iina.onMessage:", typeof iina.onMessage);

    // Register separate message handlers for each message type
    // IINA's iina.onMessage() takes (messageName, handler) - you can register multiple handlers
    iina.onMessage("chat-loading", (data: unknown) => {
      console.log("[useIINAMessages] Received chat-loading message");
      setDebugInfo((prev) => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        lastMessageName: "chat-loading",
        lastUpdate: new Date().toISOString(),
      }));

      const parseResult = ChatLoadingMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-loading message:", parseResult.error);
        return;
      }
      const { loading } = parseResult.data;
      console.log("[useIINAMessages] Processing chat-loading:", { loading });
      setState((prev) => ({ ...prev, loading, error: null, info: null }));
    });

    iina.onMessage("chat-data-chunk", (data: unknown) => {
      console.log("[useIINAMessages] Received chat-data-chunk message");

      const parseResult = ChatDataChunkMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-data-chunk message:", parseResult.error);
        return;
      }

      const { chunk, chunkIndex, totalChunks } = parseResult.data;
      console.log(`[useIINAMessages] Chunk ${chunkIndex + 1}/${totalChunks}, items: ${chunk.length}`);

      // Store chunk
      chunksRef.current.set(chunkIndex, chunk);
      expectedChunksRef.current = totalChunks;

      setDebugInfo((prev) => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        lastMessageName: "chat-data-chunk",
        lastUpdate: new Date().toISOString(),
      }));
    });

    iina.onMessage("chat-data-complete", (data: unknown) => {
      console.log("[useIINAMessages] Received chat-data-complete message");

      const parseResult = ChatDataCompleteMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-data-complete message:", parseResult.error);
        return;
      }

      const { totalMessages } = parseResult.data;
      console.log(
        `[useIINAMessages] Assembling ${expectedChunksRef.current} chunks, expected ${totalMessages} messages`,
      );
      console.log(`[useIINAMessages] Chunks received: ${chunksRef.current.size}/${expectedChunksRef.current}`);

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

      console.log(`[useIINAMessages] Assembled ${allMessages.length} messages (expected ${totalMessages})`);

      const errorMsg =
        allMessages.length !== totalMessages
          ? `Expected ${totalMessages}, got ${allMessages.length}. Missing chunks: ${missingChunks.join(", ")}`
          : null;

      setDebugInfo((prev) => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        lastMessageName: "chat-data-complete",
        lastUpdate: new Date().toISOString(),
        chatDataReceived: true,
        chatDataError: errorMsg,
      }));

      setState((prev) => ({ ...prev, messages: allMessages, error: null, info: null }));

      // Clear chunks
      chunksRef.current.clear();
      expectedChunksRef.current = 0;
    });

    iina.onMessage("chat-error", (data: unknown) => {
      console.log("[useIINAMessages] Received chat-error message");
      setDebugInfo((prev) => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        lastMessageName: "chat-error",
        lastUpdate: new Date().toISOString(),
      }));

      const parseResult = ChatErrorMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-error message:", parseResult.error);
        return;
      }
      const { message } = parseResult.data;
      console.error("[useIINAMessages] Processing chat-error:", { message });
      setState((prev) => ({ ...prev, error: message, loading: false }));
    });

    iina.onMessage("chat-info", (data: unknown) => {
      console.log("[useIINAMessages] Received chat-info message");
      setDebugInfo((prev) => ({
        ...prev,
        messagesReceived: prev.messagesReceived + 1,
        lastMessageName: "chat-info",
        lastUpdate: new Date().toISOString(),
      }));

      const parseResult = ChatInfoMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid chat-info message:", parseResult.error);
        return;
      }
      const { message } = parseResult.data;
      console.log("[useIINAMessages] Processing chat-info:", { message });
      setState((prev) => ({ ...prev, info: message, loading: false }));
    });

    iina.onMessage("position-update", (data: unknown) => {
      // Only update debug info every 100 messages to avoid performance issues
      setDebugInfo((prev) => {
        const newCount = prev.positionUpdateCount + 1;
        if (newCount % 100 === 0) {
          return {
            ...prev,
            messagesReceived: prev.messagesReceived + 1,
            lastMessageName: "position-update",
            lastUpdate: new Date().toISOString(),
            positionUpdateCount: newCount,
          };
        }
        return {
          ...prev,
          messagesReceived: prev.messagesReceived + 1,
          positionUpdateCount: newCount,
        };
      });

      const parseResult = PositionUpdateMessageSchema.safeParse(data);
      if (!parseResult.success) {
        console.error("[useIINAMessages] Invalid position-update message:", parseResult.error);
        return;
      }
      const { position } = parseResult.data;
      setState((prev) => {
        if (prev.currentPosition !== position) {
          console.log(`[useIINAMessages] Position update: ${position}s`);
        }
        return { ...prev, currentPosition: position };
      });
    });

    console.log("[useIINAMessages] All message handlers registered");
    setDebugInfo((prev) => ({ ...prev, handlerRegistered: true }));

    // Send ready signal to plugin to request current data
    console.log("[useIINAMessages] Sending sidebar-ready message to plugin");
    iina.postMessage("sidebar-ready", {});
  }, []);

  const handleRetry = () => {
    console.log("[useIINAMessages] Retry button clicked, sending retry-fetch message");
    iina.postMessage("retry-fetch", {});
  };

  console.log("[useIINAMessages] Current state:", {
    loading: state.loading,
    error: state.error,
    info: state.info,
    messageCount: state.messages.length,
  });

  return { state, handleRetry, debugInfo };
};
