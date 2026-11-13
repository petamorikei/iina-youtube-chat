import { describe, expect, test } from "vitest";
import { buildWatchUrl, extractVideoId, isYouTubeUrl } from "../plugin/youtubeUrl";

const ID = "dQw4w9WgXcQ";

describe("isYouTubeUrl", () => {
  test.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
  ])("accepts %s", (url) => {
    expect(isYouTubeUrl(url)).toBe(true);
  });

  test.each([
    "https://vimeo.com/123",
    `https://www.youtube.com.evil.example/watch?v=${ID}`,
    `https://notyoutube.com/watch?v=${ID}`,
    "/Users/me/Movies/clip.mp4",
  ])("rejects %s", (url) => {
    expect(isYouTubeUrl(url)).toBe(false);
  });
});

describe("extractVideoId", () => {
  test.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&t=42s`,
    `https://www.youtube.com/watch?list=PL123&index=2&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?t=10`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://music.youtube.com/watch?v=${ID}&list=RDAMVM`,
  ])("finds the ID in %s", (url) => {
    expect(extractVideoId(url)).toBe(ID);
  });

  test.each([
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/@channel",
    `https://www.youtube.com/watch?v=${ID}X`, // 12 characters: not a video ID
    `https://vimeo.com/watch?v=${ID}`,
  ])("returns null for %s", (url) => {
    expect(extractVideoId(url)).toBeNull();
  });
});

test("buildWatchUrl drops everything but the video ID", () => {
  expect(buildWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
});
