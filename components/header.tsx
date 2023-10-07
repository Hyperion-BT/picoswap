import React from "react";
import Toolbar from "./Toolbar";

export default function Header() {
  return (
    <header>
      <div>
        <a href="/">
          <img
            className="logo"
            src="/img/picoswap-logo.svg"
            alt="PicoSwap Logo"
          />
        </a>
      </div>
      <Toolbar />
    </header>
  );
}
