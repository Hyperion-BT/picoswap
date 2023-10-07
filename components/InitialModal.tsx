import React from "react";

export default function InitialModal() {
  return (
    <div id="modal-background">
      <div id="modal">
        <img
          id="cardano-logo"
          className="cardano-logo animate"
          src="/img/cardano-logo.svg"
          alt="Cardano Logo"
        />
        <div>
          <p id="message">Loading resources</p>
        </div>
      </div>
    </div>
  );
}
