import { MessageList } from "./components/MessageList";
import { StatusMessage } from "./components/StatusMessage";
import { Box, Flex } from "./components/ui";
import { useIINAMessages } from "./hooks/useIINAMessages";

const App = () => {
  const { state, handleRetry } = useIINAMessages();

  return (
    <Flex direction="column" height="100vh" backgroundColor="background" color="white">
      <Flex direction="column" gap="0.5rem" flex="1" minHeight="0" overflow="hidden" padding="1rem">
        {state.loading && <StatusMessage type="loading" message={state.progress?.message || "Loading chat data..."} />}

        {state.error && (
          <StatusMessage type="error" message={state.error} detail={state.errorDetail} onRetry={handleRetry} />
        )}

        {state.info && <StatusMessage type="info" message={state.info} />}

        {!state.loading && !state.error && !state.info && state.messages.length === 0 && (
          <StatusMessage type="info" message="No chat messages available" />
        )}

        {state.warning && (
          <StatusMessage
            type="warning"
            compact
            message={state.warning}
            detail={state.warningDetail}
            onRetry={handleRetry}
          />
        )}

        {state.messages.length > 0 && (
          <Box flex="1" minHeight="0">
            <MessageList
              messages={state.messages}
              currentPosition={state.currentPosition}
              preferences={state.preferences}
            />
          </Box>
        )}
      </Flex>
    </Flex>
  );
};

export default App;
