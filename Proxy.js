/** @typedef {import("./render.js").UI} UI */
import { html } from "./render.js";
import { useState } from "./hooks.js";

export class Proxy {
    constructor() {
        /** @type {?UI} */
        this.content = null;

        /** @type {(content: ?UI) => void} */
        this.setContent = (_content) => {};
    }

    /**
     * @returns {UI}
     */
    render() {
        const that = this;

        function Element() {
            [that.content, that.setContent] = useState(null);

            if (that.content === null) {
                return html``;
            } else {
                return that.content;
            }
        }
        

        return html`<${Element}/>`;
    }
}