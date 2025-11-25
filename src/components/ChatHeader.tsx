import { css } from "../../styled-system/css";

export const ChatHeader = () => {
  return (
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
  );
};
