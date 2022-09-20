import { html } from "./render.js";

export function Modal(content, animate = true) {
    return html`
        <div id="modal-background">
            <div id="modal">
                <img class="cardano-logo ${animate ? "animate" : ""}" src="./img/cardano-logo.svg"/>
                ${content}
            </div>
        </div>
    `;
}