import React from "react";

export default function Footer() {
  return (
    <footer>
      <div></div>
      <SocialLinks />
    </footer>
  );
}

function SocialLinks() {
  return (
    <div className="social">
      <a
        href="https://github.com/hyperion-bt/PicoSwap"
        target="_blank"
        rel="noreferrer"
      >
        <img src="/img/github-logo.svg" alt="Github Logo" />
      </a>
      <a
        href="https://twitter.com/helios_lang"
        target="_blank"
        rel="noreferrer"
      >
        <img src="/img/twitter-logo.svg" alt="Twitter Logo" />
      </a>
      <a href="https://discord.gg/XTwPrvB25q" target="_blank" rel="noreferrer">
        <img src="/img/discord-logo.png" alt="Discord Logo" />
      </a>
    </div>
  );
}
