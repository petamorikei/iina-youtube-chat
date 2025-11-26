import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // Track if user is at the bottom (should auto-scroll)
  const [isAtBottom, setIsAtBottom] = useState(true);
  // Delayed state for showing scroll button (prevents flicker during auto-scroll)
  const [showScrollButton, setShowScrollButton] = useState(false);
  const prevMessageCountRef = useRef(0);

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

  // Check if scrolled to the "latest" edge (bottom for bottom-to-top, top for top-to-bottom)
  const checkIfAtLatestEdge = useCallback(() => {
    const el = parentRef.current;
    if (!el) return true;
    const threshold = 50; // pixels from edge to consider "at edge"

    if (scrollDirection === "top-to-bottom") {
      // For top-to-bottom, newest is at top, so check if at top
      return el.scrollTop <= threshold;
    }
    // For bottom-to-top, newest is at bottom, so check if at bottom
    return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, [scrollDirection]);

  // Handle scroll events to track if user is at the latest edge
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const handleScroll = () => {
      setIsAtBottom(checkIfAtLatestEdge());
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [checkIfAtLatestEdge]);

  // Delayed scroll button visibility (500ms delay to prevent flicker during auto-scroll)
  useEffect(() => {
    if (isAtBottom) {
      // Hide immediately when at bottom
      setShowScrollButton(false);
    } else {
      // Show after delay when not at bottom
      const timer = setTimeout(() => setShowScrollButton(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isAtBottom]);

  // Auto-scroll to bottom when new messages arrive (if user is at bottom)
  useEffect(() => {
    const messageCount = displayMessages.length;
    const prevCount = prevMessageCountRef.current;

    if (messageCount === 0) {
      prevMessageCountRef.current = 0;
      return;
    }

    // For bottom-to-top, scroll to last index
    // For top-to-bottom, scroll to first index (newest is at top)
    const targetIndex = scrollDirection === "bottom-to-top" ? messageCount - 1 : 0;

    // Initial load: scroll immediately without animation
    if (prevCount === 0 && messageCount > 0) {
      virtualizer.scrollToIndex(targetIndex, { align: "end" });
      prevMessageCountRef.current = messageCount;
      return;
    }

    // New messages added: scroll with animation if user is at bottom
    if (messageCount > prevCount && isAtBottom) {
      virtualizer.scrollToIndex(targetIndex, { align: "end", behavior: "smooth" });
    }

    prevMessageCountRef.current = messageCount;
  }, [displayMessages.length, isAtBottom, scrollDirection, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

  // Scroll to latest messages
  const scrollToLatest = useCallback(() => {
    const targetIndex = scrollDirection === "bottom-to-top" ? displayMessages.length - 1 : 0;
    virtualizer.scrollToIndex(targetIndex, { align: "end", behavior: "smooth" });
  }, [scrollDirection, displayMessages.length, virtualizer]);

  // Use the official TanStack Virtual pattern for dynamic sizing
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        position: "relative",
      }}
    >
      {/* Scrollable container */}
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

      {/* Indicator bar - position depends on scroll direction */}
      <div
        style={{
          position: "absolute",
          top: scrollDirection === "top-to-bottom" ? 0 : undefined,
          bottom: scrollDirection === "bottom-to-top" ? 0 : undefined,
          left: 0,
          right: 0,
          height: "1px",
          background: isAtBottom
            ? "linear-gradient(90deg, rgba(59, 130, 246, 0.8) 0%, rgba(99, 160, 255, 0.9) 50%, rgba(59, 130, 246, 0.8) 100%)"
            : "linear-gradient(90deg, rgba(100, 100, 100, 0.3) 0%, rgba(120, 120, 120, 0.4) 50%, rgba(100, 100, 100, 0.3) 100%)",
          boxShadow: isAtBottom ? "0 0 3px 1px rgba(59, 130, 246, 0.6), 0 0 5px 2px rgba(59, 130, 246, 0.3)" : "none",
          transition: "all 0.3s ease",
          pointerEvents: "none",
          zIndex: 10,
        }}
      />

      {/* Scroll to latest button - shows when not at latest edge (with 500ms delay) */}
      {showScrollButton && displayMessages.length > 0 && (
        <button
          type="button"
          onClick={scrollToLatest}
          aria-label="Scroll to latest"
          style={{
            position: "absolute",
            right: "12px",
            top: scrollDirection === "top-to-bottom" ? "12px" : undefined,
            bottom: scrollDirection === "bottom-to-top" ? "12px" : undefined,
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            backgroundColor: "rgba(59, 130, 246, 0.9)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
            transition: "all 0.2s ease",
            zIndex: 20,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 1)";
            e.currentTarget.style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.9)";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          {/* Arrow icon - decorative, button provides semantic meaning */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{
              transform: scrollDirection === "top-to-bottom" ? "rotate(180deg)" : "none",
            }}
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
      )}
    </div>
  );
};
