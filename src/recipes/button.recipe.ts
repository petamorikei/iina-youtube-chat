import { cva } from "../../styled-system/css";

/**
 * Icon button recipe (for scroll button, etc.)
 */
export const iconButton = cva({
  base: {
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
  },
  variants: {
    variant: {
      scroll: {
        width: "36px",
        height: "36px",
        backgroundColor: "ui.scrollButton",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
        _hover: {
          backgroundColor: "ui.scrollButtonHover",
          transform: "scale(1.1)",
        },
      },
    },
  },
  defaultVariants: {
    variant: "scroll",
  },
});
