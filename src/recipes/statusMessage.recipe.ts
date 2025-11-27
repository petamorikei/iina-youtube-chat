import { cva } from "../../styled-system/css";

/**
 * StatusMessage container recipe
 */
export const statusMessage = cva({
  base: {
    padding: "1.5rem",
    borderRadius: "0.5rem",
    textAlign: "center",
  },
  variants: {
    type: {
      loading: {
        backgroundColor: "status.loadingBg",
        color: "status.loading",
      },
      error: {
        backgroundColor: "status.errorBg",
        color: "status.error",
      },
      info: {
        backgroundColor: "status.infoBg",
        color: "status.info",
      },
    },
  },
  defaultVariants: {
    type: "info",
  },
});

/**
 * Retry button recipe
 */
export const retryButton = cva({
  base: {
    marginTop: "0.5rem",
    padding: "0.5rem 1rem",
    backgroundColor: "status.errorButton",
    color: "white",
    border: "none",
    borderRadius: "button",
    cursor: "pointer",
    transition: "background-color 0.2s ease",
    _hover: {
      backgroundColor: "status.errorButtonHover",
    },
  },
});

/**
 * Loading spinner recipe
 */
export const spinner = cva({
  base: {
    width: "40px",
    height: "40px",
    borderWidth: "3px",
    borderStyle: "solid",
    borderColor: "status.loadingBorder",
    borderTopColor: "status.loading",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    margin: "0 auto 1rem",
  },
});

/**
 * Status message text recipe
 */
export const statusText = cva({
  base: {
    margin: 0,
  },
  variants: {
    animated: {
      true: {
        animation: "pulse 2s ease-in-out infinite",
      },
    },
  },
});
