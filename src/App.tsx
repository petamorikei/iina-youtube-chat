import { useEffect, useState } from "react";
import { css } from "../styled-system/css";

interface ChatMessage {
  id: string;
  author: string;
  message: string;
  timestamp: number;
}

interface AppState {
  loading: boolean;
  error: string | null;
  info: string | null;
  messages: ChatMessage[];
}

const App = () => {
  const [state, setState] = useState<AppState>({
    loading: false,
    error: null,
    info: null,
    messages: [],
  });

  useEffect(() => {
    // Register message handlers from plugin entry point
    iina.onMessage("chat-loading", (data: unknown) => {
      const { loading } = data as { loading: boolean };
      setState((prev) => ({ ...prev, loading, error: null, info: null }));
    });

    iina.onMessage("chat-data", (data: unknown) => {
      const { messages } = data as { messages: ChatMessage[] };
      setState((prev) => ({ ...prev, messages, error: null, info: null }));
    });

    iina.onMessage("chat-error", (data: unknown) => {
      const { message } = data as { message: string };
      setState((prev) => ({ ...prev, error: message, loading: false }));
    });

    iina.onMessage("chat-info", (data: unknown) => {
      const { message } = data as { message: string };
      setState((prev) => ({ ...prev, info: message, loading: false }));
    });
  }, []);

  const handleRetry = () => {
    iina.postMessage("retry-fetch", {});
  };

  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: "#1a1a1a",
        color: "#ffffff",
      })}
    >
      <div
        className={css({
          padding: "1rem",
          borderBottom: "1px solid #333",
          backgroundColor: "#242424",
        })}
      >
        <h2
          className={css({
            margin: 0,
            fontSize: "1.2rem",
            fontWeight: 600,
          })}
        >
          YouTube Chat
        </h2>
      </div>

      <div
        className={css({
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
        })}
      >
        {state.loading && (
          <div
            className={css({
              padding: "1rem",
              borderRadius: "0.5rem",
              textAlign: "center",
              backgroundColor: "rgba(59, 130, 246, 0.1)",
              color: "#60a5fa",
            })}
          >
            Loading chat data...
          </div>
        )}

        {state.error && (
          <div
            className={css({
              padding: "1rem",
              borderRadius: "0.5rem",
              textAlign: "center",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              color: "#f87171",
            })}
          >
            <p>{state.error}</p>
            <button
              onClick={handleRetry}
              className={css({
                marginTop: "0.5rem",
                padding: "0.5rem 1rem",
                backgroundColor: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "0.25rem",
                cursor: "pointer",
                _hover: {
                  backgroundColor: "#b91c1c",
                },
              })}
            >
              Retry
            </button>
          </div>
        )}

        {state.info && (
          <div
            className={css({
              padding: "1rem",
              borderRadius: "0.5rem",
              textAlign: "center",
              backgroundColor: "rgba(156, 163, 175, 0.1)",
              color: "#9ca3af",
            })}
          >
            {state.info}
          </div>
        )}

        {!state.loading && !state.error && !state.info && state.messages.length === 0 && (
          <div
            className={css({
              padding: "1rem",
              borderRadius: "0.5rem",
              textAlign: "center",
              backgroundColor: "rgba(156, 163, 175, 0.1)",
              color: "#9ca3af",
            })}
          >
            No chat messages available
          </div>
        )}

        {state.messages.length > 0 && (
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            })}
          >
            {state.messages.map((msg) => (
              <div
                key={msg.id}
                className={css({
                  display: "flex",
                  flexDirection: "column",
                  padding: "0.75rem",
                  backgroundColor: "#242424",
                  borderRadius: "0.375rem",
                  gap: "0.25rem",
                })}
              >
                <span
                  className={css({
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    color: "#60a5fa",
                  })}
                >
                  {msg.author}
                </span>
                <span
                  className={css({
                    fontSize: "0.875rem",
                    lineHeight: 1.5,
                    color: "#e5e7eb",
                  })}
                >
                  {msg.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
