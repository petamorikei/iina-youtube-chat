import { cva } from "../../styled-system/css";

/**
 * Chat message container recipe
 */
export const messageContainer = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderRadius: "message",
  },
  variants: {
    type: {
      text: {
        backgroundColor: "surface",
      },
      superchat: {
        // Colors are dynamic, handled via style prop
      },
      supersticker: {
        // Colors are dynamic, handled via style prop
      },
      membership: {
        backgroundColor: "message.membership",
      },
      gift: {
        backgroundColor: "message.gift",
      },
      system: {
        backgroundColor: "message.system",
      },
    },
  },
  defaultVariants: {
    type: "text",
  },
});

/**
 * Message header (for superchat amount, etc.)
 */
export const messageHeader = cva({
  base: {
    fontWeight: 700,
  },
});

/**
 * Message body container
 */
export const messageBody = cva({
  base: {
    display: "flex",
  },
});

/**
 * Message content wrapper
 */
export const messageContent = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    flex: 1,
  },
});

/**
 * Author line (name + badges + timestamp)
 */
export const authorLine = cva({
  base: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
  },
});

/**
 * Author name recipe with badge variants
 */
export const authorName = cva({
  base: {
    fontWeight: 600,
  },
  variants: {
    badge: {
      default: {
        color: "author.default",
      },
      owner: {
        color: "author.owner",
        backgroundColor: "author.ownerBg",
        borderRadius: "badge",
      },
      moderator: {
        color: "author.moderator",
      },
      member: {
        color: "author.member",
      },
    },
  },
  defaultVariants: {
    badge: "default",
  },
});

/**
 * Timestamp text
 */
export const timestamp = cva({
  base: {
    color: "text.secondary",
  },
  variants: {
    hasAuthor: {
      true: {
        marginLeft: "auto",
      },
    },
  },
});

/**
 * Message text content
 */
export const messageText = cva({
  base: {
    lineHeight: 1.4,
    wordBreak: "break-word",
  },
  variants: {
    type: {
      text: {
        color: "text.primary",
      },
      superchat: {
        // Dynamic color
      },
      membership: {
        color: "white",
      },
      gift: {
        color: "white",
      },
      system: {
        color: "text.muted",
      },
    },
  },
  defaultVariants: {
    type: "text",
  },
});

/**
 * Badges container
 */
export const badgesContainer = cva({
  base: {
    display: "flex",
    alignItems: "center",
  },
});

/**
 * Avatar container
 */
export const avatar = cva({
  base: {
    borderRadius: "avatar",
    flexShrink: 0,
  },
  variants: {
    placeholder: {
      true: {
        backgroundColor: "#444444",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "text.secondary",
      },
    },
  },
});

/**
 * Membership level text
 */
export const membershipLevel = cva({
  base: {
    color: "#c8e6c9",
  },
});

/**
 * Sticker image
 */
export const stickerImage = cva({
  base: {
    objectFit: "contain",
  },
});
