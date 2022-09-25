/** @typedef {import("./render.js").UI} UI */
import { html, SPACE } from "./render.js";
/** @typedef {import("./helios.js").PubKeyHash} PubKeyHash */
import { Value, bytesToHex, Address } from "./helios.js";
import { ADA } from "./inputs.js";
import { Link } from "./Link.js";

/** @typedef {import("./contract.js").Contract} Contract */
/** @typedef {import("./wallet.js").WalletState} WalletState */

/**
 * @param {{
 * walletState: WalletState, 
 * pending: Contract[], 
 * contracts: Contract[], 
 * isSyncing: boolean, 
 * onSync: () => void, 
 * onCancelContract: (c: Contract) => Promise<void>,
 * onBuyContract: (c: Contract) => Promise<void>,
 * waitMessage: string,
 * hidePublic: boolean,
 * onChangeHidePublic: (value: boolean) => void,
 * }} props 
 */
export function Overview(props) {
    /**
     * @param {Value} value 
     * @returns {UI[]}
     */
     function renderAssets(value) {
        /** @type {UI[]} */
        const elems = [];

        if (value.lovelace > 0n) {
            elems.push(html`<p>${Number(value.lovelace)/1000000} ${ADA}</p>`)
        }

        for (const mph of value.assets.mintingPolicies) {
            const tokenNames = value.assets.getTokenNames(mph);

            for (const tokenName of tokenNames) {
                const bech32 = mph.toBech32();

                const fullName = bech32 + "." + bytesToHex(tokenName);

                elems.push(html`
                    <p>
                        <span>${value.assets.get(mph, tokenName).toString()}</span>${SPACE}<pre title="${fullName}">
                            <${Link} href="https://preview.cexplorer.io/asset/${bech32}" text="${bech32}"/>.${bytesToHex(tokenName)}
                        </pre>
                    </p>
                `);
            }
        }

        return elems;
    }

    /**
     * @param {PubKeyHash} pkh 
     * @returns {UI}
     */
    function renderPubKeyHash(pkh) {
        const addr = Address.fromPubKeyHash(true, pkh).toBech32();

        //return html`<pre title=${addr}><${Link} href="https://preview.cexplorer.io/address/${addr}" text=${addr}/></pre>`;
        return html`<pre title=${addr}>${addr}</pre>`; // link doesn't make much sense here because these address won't have been used yet
    }
    
    /**
     * @param {Contract} contract
     * @returns {UI[]}
     */
    function renderContract(contract) {
        /** @type {UI[]} */
        const fields = [];

        const isSeller = props.walletState.isOwnPubKeyHash(contract.seller);
        const isPublic = contract.buyer === null;
        const canBuy   = isPublic || props.walletState.isOwnPubKeyHash(contract.buyer);
        
        /** @type {UI[]} */
        const actions = [];

        if (isSeller) {
            actions.push(html`<button class="cancel" disabled=${contract.state != 1} onClick=${(/** @type {Event} */ _e) => {if (props.waitMessage == "") {props.onCancelContract(contract)}}}>Cancel</button>`);
        }
        
        if ((!isSeller && canBuy) || (canBuy && !isPublic)) {
            actions.push(html`<button class="buy" disabled=${contract.state != 1} onClick=${(/** @type {Event} */ _e) => {if (props.waitMessage == "") {props.onBuyContract(contract)}}}>Buy</button>`);
        }

        fields.push(html`<td>${actions}</td>`);

        const nominalAssets = contract.forSale.sub(new Value(contract.forSale.lovelace));
        const nominalPriceLovelace = contract.price.lovelace - contract.forSale.lovelace;

        fields.push(html`<td>${renderAssets(nominalAssets)}</td>`);
        fields.push(html`<td>${(Number(nominalPriceLovelace)/1000000).toString()} ${ADA}</td>`);

        fields.push(html`<td>${renderPubKeyHash(contract.seller)}</td>`);

        if (isPublic) {
            fields.push(html`<td><i>public</i></td>`);
        } else {
            fields.push(html`<td>${renderPubKeyHash(contract.buyer)}</td>`);
        }
        
        return fields;
    }

    const cs = (
        props.contracts === null ? 
            [] : 
            props.hidePublic ? 
                props.contracts.filter(c => {
                    return props.walletState.isOwnPubKeyHash(c.seller) || (c.buyer !== null && props.walletState.isOwnPubKeyHash(c.buyer))
                }) :
                props.contracts
    ).filter(c => props.pending.findIndex(pc => pc.eq(c)) == -1); // only contracts that aren't pending

    return html`
        <div id="overview-wrapper">
            <div id="overview">
                <div class="form-title">
                    <h1>Active Sales</h1>
                    <button disabled=${props.isSyncing || props.pending.length > 0} onClick=${() => {props.onSync()}}><img src="./img/refresh.svg"/></button>
                </div>
                <div class="filters">
                    <div class="form-row">
                        <label for="hide-public">Hide public</label>
                        <input id="hide-public" type="checkbox" ${props.hidePublic ? "checked" : ""} onClick=${(/** @type {Event} */ _e) => props.onChangeHidePublic(!props.hidePublic)}/>
                    </div>
                </div>
                <div id="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Action</th>
                                <th>Assets</th>
                                <th>Price</th>
                                <th>Seller</th>
                                <th>Buyer</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${props.pending.map(c => html`<tr class="state-${c.state}">${renderContract(c)}</tr>`)}
                            ${cs.map(c => {
                                if (props.pending.findIndex(pc => pc.eq(c)) == -1) {
                                    return html`<tr>${renderContract(c)}</tr>`;
                                } else {
                                    return null;
                                }
                            })}
                            <tr class="empty"><td colspan="5">${(cs.length == 0 && props.pending.length == 0) ? html`<i>No active ${props.hidePublic ? "private " : ""}sales</i>` : null}</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}
