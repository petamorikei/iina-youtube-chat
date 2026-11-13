import { retryButton, spinner, statusDetail, statusMessage, statusText } from "../recipes";
import type { StatusMessageType } from "../types";
import { Box } from "./ui";

interface StatusMessageProps {
  type: StatusMessageType;
  message: string;
  detail?: string | null;
  compact?: boolean;
  onRetry?: () => void;
}

const LoadingSpinner = () => <Box className={spinner()} />;

export const StatusMessage = ({ type, message, detail, compact = false, onRetry }: StatusMessageProps) => {
  return (
    <Box className={statusMessage({ type, compact })}>
      {type === "loading" && <LoadingSpinner />}
      <p className={statusText({ animated: type === "loading" })}>{message}</p>
      {detail && <p className={statusDetail()}>{detail}</p>}
      {(type === "error" || type === "warning") && onRetry && (
        <button type="button" onClick={onRetry} className={retryButton()}>
          Retry
        </button>
      )}
    </Box>
  );
};
