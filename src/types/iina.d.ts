// IINA WebView API type definitions
// This is available in the WebView context (different from plugin entry context)

interface IINAWebViewAPI {
  /**
   * Post a message to the plugin entry point
   */
  postMessage(name: string, data: unknown): void;

  /**
   * Register a listener for messages from the plugin entry point
   */
  onMessage(name: string, callback: (data: unknown) => void): void;
}

declare const iina: IINAWebViewAPI;
