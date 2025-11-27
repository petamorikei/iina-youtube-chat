import { cva } from "../../styled-system/css";

/**
 * Message list root container
 */
export const messageListRoot = cva({
  base: {
    height: "100%",
    width: "100%",
    position: "relative",
  },
});

/**
 * Scrollable container
 */
export const scrollContainer = cva({
  base: {
    height: "100%",
    width: "100%",
    overflowY: "auto",
  },
});

/**
 * Virtual list container
 */
export const virtualListContainer = cva({
  base: {
    width: "100%",
    position: "relative",
  },
});

/**
 * Virtual item wrapper
 */
export const virtualItem = cva({
  base: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    paddingBottom: "0.5rem",
  },
});

/**
 * Indicator bar at edge
 */
export const indicatorBar = cva({
  base: {
    position: "absolute",
    left: 0,
    right: 0,
    height: "1px",
    transition: "all 0.3s ease",
    pointerEvents: "none",
    zIndex: 10,
  },
  variants: {
    position: {
      top: {
        top: 0,
      },
      bottom: {
        bottom: 0,
      },
    },
    active: {
      true: {
        background:
          "linear-gradient(90deg, rgba(59, 130, 246, 0.8) 0%, rgba(99, 160, 255, 0.9) 50%, rgba(59, 130, 246, 0.8) 100%)",
        boxShadow: "0 0 3px 1px rgba(59, 130, 246, 0.6), 0 0 5px 2px rgba(59, 130, 246, 0.3)",
      },
      false: {
        background:
          "linear-gradient(90deg, rgba(100, 100, 100, 0.3) 0%, rgba(120, 120, 120, 0.4) 50%, rgba(100, 100, 100, 0.3) 100%)",
        boxShadow: "none",
      },
    },
  },
  defaultVariants: {
    position: "bottom",
    active: false,
  },
});

/**
 * Scroll to latest button container
 */
export const scrollButtonContainer = cva({
  base: {
    position: "absolute",
    right: "12px",
    zIndex: 20,
  },
  variants: {
    position: {
      top: {
        top: "12px",
      },
      bottom: {
        bottom: "12px",
      },
    },
  },
  defaultVariants: {
    position: "bottom",
  },
});
