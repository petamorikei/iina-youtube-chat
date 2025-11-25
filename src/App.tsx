import { css } from "../styled-system/css";
import { ChatHeader } from "./components/ChatHeader";
import { MessageList } from "./components/MessageList";
import { StatusMessage } from "./components/StatusMessage";
import { useIINAMessages } from "./hooks/useIINAMessages";

const App = () => {
  const { state, handleRetry } = useIINAMessages();

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
      <ChatHeader />

      {/* Debug info panel - temporarily hidden */}

      <div
        className={css({
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
        })}
      >
        {state.loading && <StatusMessage type="loading" message="Loading chat data..." />}

        {state.error && <StatusMessage type="error" message={state.error} onRetry={handleRetry} />}

        {state.info && <StatusMessage type="info" message={state.info} />}

        {!state.loading && !state.error && !state.info && state.messages.length === 0 && (
          <StatusMessage type="info" message="No chat messages available" />
        )}

        {state.messages.length > 0 && <MessageList messages={state.messages} currentPosition={state.currentPosition} />}
      </div>
    </div>
  );
};

export default App;
