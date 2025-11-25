import { css } from "../../styled-system/css";
import type { AuthorBadge, ChatMessage as ChatMessageType, MessageRun, UserPreferences } from "../types";

interface ChatMessageProps {
  message: ChatMessageType;
  preferences: UserPreferences;
}

// Badge icons as SVG components
const BadgeIcon = ({ type, label }: { type: AuthorBadge["type"]; label: string }) => {
  const iconStyle = css({
    width: "14px",
    height: "14px",
    flexShrink: 0,
  });

  switch (type) {
    case "verified":
      return (
        <svg className={iconStyle} viewBox="0 0 24 24" fill="#aaaaaa" aria-label={label} role="img">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      );
    case "owner":
      return (
        <svg className={iconStyle} viewBox="0 0 24 24" fill="#ffd600" aria-label={label} role="img">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      );
    case "moderator":
      return (
        <svg className={iconStyle} viewBox="0 0 24 24" fill="#5e84f1" aria-label={label} role="img">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
        </svg>
      );
    case "member":
      return (
        <svg className={iconStyle} viewBox="0 0 24 24" fill="#2ba640" aria-label={label} role="img">
          <path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2z" />
        </svg>
      );
    default:
      return null;
  }
};

// Author badges component
const AuthorBadges = ({ badges }: { badges?: AuthorBadge[] }) => {
  if (!badges?.length) return null;

  return (
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "4px",
        marginLeft: "4px",
      })}
    >
      {badges.map((badge) =>
        badge.customIcon ? (
          <img
            key={`${badge.type}-${badge.label}`}
            src={badge.customIcon}
            alt={badge.label}
            title={badge.label}
            className={css({
              width: "14px",
              height: "14px",
              borderRadius: "2px",
            })}
          />
        ) : (
          <span key={`${badge.type}-${badge.label}`} title={badge.label}>
            <BadgeIcon type={badge.type} label={badge.label} />
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
const MessageContent = ({ runs, fallbackText }: { runs?: MessageRun[]; fallbackText: string }) => {
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
                className={css({
                  width: "20px",
                  height: "20px",
                  verticalAlign: "middle",
                  margin: "0 1px",
                })}
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
        authorColor: "#60a5fa",
      };
  }
};

export const ChatMessage = ({ message, preferences }: ChatMessageProps) => {
  const style = getMessageStyle(message);
  const isSpecialMessage = ["superchat", "supersticker", "membership", "gift"].includes(message.type);
  const { showTimestamp, showAuthorName, showAuthorPhoto } = preferences;

  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        borderRadius: "0.375rem",
        overflow: "hidden",
      })}
      style={{ backgroundColor: style.backgroundColor }}
    >
      {/* Header for special messages (Super Chat amount, etc.) */}
      {isSpecialMessage && message.amount && (
        <div
          className={css({
            padding: "0.25rem 0.5rem",
            fontSize: "0.75rem",
            fontWeight: 700,
          })}
          style={{ backgroundColor: style.headerColor, color: style.color }}
        >
          {message.amount}
        </div>
      )}

      {/* Main content */}
      <div
        className={css({
          display: "flex",
          padding: "0.5rem 0.75rem",
          gap: "0.5rem",
        })}
      >
        {/* Avatar */}
        {showAuthorPhoto &&
          (message.authorPhoto ? (
            <img
              src={message.authorPhoto}
              alt={message.author}
              className={css({
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                flexShrink: 0,
              })}
            />
          ) : (
            <div
              className={css({
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                backgroundColor: "#444444",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                color: "#888888",
              })}
            >
              {message.author.charAt(0).toUpperCase()}
            </div>
          ))}

        {/* Message body */}
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            minWidth: 0,
            flex: 1,
          })}
        >
          {/* Author line */}
          {(showAuthorName || showTimestamp) && (
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
                flexWrap: "wrap",
              })}
            >
              {showAuthorName && (
                <>
                  <span
                    className={css({
                      fontWeight: 600,
                      fontSize: "0.8125rem",
                    })}
                    style={{ color: style.authorColor }}
                  >
                    {message.author}
                  </span>
                  <AuthorBadges badges={message.authorBadges} />
                </>
              )}
              {showTimestamp && message.timestampText && (
                <span
                  className={css({
                    fontSize: "0.6875rem",
                    color: "#888888",
                    marginLeft: showAuthorName ? "auto" : undefined,
                  })}
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
                fontSize: "0.8125rem",
                lineHeight: 1.4,
                wordBreak: "break-word",
              })}
              style={{ color: style.color }}
            >
              <MessageContent runs={message.messageRuns} fallbackText={message.message} />
            </div>
          )}

          {/* Sticker image */}
          {message.type === "supersticker" && message.stickerUrl && (
            <img
              src={message.stickerUrl}
              alt="Super Sticker"
              className={css({
                maxWidth: "100px",
                maxHeight: "100px",
                objectFit: "contain",
              })}
            />
          )}

          {/* Membership level */}
          {message.type === "membership" && message.membershipLevel && (
            <div
              className={css({
                fontSize: "0.6875rem",
                color: "#c8e6c9",
              })}
            >
              {message.membershipLevel}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
