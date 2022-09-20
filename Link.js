/** @typedef {import("./render.js").UI} UI */
import { html } from "./render.js";

/**
 * @param {{href: string, text: string}} props 
 * @returns {UI}
 */
export function Link(props) {
    return html`<a class="link" href="${props.href}" target="_blank">${props.text}</a>`
}