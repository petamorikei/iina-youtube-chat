import { useEffect, useState } from "react";
import "./App.css";

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
    <div className="chat-container">
      <div className="chat-header">
        <h2>YouTube Chat</h2>
      </div>

      <div className="chat-content">
        {state.loading && (
          <div className="status-message loading">Loading chat data...</div>
        )}

        {state.error && (
          <div className="status-message error">
            <p>{state.error}</p>
            <button onClick={handleRetry}>Retry</button>
          </div>
        )}

        {state.info && <div className="status-message info">{state.info}</div>}

        {!state.loading && !state.error && !state.info && state.messages.length === 0 && (
          <div className="status-message info">No chat messages available</div>
        )}

        {state.messages.length > 0 && (
          <div className="chat-messages">
            {state.messages.map((msg) => (
              <div key={msg.id} className="chat-message">
                <span className="chat-author">{msg.author}</span>
                <span className="chat-text">{msg.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
