import { memo } from "react";
import { css } from "../../styled-system/css";
import type { AuthorBadge, ChatMessage as ChatMessageType, MessageRun, UserPreferences } from "../types";

interface ChatMessageProps {
  message: ChatMessageType;
  preferences: UserPreferences;
}

// Badge icons as SVG components
const BadgeIcon = ({ type, label, size }: { type: AuthorBadge["type"]; label: string; size: string }) => {
  const iconStyle = { width: size, height: size, flexShrink: 0 };

  switch (type) {
    case "verified":
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="#aaaaaa" aria-label={label} role="img">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      );
    case "owner":
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="#ffd600" aria-label={label} role="img">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      );
    case "moderator":
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="#5e84f1" aria-label={label} role="img">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
        </svg>
      );
    case "member":
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="#2ba640" aria-label={label} role="img">
          <path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2z" />
        </svg>
      );
    default:
      return null;
  }
};

// Author badges component
const AuthorBadges = ({ badges, iconSize, gap }: { badges?: AuthorBadge[]; iconSize: string; gap: string }) => {
  if (!badges?.length) return null;

  return (
    <div
      className={css({
        display: "flex",
        alignItems: "center",
      })}
      style={{ gap, marginLeft: gap }}
    >
      {badges.map((badge) =>
        badge.customIcon ? (
          <img
            key={`${badge.type}-${badge.label}`}
            src={badge.customIcon}
            alt={badge.label}
            title={badge.label}
            style={{ width: iconSize, height: iconSize, borderRadius: "2px" }}
          />
        ) : (
          <span key={`${badge.type}-${badge.label}`} title={badge.label}>
            <BadgeIcon type={badge.type} label={badge.label} size={iconSize} />
          </span>
        ),
      )}
    </div>
  );
};

// Generate a stable key for message runs
const getRunKey = (run: MessageRun, index: number): string => {
  if (run.type === "text") {
    // Use first 20 chars of text + index for uniqueness
    return `text-${index}-${run.text.slice(0, 20)}`;
  }
  if (run.type === "emoji") {
    return `emoji-${index}-${run.emoji.emojiId}`;
  }
  return `run-${index}`;
};

// Message content with emoji support
const MessageContent = ({
  runs,
  fallbackText,
  emojiSize,
}: {
  runs?: MessageRun[];
  fallbackText: string;
  emojiSize: string;
}) => {
  if (!runs?.length) {
    return <>{fallbackText}</>;
  }

  return (
    <>
      {runs.map((run, index) => {
        const key = getRunKey(run, index);
        if (run.type === "text") {
          return <span key={key}>{run.text}</span>;
        }
        if (run.type === "emoji") {
          const emoji = run.emoji;
          // Use image for custom emojis, otherwise use text
          if (emoji.imageUrl && emoji.isCustom) {
            return (
              <img
                key={key}
                src={emoji.imageUrl}
                alt={emoji.shortcut || emoji.emojiId}
                title={emoji.shortcut || emoji.emojiId}
                style={{
                  width: emojiSize,
                  height: emojiSize,
                  verticalAlign: "middle",
                  margin: "0 1px",
                }}
              />
            );
          }
          // For standard Unicode emojis, just render the text
          return <span key={key}>{emoji.shortcut || emoji.emojiId}</span>;
        }
        return null;
      })}
    </>
  );
};

// Get author style based on badges
const getAuthorStyle = (badges?: AuthorBadge[]): { color: string; backgroundColor?: string } => {
  // Default gray for regular users (good contrast against #242424 background)
  const defaultGray = "#a0a0a0";

  if (!badges?.length) {
    return { color: defaultGray };
  }

  // Check badges in priority order: owner > moderator > member
  const hasOwner = badges.some((b) => b.type === "owner");
  if (hasOwner) {
    return { color: "#000000", backgroundColor: "#ffd600" }; // Yellow background, black text
  }

  const hasModerator = badges.some((b) => b.type === "moderator");
  if (hasModerator) {
    return { color: "#5e84f1" }; // Blue (moderator color)
  }

  const hasMember = badges.some((b) => b.type === "member");
  if (hasMember) {
    return { color: "#2ba640" }; // Green
  }

  return { color: defaultGray }; // Default gray (e.g., verified only)
};

// Get background color based on message type
const getMessageStyle = (message: ChatMessageType) => {
  switch (message.type) {
    case "superchat":
      return {
        backgroundColor: message.colors?.bodyBackgroundColor || "#ffca28",
        color: message.colors?.bodyTextColor || "#000000",
        headerColor: message.colors?.headerBackgroundColor || "#ffb300",
        authorColor: message.colors?.authorNameTextColor || "#000000",
      };
    case "supersticker":
      return {
        backgroundColor: message.colors?.bodyBackgroundColor || "#ffca28",
        color: "#ffffff",
        headerColor: message.colors?.bodyBackgroundColor || "#ffb300",
        authorColor: message.colors?.authorNameTextColor || "#000000",
      };
    case "membership":
      return {
        backgroundColor: "#0f9d58",
        color: "#ffffff",
        headerColor: "#0b8043",
        authorColor: "#ffffff",
      };
    case "gift":
      return {
        backgroundColor: "#7b1fa2",
        color: "#ffffff",
        headerColor: "#6a1b9a",
        authorColor: "#ffffff",
      };
    case "system":
      return {
        backgroundColor: "#333333",
        color: "#aaaaaa",
        headerColor: "#333333",
        authorColor: "#888888",
      };
    default:
      return {
        backgroundColor: "#242424",
        color: "#e5e7eb",
        headerColor: "#242424",
        authorColor: "#60a5fa", // Will be overridden by getAuthorStyle
      };
  }
};

