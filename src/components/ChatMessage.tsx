import { memo } from "react";
import { css } from "../../styled-system/css";
import {
  authorLine,
  authorName,
  avatar,
  badgesContainer,
  membershipLevel,
  messageBody,
  messageContainer,
  messageContent,
  messageHeader,
  messageText,
  stickerImage,
  timestamp,
} from "../recipes";
import type { AuthorBadge, ChatMessage as ChatMessageType, MessageRun, UserPreferences } from "../types";
import { Box, Flex } from "./ui";

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
        <svg style={iconStyle} viewBox="0 0 24 24" fill="token(colors.badge.verified)" aria-label={label} role="img">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      );
    case "owner":
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="token(colors.badge.owner)" aria-label={label} role="img">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
      );
    case "moderator":
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="token(colors.badge.moderator)" aria-label={label} role="img">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
        </svg>
      );
    case "member":
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="token(colors.badge.member)" aria-label={label} role="img">
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
    <Flex className={badgesContainer()} style={{ gap, marginLeft: gap }}>
      {badges.map((badge) =>
        badge.customIcon ? (
          <img
            key={`${badge.type}-${badge.label}`}
            src={badge.customIcon}
            alt={badge.label}
            title={badge.label}
            className={css({ borderRadius: "badge" })}
            style={{ width: iconSize, height: iconSize }}
          />
        ) : (
          <span key={`${badge.type}-${badge.label}`} title={badge.label}>
            <BadgeIcon type={badge.type} label={badge.label} size={iconSize} />
          </span>
        ),
      )}
    </Flex>
  );
};

// Generate a stable key for message runs
const getRunKey = (run: MessageRun, index: number): string => {
  if (run.type === "text") {
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
          return <span key={key}>{emoji.shortcut || emoji.emojiId}</span>;
        }
        return null;
      })}
    </>
  );
};

// Get author badge variant
const getAuthorBadgeVariant = (badges?: AuthorBadge[]): "default" | "owner" | "moderator" | "member" => {
  if (!badges?.length) return "default";

  if (badges.some((b) => b.type === "owner")) return "owner";
  if (badges.some((b) => b.type === "moderator")) return "moderator";
  if (badges.some((b) => b.type === "member")) return "member";

  return "default";
};

// Get message style based on type (for dynamic colors)
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
        backgroundColor: undefined, // Use recipe
        color: "#ffffff",
        headerColor: undefined,
        authorColor: "#ffffff",
      };
    case "gift":
      return {
        backgroundColor: undefined, // Use recipe
        color: "#ffffff",
        headerColor: undefined,
        authorColor: "#ffffff",
      };
    case "system":
      return {
        backgroundColor: undefined, // Use recipe
        color: undefined,
        headerColor: undefined,
        authorColor: "#888888",
      };
    default:
      return {
        backgroundColor: undefined, // Use recipe
        color: undefined,
        headerColor: undefined,
        authorColor: undefined, // Use badge-based styling
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

  // Get author name styling
  const badgeVariant = message.type === "text" ? getAuthorBadgeVariant(message.authorBadges) : "default";
  const authorNameStyle =
    message.type === "text" && !style.authorColor
      ? {} // Use recipe styling
      : { color: style.authorColor };

  return (
    <Box
      className={messageContainer({ type: message.type as "text" | "superchat" | "membership" | "gift" | "system" })}
      style={{
        backgroundColor: style.backgroundColor,
        borderRadius: scaledRem(0.375),
      }}
    >
      {/* Header for special messages (Super Chat amount, etc.) */}
      {isSpecialMessage && message.amount && (
        <Box
          className={messageHeader()}
          style={{
            backgroundColor: style.headerColor,
            color: style.color,
            fontSize: scaledRem(0.75),
            padding: `${scaledRem(0.25)} ${scaledRem(0.5)}`,
          }}
        >
          {message.amount}
        </Box>
      )}

      {/* Main content */}
      <Flex
        className={messageBody()}
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
              className={avatar()}
              style={{ width: scaledPx(32), height: scaledPx(32) }}
            />
          ) : (
            <Box
              className={avatar({ placeholder: true })}
              style={{ width: scaledPx(32), height: scaledPx(32), fontSize: scaledRem(0.75) }}
            >
              {message.author.charAt(0).toUpperCase()}
            </Box>
          ))}

        {/* Message body */}
        <Flex className={messageContent()} style={{ gap: scaledRem(0.25) }}>
          {/* Author line */}
          {(showAuthorName || showTimestamp) && (
            <Flex className={authorLine()} style={{ gap: scaledRem(0.25) }}>
              {showAuthorName && (
                <>
                  <span
                    className={authorName({ badge: badgeVariant })}
                    style={{
                      ...authorNameStyle,
                      fontSize: scaledRem(0.8125),
                      padding: badgeVariant === "owner" ? `0 ${scaledPx(4)}` : undefined,
                    }}
                  >
                    {message.author}
                  </span>
                  <AuthorBadges badges={message.authorBadges} iconSize={scaledPx(14)} gap={scaledPx(4)} />
                </>
              )}
              {showTimestamp && message.timestampText && (
                <span className={timestamp({ hasAuthor: showAuthorName })} style={{ fontSize: scaledRem(0.6875) }}>
                  {message.timestampText}
                </span>
              )}
            </Flex>
          )}

          {/* Message text */}
          {message.type !== "supersticker" && (
            <Box
              className={messageText({ type: message.type as "text" | "membership" | "gift" | "system" })}
              style={{ color: style.color, fontSize: scaledRem(0.8125) }}
            >
              <MessageContent runs={message.messageRuns} fallbackText={message.message} emojiSize={scaledPx(20)} />
            </Box>
          )}

          {/* Sticker image */}
          {message.type === "supersticker" && message.stickerUrl && (
            <img
              src={message.stickerUrl}
              alt="Super Sticker"
              className={stickerImage()}
              style={{ maxWidth: scaledPx(100), maxHeight: scaledPx(100) }}
            />
          )}

          {/* Membership level */}
          {message.type === "membership" && message.membershipLevel && (
            <Box className={membershipLevel()} style={{ fontSize: scaledRem(0.6875) }}>
              {message.membershipLevel}
            </Box>
          )}
        </Flex>
      </Flex>
    </Box>
  );
});
