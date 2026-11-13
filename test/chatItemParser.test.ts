import { describe, expect, test } from "vitest";
import { type ChatItem, ChatItemParser, formatTimestampUsec } from "../plugin/chatItemParser";
import { ChatMessageSchema } from "../src/schemas";

const author = {
  authorName: { simpleText: "Alice" },
  authorPhoto: {
    thumbnails: [
      { url: "https://example.com/32.png", width: 32 },
      { url: "https://example.com/64.png", width: 64 },
    ],
  },
  authorExternalChannelId: "UC123",
};

const parser = () => new ChatItemParser("test", (r) => r.timestampText?.simpleText);

/** Parses one item and checks the result against the schema the chat UI validates with. */
const parseValid = (item: ChatItem, timestamp = 12.5) => {
  const message = parser().parseItem(item, timestamp);
  expect(message).not.toBeNull();
  return ChatMessageSchema.parse(message);
};

describe("ChatItemParser", () => {
  test("text message with emoji runs, badges and the largest author photo", () => {
    const m = parseValid({
      liveChatTextMessageRenderer: {
        id: "msg-1",
        ...author,
        message: {
          runs: [
            { text: "Hello " },
            {
              emoji: {
                emojiId: "UCx/heart",
                shortcuts: [":heart:"],
                image: { thumbnails: [{ url: "https://example.com/heart.png" }] },
                isCustomEmoji: true,
              },
            },
          ],
        },
        authorBadges: [
          { liveChatAuthorBadgeRenderer: { icon: { iconType: "OWNER" }, tooltip: "Owner" } },
          { liveChatAuthorBadgeRenderer: { icon: { iconType: "MODERATOR" }, tooltip: "Moderator" } },
          {
            liveChatAuthorBadgeRenderer: {
              tooltip: "Member (1 year)",
              customThumbnail: { thumbnails: [{ url: "https://example.com/badge.png", width: 16 }] },
            },
          },
          { liveChatAuthorBadgeRenderer: { icon: { iconType: "UNKNOWN_BADGE" }, tooltip: "?" } },
        ],
        timestampText: { simpleText: "1:48:06" },
      },
    });
    expect(m).toMatchObject({
      id: "msg-1",
      type: "text",
      timestamp: 12.5,
      author: "Alice",
      authorPhoto: "https://example.com/64.png",
      authorChannelId: "UC123",
      message: "Hello :heart:",
      timestampText: "1:48:06",
    });
    expect(m.messageRuns).toEqual([
      { type: "text", text: "Hello " },
      {
        type: "emoji",
        emoji: { emojiId: "UCx/heart", shortcut: ":heart:", imageUrl: "https://example.com/heart.png", isCustom: true },
      },
    ]);
    expect(m.authorBadges).toEqual([
      { type: "owner", label: "Owner", customIcon: undefined },
      { type: "moderator", label: "Moderator", customIcon: undefined },
      { type: "member", label: "Member (1 year)", customIcon: "https://example.com/badge.png" },
    ]);
  });

  test("a text message without content is dropped", () => {
    expect(parser().parseItem({ liveChatTextMessageRenderer: { id: "x", ...author, message: { runs: [] } } }, 0)).toBe(
      null,
    );
  });

  test("Super Chat: amount and ARGB colours converted to #RRGGBBAA", () => {
    const m = parseValid({
      liveChatPaidMessageRenderer: {
        id: "sc-1",
        ...author,
        purchaseAmountText: { simpleText: "¥1,000" },
        headerBackgroundColor: 0xff1e88e5,
        bodyBackgroundColor: 0x80ffca28,
      },
    });
    expect(m).toMatchObject({ type: "superchat", amount: "¥1,000", message: "(Super Chat)" });
    expect(m.colors).toEqual({
      headerBackgroundColor: "#1e88e5ff",
      headerTextColor: undefined,
      bodyBackgroundColor: "#ffca2880",
      bodyTextColor: undefined,
      authorNameTextColor: undefined,
    });
  });

  test("Super Sticker", () => {
    const m = parseValid({
      liveChatPaidStickerRenderer: {
        id: "st-1",
        ...author,
        purchaseAmountText: { simpleText: "$2.00" },
        sticker: { thumbnails: [{ url: "https://example.com/sticker.png", width: 80 }] },
        backgroundColor: 0xff00e5ff,
      },
    });
    expect(m).toMatchObject({ type: "supersticker", amount: "$2.00", stickerUrl: "https://example.com/sticker.png" });
    expect(m.colors?.bodyBackgroundColor).toBe("#00e5ffff");
  });

  test("membership: the header becomes the level, and the message falls back to it", () => {
    const m = parseValid({
      liveChatMembershipItemRenderer: {
        id: "mem-1",
        ...author,
        headerSubtext: { runs: [{ text: "Welcome to Gold!" }] },
      },
    });
    expect(m).toMatchObject({ type: "membership", message: "Welcome to Gold!", membershipLevel: "Welcome to Gold!" });
  });

  test("gift membership", () => {
    const m = parseValid({
      liveChatSponsorshipsGiftPurchaseAnnouncementRenderer: {
        id: "gift-1",
        ...author,
        header: { liveChatSponsorshipsHeaderRenderer: { primaryText: { runs: [{ text: "Gifted 5 memberships" }] } } },
      },
    });
    expect(m).toMatchObject({ type: "gift", message: "Gifted 5 memberships" });
  });

  test("system messages are attributed to YouTube; empty ones are dropped", () => {
    const m = parseValid({
      liveChatViewerEngagementMessageRenderer: { id: "sys-1", message: { runs: [{ text: "Welcome to live chat!" }] } },
    });
    expect(m).toMatchObject({ type: "system", author: "YouTube", message: "Welcome to live chat!" });
    expect(parser().parseItem({ liveChatViewerEngagementMessageRenderer: { id: "sys-2" } }, 0)).toBeNull();
  });

  test("unknown items are ignored", () => {
    expect(parser().parseItem({} as ChatItem, 0)).toBeNull();
  });

  test("missing IDs fall back to <prefix>-<index>; reset() restarts the index", () => {
    const p = parser();
    const item = { liveChatTextMessageRenderer: { id: "", ...author, message: { runs: [{ text: "hi" }] } } };
    expect(p.parseItem(item, 0)?.id).toBe("test-0");
    expect(p.parseItem(item, 0)?.id).toBe("test-1");
    p.reset();
    expect(p.parseItem(item, 0)?.id).toBe("test-0");
  });

  test("a missing author name becomes Unknown", () => {
    const m = parseValid({ liveChatTextMessageRenderer: { id: "a", message: { runs: [{ text: "hi" }] } } });
    expect(m.author).toBe("Unknown");
  });
});

describe("formatTimestampUsec", () => {
  test("formats microseconds as local HH:MM:SS", () => {
    const usec = Date.UTC(2026, 10, 13, 12, 34, 56) * 1000;
    const local = new Date(usec / 1000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    expect(formatTimestampUsec(String(usec))).toBe(
      `${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`,
    );
  });

  test.each([undefined, "", "not-a-number"])("returns undefined for %j", (value) => {
    expect(formatTimestampUsec(value)).toBeUndefined();
  });
});
