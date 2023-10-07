import React from "react";

export function Modal({ content, animate = true }) {
  return (
    <div id="modal-background">
      <div id="modal">
        <img
          className={`cardano-logo ${animate ? "animate" : ""}`}
          src="./img/cardano-logo.svg"
          alt="Cardano Logo"
        />
        {content}
      </div>
    </div>
  );
}
