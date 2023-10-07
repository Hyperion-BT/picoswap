import React from "react";

/**
 * @param {{href: string, text: string}} props
 * @returns JSX.Element
 */
export function Link(props: { href: string; text: string }) {
  return (
    <a className="link" href={props.href} target="_blank" rel="noreferrer">
      {props.text}
    </a>
  );
}
