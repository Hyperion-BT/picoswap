// @deno-types="https://unpkg.com/preact@10.11.0/src/index.d.ts"
import { h, render } from "https://unpkg.com/preact@10.11.0/src/index.js";

export { render };

// @deno-types="https://unpkg.com/htm@3.1.1/src/index.d.ts"
import htm from "https://unpkg.com/htm@3.1.1/src/index.mjs";

export const html = htm.bind(h);

/**
 * @param {HTMLElement} elem
 */
export function clear(elem) {
  while (elem.lastChild !== null) {
    elem.lastChild.remove();
  }
}

/**
 * @typedef {import("https://unpkg.com/preact@10.11.0/src/index.d.ts").VNode} VNode
 * @typedef {VNode| VNode[]} UI
 */

export const SPACE = "\u00A0";