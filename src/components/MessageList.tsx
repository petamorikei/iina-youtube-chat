import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  iconButton,
  indicatorBar,
  messageListRoot,
  scrollButtonContainer,
  scrollContainer,
  virtualItem,
  virtualListContainer,
} from "../recipes";
import type { ChatMessage as ChatMessageType, UserPreferences } from "../types";
import { ChatMessage } from "./ChatMessage";
import { Box } from "./ui";

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
    <Box className={messageListRoot()}>
      {/* Scrollable container */}
      <Box ref={parentRef} className={scrollContainer()}>
        {/* Virtual list container */}
        <Box className={virtualListContainer()} style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualItems.map((virtualItem_) => {
            const message = displayMessages[virtualItem_.index];
            return (
              <Box
                key={virtualItem_.key}
                data-index={virtualItem_.index}
                ref={virtualizer.measureElement}
                className={virtualItem()}
                style={{ transform: `translateY(${virtualItem_.start}px)` }}
              >
                <ChatMessage message={message} preferences={preferences} />
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Indicator bar - position depends on scroll direction */}
      <Box
        className={indicatorBar({
          position: scrollDirection === "top-to-bottom" ? "top" : "bottom",
          active: isAtBottom,
        })}
      />

      {/* Scroll to latest button - shows when not at latest edge (with 500ms delay) */}
      {showScrollButton && displayMessages.length > 0 && (
        <Box
          className={scrollButtonContainer({
            position: scrollDirection === "top-to-bottom" ? "top" : "bottom",
          })}
        >
          <button
            type="button"
            onClick={scrollToLatest}
            aria-label="Scroll to latest"
            className={iconButton({ variant: "scroll" })}
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
        </Box>
      )}
    </Box>
  );
};
