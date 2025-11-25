import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import type { ChatMessage as ChatMessageType, UserPreferences } from "../types";
import { ChatMessage } from "./ChatMessage";

interface MessageListProps {
  messages: ChatMessageType[];
  currentPosition: number | null;
  preferences: UserPreferences;
}

export const MessageList = ({ messages, currentPosition, preferences }: MessageListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const { maxMessages, scrollDirection } = preferences;

  // Filter and limit messages based on current position and preferences
  const displayMessages = useMemo(() => {
    // First filter by current position
    let filtered = messages;
    if (currentPosition !== null) {
      filtered = messages.filter((msg) => msg.timestamp <= currentPosition);
    }

    // Apply maxMessages limit (0 = unlimited)
    if (maxMessages > 0 && filtered.length > maxMessages) {
      // Keep the most recent messages (last N)
      filtered = filtered.slice(-maxMessages);
    }

    // Reverse order for top-to-bottom (newest first)
    if (scrollDirection === "top-to-bottom") {
      return [...filtered].reverse();
    }

    return filtered;
  }, [messages, currentPosition, maxMessages, scrollDirection]);

  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated height of each message
    overscan: 5, // Render 5 extra items outside viewport for smooth scrolling
    getItemKey: (index) => displayMessages[index]?.id ?? index, // Stable keys based on message ID
  });

  const virtualItems = virtualizer.getVirtualItems();

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
            const message = displayMessages[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{ paddingBottom: "0.5rem" }}
              >
                {message ? (
                  <ChatMessage message={message} preferences={preferences} />
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
