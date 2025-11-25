// IINA WebView API type definitions
// This is available in the WebView context (different from plugin entry context)

interface IINAWebViewAPI {
  /**
   * Post a message to the plugin entry point
   */
  postMessage(name: string, data: unknown): void;

  /**
   * Register a message handler for a specific message type
   * Multiple handlers can be registered for different message types
   */
  onMessage(name: string, callback: (data: unknown) => void): void;
}

declare const iina: IINAWebViewAPI;
