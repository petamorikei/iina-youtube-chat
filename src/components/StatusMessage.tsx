import { retryButton, spinner, statusMessage, statusText } from "../recipes";
import type { StatusMessageType } from "../types";
import { Box } from "./ui";

interface StatusMessageProps {
  type: StatusMessageType;
  message: string;
  onRetry?: () => void;
}

const LoadingSpinner = () => <Box className={spinner()} />;

export const StatusMessage = ({ type, message, onRetry }: StatusMessageProps) => {
  return (
    <Box className={statusMessage({ type })}>
      {type === "loading" && <LoadingSpinner />}
      <p className={statusText({ animated: type === "loading" })}>{message}</p>
      {type === "error" && onRetry && (
        <button type="button" onClick={onRetry} className={retryButton()}>
          Retry
        </button>
      )}
    </Box>
  );
};
