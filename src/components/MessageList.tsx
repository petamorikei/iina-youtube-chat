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

  // Track if user is at the latest edge (should auto-scroll)
  const [isAtBottom, setIsAtBottom] = useState(true);
  // Delayed state for showing scroll button (prevents flicker during auto-scroll)
  const [showScrollButton, setShowScrollButton] = useState(false);
  // Track the last message ID to detect new messages
  const lastMessageIdRef = useRef<string | null>(null);
  // Track if this is the initial load (to force scroll to latest)
  const isInitialLoadRef = useRef(true);

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

  // Virtual list setup
  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 5,
    measureElement: (element) => {
      return element.getBoundingClientRect().height;
    },
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

  // Auto-scroll when new messages arrive (if user is at the latest edge)
  useEffect(() => {
    if (displayMessages.length === 0) {
      lastMessageIdRef.current = null;
      isInitialLoadRef.current = true;
      return;
    }

    const currentLastId = displayMessages[displayMessages.length - 1]?.id ?? null;
    const hasNewMessages = currentLastId !== lastMessageIdRef.current;
    const isInitialLoad = isInitialLoadRef.current;

    // Update refs before potential early return
    lastMessageIdRef.current = currentLastId;
    if (isInitialLoad) {
      isInitialLoadRef.current = false;
    }

    if (!hasNewMessages && !isInitialLoad) {
      return;
    }

    // Force scroll on initial load, or when user is at the latest edge
    if (!isInitialLoad && !isAtBottom) {
      return;
    }

    // Scroll to the latest message
    const targetIndex = scrollDirection === "top-to-bottom" ? 0 : displayMessages.length - 1;

    // For initial load, wait for virtualizer to render with multiple attempts
    if (isInitialLoad) {
      let attempts = 0;
      const maxAttempts = 10;
      const scrollInterval = setInterval(() => {
        attempts++;
        const totalSize = virtualizer.getTotalSize();

        // Wait until virtualizer has calculated sizes
        if (totalSize > 0 || attempts >= maxAttempts) {
          clearInterval(scrollInterval);
          virtualizer.scrollToIndex(targetIndex, { align: "end" });

          // Additional scroll after items are measured
          setTimeout(() => {
            virtualizer.scrollToIndex(targetIndex, { align: "end" });
          }, 100);
        }
      }, 50);

      return () => clearInterval(scrollInterval);
    }

    // For subsequent updates, use requestAnimationFrame
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(targetIndex, { align: "end" });

      // Double-check scroll position after a short delay (for dynamic heights)
      setTimeout(() => {
        virtualizer.scrollToIndex(targetIndex, { align: "end" });
      }, 50);
    });
  }, [displayMessages, isAtBottom, scrollDirection, virtualizer]);

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

  // Scroll to latest messages (for button click)
  const scrollToLatest = useCallback(() => {
    const targetIndex = scrollDirection === "top-to-bottom" ? 0 : displayMessages.length - 1;
    virtualizer.scrollToIndex(targetIndex, { align: "end" });
    setIsAtBottom(true);
  }, [scrollDirection, displayMessages.length, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();

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
        }}
      >
        {/* Virtual list container */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualItems.map((virtualItem) => {
            const message = displayMessages[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                  paddingBottom: "0.5rem",
                }}
              >
                <ChatMessage message={message} preferences={preferences} />
              </div>
            );
          })}
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
