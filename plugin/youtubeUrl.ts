/**
 * YouTube URL helpers
 */

const YOUTUBE_URL_PATTERN = /^https?:\/\/((www|m|music)\.)?(youtube\.com|youtu\.be)\//;

// YouTube video IDs are 11 characters of [A-Za-z0-9_-]
const VIDEO_ID_PATTERNS = [
  /^https?:\/\/[^/]*youtube\.com\/watch\?(?:[^#]*&)?v=([\w-]{11})(?![\w-])/,
  /^https?:\/\/youtu\.be\/([\w-]{11})(?![\w-])/,
  /^https?:\/\/[^/]*youtube\.com\/(?:embed|live|shorts|v)\/([\w-]{11})(?![\w-])/,
];

/**
 * Check if the URL is a YouTube URL
 */
export const isYouTubeUrl = (url: string): boolean => YOUTUBE_URL_PATTERN.test(url);

/**
 * Extract video ID from a YouTube URL
 */
export const extractVideoId = (url: string): string | null => {
  if (!isYouTubeUrl(url)) {
    return null;
  }

  for (const pattern of VIDEO_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
};

/**
 * Build the canonical watch URL for a video ID (drops playlist and other parameters)
 */
export const buildWatchUrl = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`;
