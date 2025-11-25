import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import type { ChatMessage as ChatMessageType } from "../types";
import { ChatMessage } from "./ChatMessage";

interface MessageListProps {
  messages: ChatMessageType[];
  currentPosition: number | null;
}

export const MessageList = ({ messages, currentPosition }: MessageListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter messages based on current position
  const filteredMessages = useMemo(() => {
    if (currentPosition === null) {
      // No position info yet, show all messages
      return messages;
    }
    // Show messages up to current position
    return messages.filter((msg) => msg.timestamp <= currentPosition);
  }, [messages, currentPosition]);

  // Debug: Show timestamp range
  const timestampDebug = useMemo(() => {
    if (messages.length === 0) {
      return { min: null, max: null, sample: [] };
    }
    const timestamps = messages.map((m) => m.timestamp);
    const sample = messages.slice(0, 5).map((m) => ({ id: m.id, timestamp: m.timestamp, author: m.author }));
    return {
      min: Math.min(...timestamps),
      max: Math.max(...timestamps),
      sample,
    };
  }, [messages]);

  console.log("[MessageList] Timestamp Analysis:", {
    currentPosition,
    totalMessages: messages.length,
    filteredCount: filteredMessages.length,
    timestampRange: `${timestampDebug.min}s - ${timestampDebug.max}s`,
    sampleMessages: timestampDebug.sample,
  });

  const virtualizer = useVirtualizer({
    count: filteredMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated height of each message
    overscan: 5, // Render 5 extra items outside viewport for smooth scrolling
    getItemKey: (index) => filteredMessages[index]?.id ?? index, // Stable keys based on message ID
  });

  const virtualItems = virtualizer.getVirtualItems();

  console.log("[MessageList] Virtual Scrolling:", {
    filteredCount: filteredMessages.length,
    virtualItemsCount: virtualItems.length,
    totalSize: virtualizer.getTotalSize(),
  });

  useEffect(() => {
    console.log("[MessageList] Messages updated:", {
      totalMessages: messages.length,
      filteredMessages: filteredMessages.length,
      virtualizedItems: virtualItems.length,
      totalSize: virtualizer.getTotalSize(),
      currentPosition,
    });
  }, [messages.length, filteredMessages.length, virtualItems.length, virtualizer, currentPosition]);

  // Use the official TanStack Virtual pattern for dynamic sizing
  return (
    <div
      ref={parentRef}
      style={{
        height: "100%",
        width: "100%",
        overflowY: "auto",
        contain: "strict", // Important for performance
      }}
    >
      {/* Inner container with total virtual height */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {/* Wrapper that translates to first item's position */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
          }}
        >
          {/* Items flow normally inside the wrapper */}
          {virtualItems.map((virtualItem) => {
            const message = filteredMessages[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{ paddingBottom: "0.5rem" }}
              >
                {message ? (
                  <ChatMessage message={message} />
                ) : (
                  <div style={{ color: "red", fontSize: "12px", padding: "0.5rem" }}>
                    ERROR: Message at index {virtualItem.index} is undefined
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