export const ChatMessage = memo(({ message, preferences }: ChatMessageProps) => {
  const style = getMessageStyle(message);
  const isSpecialMessage = ["superchat", "supersticker", "membership", "gift"].includes(message.type);
  const { showTimestamp, showAuthorName, showAuthorPhoto, fontScale } = preferences;

  // Scale factor (1.0 at 100%)
  const scale = fontScale / 100;

  // Helper functions to scale sizes
  const scaledRem = (baseRem: number) => `${baseRem * scale}rem`;
  const scaledPx = (basePx: number) => `${basePx * scale}px`;

  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      })}
      style={{ backgroundColor: style.backgroundColor, borderRadius: scaledRem(0.375) }}
    >
      {/* Header for special messages (Super Chat amount, etc.) */}
      {isSpecialMessage && message.amount && (
        <div
          className={css({
            fontWeight: 700,
          })}
          style={{
            backgroundColor: style.headerColor,
            color: style.color,
            fontSize: scaledRem(0.75),
            padding: `${scaledRem(0.25)} ${scaledRem(0.5)}`,
          }}
        >
          {message.amount}
        </div>
      )}

      {/* Main content */}
      <div
        className={css({
          display: "flex",
        })}
        style={{
          padding: `${scaledRem(0.5)} ${scaledRem(0.75)}`,
          gap: scaledRem(0.5),
        }}
      >
        {/* Avatar */}
        {showAuthorPhoto &&
          (message.authorPhoto ? (
            <img
              src={message.authorPhoto}
              alt={message.author}
              className={css({
                borderRadius: "50%",
                flexShrink: 0,
              })}
              style={{ width: scaledPx(32), height: scaledPx(32) }}
            />
          ) : (
            <div
              className={css({
                borderRadius: "50%",
                backgroundColor: "#444444",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#888888",
              })}
              style={{ width: scaledPx(32), height: scaledPx(32), fontSize: scaledRem(0.75) }}
            >
              {message.author.charAt(0).toUpperCase()}
            </div>
          ))}

        {/* Message body */}
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            flex: 1,
          })}
          style={{ gap: scaledRem(0.25) }}
        >
          {/* Author line */}
          {(showAuthorName || showTimestamp) && (
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
              })}
              style={{ gap: scaledRem(0.25) }}
            >
              {showAuthorName && (
                <>
                  {(() => {
                    // Use badge-based styling for regular text messages only
                    const authorStyle =
                      message.type === "text" ? getAuthorStyle(message.authorBadges) : { color: style.authorColor };
                    return (
                      <span
                        className={css({
                          fontWeight: 600,
                        })}
                        style={{
                          color: authorStyle.color,
                          backgroundColor: authorStyle.backgroundColor,
                          fontSize: scaledRem(0.8125),
                          padding: authorStyle.backgroundColor ? `0 ${scaledPx(4)}` : undefined,
                          borderRadius: authorStyle.backgroundColor ? scaledPx(2) : undefined,
                        }}
                      >
                        {message.author}
                      </span>
                    );
                  })()}
                  <AuthorBadges badges={message.authorBadges} iconSize={scaledPx(14)} gap={scaledPx(4)} />
                </>
              )}
              {showTimestamp && message.timestampText && (
                <span
                  className={css({
                    color: "#888888",
                    marginLeft: showAuthorName ? "auto" : undefined,
                  })}
                  style={{ fontSize: scaledRem(0.6875) }}
                >
                  {message.timestampText}
                </span>
              )}
            </div>
          )}

          {/* Message text */}
          {message.type !== "supersticker" && (
            <div
              className={css({
                lineHeight: 1.4,
                wordBreak: "break-word",
              })}
              style={{ color: style.color, fontSize: scaledRem(0.8125) }}
            >
              <MessageContent runs={message.messageRuns} fallbackText={message.message} emojiSize={scaledPx(20)} />
            </div>
          )}

          {/* Sticker image */}
          {message.type === "supersticker" && message.stickerUrl && (
            <img
              src={message.stickerUrl}
              alt="Super Sticker"
              className={css({
                objectFit: "contain",
              })}
              style={{ maxWidth: scaledPx(100), maxHeight: scaledPx(100) }}
            />
          )}

          {/* Membership level */}
          {message.type === "membership" && message.membershipLevel && (
            <div
              className={css({
                color: "#c8e6c9",
              })}
              style={{ fontSize: scaledRem(0.6875) }}
            >
              {message.membershipLevel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
