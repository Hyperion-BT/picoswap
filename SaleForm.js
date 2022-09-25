/** @typedef {import("./render.js").UI} UI */
import { html } from "./render.js";
/** @typedef {import("./helios.js").Address} Address */
/** @typedef {import("./helios.js").Value} Value */
import { AssetInput, AdaInput, AddressInput } from "./inputs.js";

/**
 * 
 * @param {{balance: Value, onSubmit: (asset: Value, price: Value, buyer: ?Address) => void, onCancel: () => void}} props 
 * @returns {UI}
 */
export function SaleForm(props) {
    const assetInput = new AssetInput("asset", props.balance);

    const priceInput = new AdaInput("price");

    const buyerInput = new AddressInput("buyer");

    const isValid = assetInput.isValid() && priceInput.isValid() && buyerInput.isValid();

    /**
     * @param {Event} e 
     */
    function submit(e) {
        e.target.disabled = true;
        props.onSubmit(assetInput.getValue(), priceInput.getValue(), buyerInput.getAddress());
        e.target.disabled = false;
    }

    return html`
        <div id="sale-form-wrapper">
            <div id="sale-form">
                <div class="form-title">
                    <h1>New Sale</h1>
                    <button class="close" onClick=${props.onCancel}><img src="./img/close.svg"/></button>
                </div>
                <div class="form-row">
                    <label for="asset">Asset</label>
                    ${assetInput.render()}
                </div>
                <div class="form-row">
                    <label for="price">Price</label>
                    ${priceInput.render()}
                </div>
                <div class="form-row">
                    <label for="buyer">Buyer</label>
                    ${buyerInput.render()}
                </div>
                <div class="form-final-row">
                    <button class="cancel" onClick=${props.onCancel}>Cancel</button>
                    <button class="submit" disabled=${!isValid} onClick=${submit}>Submit</button>
                </div>
            </div>
        </div>
    `;
}