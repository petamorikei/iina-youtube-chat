import { css } from "../../styled-system/css";
import type { StatusMessageType } from "../types";

interface StatusMessageProps {
  type: StatusMessageType;
  message: string;
  onRetry?: () => void;
}

export const StatusMessage = ({ type, message, onRetry }: StatusMessageProps) => {
  const getStyles = () => {
    switch (type) {
      case "loading":
        return {
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          color: "#60a5fa",
        };
      case "error":
        return {
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          color: "#f87171",
        };
      case "info":
        return {
          backgroundColor: "rgba(156, 163, 175, 0.1)",
          color: "#9ca3af",
        };
    }
  };

  return (
    <div
      className={css({
        padding: "1rem",
        borderRadius: "0.5rem",
        textAlign: "center",
        ...getStyles(),
      })}
    >
      <p className={css({ margin: 0 })}>{message}</p>
      {type === "error" && onRetry && (
        <button
          type="button"
          onClick={onRetry}
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
      )}
    </div>
  );
};
