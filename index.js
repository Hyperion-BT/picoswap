/** @typedef {import("./render.js").UI} UI */
import { html, render, SPACE } from "./render.js";
import { useState, useEffect, useMemo } from "./hooks.js";

/** @typedef {import('./helios.js').Address} Address */
import { Datum, IntData, Value, Tx, bytesToHex, TxOutput } from "./helios.js";
import { calcScriptAddress, Contract, generateDatum, getCompiledProgram, highlightedContract } from "./contract.js";
/** @typedef {import('./wallet.js').WalletState} WalletState */
import { Wallet } from "./wallet.js";
import { PreviewNetwork } from "./network.js";

import { Proxy } from "./Proxy.js";
import { Modal } from "./Modal.js";
import { Link } from "./Link.js";
import { SaleForm } from "./SaleForm.js";
import { ADA } from "./inputs.js";





const WALLET_WAIT_MSG = "Waiting for wallet permission...";

/**
 * @param {{toolbar: Proxy}} props 
 * @returns {UI}
 */
function App(props) {
    const [showContractInfo, setShowContractInfo] = useState(false);
    const [showSaleForm, setShowSaleForm] = useState(false);
    const [waitMessage, setWaitMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [wallet, setWallet] = useState(null);
    const [walletState, setWalletState] = useState(null);
    const [network, setNetwork] = useState(null);
    const [contracts, setContracts] = useState(null);

    /** @type {Value} */
    const balance = useMemo(
        () => {
            if (walletState === null) {
                return new Value();
            } else {
                return walletState.calcBalance();
            }
        },
        [walletState]
    );

    /**
     * Sync the walletState and the networkState every 20 seconds
     */
    useEffect(() => {
        const timer = setInterval(() => {
            console.log("syncing");
            if (wallet !== null) {
                // fire and forget
                syncWallet();
            }

            if (network !== null) {
                // fire and forget
                syncNetwork(network);
            }
        }, 20000);

        return () => {
            clearInterval(timer);
        }
    }, [wallet, network]);

    function isConnected() {
        return walletState !== null;
    }

    async function connect() {
        setWaitMessage(WALLET_WAIT_MSG);

        try {
            const initHandle = window.cardano.eternl;

            let fullHandle;

            try {
                fullHandle = await initHandle.enable();
            } catch (_e) {
                throw new Error("DApp connector not active");
            }

            const wallet = new Wallet(initHandle, fullHandle);

            setWaitMessage("Checking network id...");

            const networkId = await wallet.getNetworkId();

            if (networkId == 1) {
                throw new Error("wallet not connected to preview testnet");
            }

            setWaitMessage("Loading wallet addresses and UTxOs...");

            const walletState = await wallet.getState();

            const refUtxo = walletState.getRefUtxo();

            if (refUtxo === null) {
                throw new Error("empty wallet, can't connect");
            } else {
                setWaitMessage("Loading network parameters...");

                const network = await PreviewNetwork.new();

                setWaitMessage("Verifying connection to preview testnet...");

                if (!(await network.hasUtxo(refUtxo))) {
                    throw new Error("wallet not connected to preview testnet");
                }

                setWaitMessage("Syncing network...");

                await syncNetwork(network);

                setWaitMessage("");
                setErrorMessage("");
                setWallet(wallet);
                setWalletState(walletState);
                setNetwork(network);
            }
        } catch (e) {
            setWaitMessage("");
            setErrorMessage(`Error: ${e.message}`);
        }
    }

    async function syncWallet() {
        // first check that wallet is still connected
        try {
            void await wallet.getNetworkId();
        } catch (_e) {
            disconnect("DApp connector unresponsive, disconnected")
            return;
        }

        // next generate a new walletState, and make sure the baseAddress is still the same
        const newWalletState = await wallet.getState();

        if (newWalletState.getBaseAddress().toBech32() != walletState.getBaseAddress().toBech32()) {
            disconnect("sudden base address switch, disconnected");
            return;
        }

        setWalletState(newWalletState);
    }

    async function syncNetwork(network) {
        // TODO: use IDB as a caching layer

        const utxos = await network.getUtxos(calcScriptAddress());

        const contracts = Contract.groupUtxos(utxos);

        setContracts(contracts);
    }

    function makeNewSale() {
        if (balance.assets.isZero()) {
            setErrorMessage("wallet doesn't contain any NFTs, nor native tokens");
            setWaitMessage("");
            setShowSaleForm(false);
        } else {
            setErrorMessage("");
            setWaitMessage("");
            setShowSaleForm(true);
        }
    }

    function cancelSale() {
        setShowSaleForm(false);
        setErrorMessage("");
        setWaitMessage("");
    }

    /**
     * @param {Value} asset 
     * @param {Value} price 
     * @param {?Address} buyer 
     * @returns {Promise<void>}
     */
    async function submitContract(asset, price, buyer) {
        setWaitMessage("Building transaction...");

        try {
            // build the transaction
            const tx = new Tx();

            const [utxos, spareUtxos] = walletState.pickUtxos(asset);
            for (const utxo of utxos) {
                tx.addInput(utxo);
            }

            const scriptAddress = calcScriptAddress();
            const changeAddress = walletState.getChangeAddress();
            const nonce = BigInt(Math.round(Math.random()*10000000));

            const output = new TxOutput(
                scriptAddress,
                asset,
                Datum.inline(generateDatum(changeAddress, price, buyer, nonce)),
            );

            output.correctLovelace(network.params, (output) => {
                // increase the price by the min amount of lovelace needed as a deposit
                output.setDatum(
                    Datum.inline(generateDatum(changeAddress, price.add(new Value(output.value.lovelace)), buyer, nonce))
                );
            });

            tx.addOutput(output);
            tx.setChangeAddress(changeAddress);
            
            await tx.finalize(network.params, spareUtxos);

            setWaitMessage("Waiting for wallet signature...");

            const pkws = await wallet.signTx(tx);

            setWaitMessage("Verifying signature...");
            for (const pkw of pkws) {
                tx.addSignature(pkw);
            }

            setWaitMessage("Submitting transaction...");

            //console.log(JSON.stringify(tx.dump(), undefined, 4));
            console.log(`submitted tx ${await wallet.submitTx(tx)}`);

            setWaitMessage("");
            setErrorMessage("");
            setShowSaleForm(false);
        } catch (e) {
            setWaitMessage("");
            setErrorMessage(`Error: ${e.message}`);
        }
    }

    /**
     * @param {Contract} contract 
     * @returns {Promise<void>}
     */
    async function cancelContract(contract) {
        setWaitMessage("Building transaction...");

        try {
            const tx = new Tx();
            const [feeUtxos, spareUtxos] = walletState.pickUtxos(new Value(2000000n));

            for (const utxo of feeUtxos) {
                tx.addInput(utxo);
            }

            for (const utxo of contract.utxos) {
                tx.addInput(utxo, new IntData(42n));
            }

            const changeAddress = walletState.getChangeAddress();

            tx.setChangeAddress(changeAddress);

            // conserve the number of asset utxos
            for (const utxo of contract.utxos) {
                const output = new TxOutput(
                    changeAddress,
                    utxo.origOutput.value
                );

                tx.addOutput(output);
            }

            tx.setCollateralInput(walletState.pickCollateral());

            tx.addRequiredSigner(contract.seller);

            tx.addScript(getCompiledProgram());

            await tx.finalize(network.params, spareUtxos);

            setWaitMessage("Waiting for wallet signature...");
            
            const pkws = await wallet.signTx(tx);

            setWaitMessage("Verifying signature...");
            for (const pkw of pkws) {
                tx.addSignature(pkw);
            }

            setWaitMessage("Submitting transaction...");

            console.log(`submitted tx ${await network.submitTx(tx)}`);

            setWaitMessage("");
            setErrorMessage("");
        } catch (e) {
            setWaitMessage("");
            setErrorMessage(`Error: ${e.message}`);
        }
    }

    // TODO: buy endpoint

    /**
     * @param {string} errorMsg 
     */
    function disconnect(errorMsg = "") {
        setShowSaleForm(false);
        setWaitMessage("");
        setErrorMessage(errorMsg);
        setWallet(null);
        setWalletState(null);
        setNetwork(null);
    }


    ///////////////////
    // Render functions
    ///////////////////

    function renderWalletConnectButton() {
        if (walletState === null) {
            if (waitMessage == "") {
                return html`<button class="eternl" onClick=${() => connect()}>Connect to Wallet</button>`;
            } else {
                return html`<button class="eternl" disabled=${true}>Connecting...</button>`;
            }
        } else {
            return html`<button class="eternl" onClick=${() => disconnect()}>Disconnect wallet</button>`;
        }
    }

    function renderActionButtons() {
        if (isConnected() && !showContractInfo && !showSaleForm) {
            return html`
                <button class="new-sale" onClick=${() => makeNewSale()}>New Sale</button>
                <button class="show-contract" onClick=${() => setShowContractInfo(true)}>Show Contract</button>
            `;
        } else {
            return html``;
        }
    }

    function renderToolbar() {
        return html`
            ${renderActionButtons()}
            ${renderWalletConnectButton()}
        `;
    }

    function renderWaitMessage() {
        return Modal(html`<p>${waitMessage}</p>`, true);
    }

    function renderErrorMessage() {
        if (errorMessage == "") {
            return html``;
        } else {
            return html`
                <div id="global-error">
                    <p class="error">${errorMessage}</p>
                    <button class="close" onClick=${() => setErrorMessage("")}><img src="./img/close.svg"/></button>
                </div>
            `;
        }
    }

    function renderDisconnected() {
        return html`
            <div id="welcome-wrapper">
                <div id="welcome">
                    <p>Welcome to PicoSwap, a showcase of the <${Link} href="https://github.com/hyperion-bt/Helios" text="HeliosLang"/> library.</p>
                    <br/>
                    <p>Here you can perform secure atomic swaps of your Cardano NFTs and other native tokens, 100% client-side.</p>
                    <br/>
                    <p>Right now PicoSwap only works with the Eternl wallet, and only with the preview testnet. We will expand this after the Vasil HFC.</p>
                    <br/>
                    <p>Connect your wallet to get started.</p>
                </div>
            </div>
        `;
    }

    function renderContractInfo() {
        return html`
            <div id="contract-info-wrapper">
                <div id="contract-info">
                    <div class="form-title">
                        <h1>Contract</h1>
                        <button class="close" onClick=${() => setShowContractInfo(false)}><img src="./img/close.svg"/></button>
                    </div>
                    <div id="script">
                        <div>
                            ${highlightedContract}
                        </div>
                    </div>
                    <div class="form-row">
                        <label>Address</label>
                        <div id="address">
                            <p><pre>${calcScriptAddress().toBech32()}</pre></p>
                        </div>
                    </div>
                    <div class="form-final-row">
                        <button onClick=${() => setShowContractInfo(false)}>Close</button>
                    </div>
                </div>
            </div>
        `;
    }

    function renderSaleForm() {
        return html`<${SaleForm} balance=${balance} onCancel=${cancelSale} onSubmit=${submitContract}/>`;
    }

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
                const fullName = mph.hex + "." + bytesToHex(tokenName);

                elems.push(html`<p><span>${value.assets.get(mph, tokenName).toString()}</span>${SPACE}<pre title="${fullName}">${fullName}</pre></p>`);
            }
        }

        return elems;
    }

    /**
     * @param {Contract} c
     * @returns {UI[]}
     */
    function renderContract(c) {
        /** @type {UI[]} */
        const fields = [];

        const isSeller = walletState.isOwnPubKeyHash(c.seller);
        const isPublic = c.buyer === null;
        const canBuy   = isPublic || walletState.isOwnPubKeyHash(c.buyer);

        /** @type {UI[]} */
        const actions = [];

        if (isSeller) {
            actions.push(html`<button onClick=${() => cancelContract(c)}>Cancel</button>`);
        }
        
        if ((!isSeller && canBuy) || (canBuy && !isPublic)) {
            actions.push(html`<button onClick=${() => buyContract(c)}>Buy</button>`);
        }

        fields.push(html`<td>${actions}</td>`);

        const nominalAssets = c.forSale.sub(new Value(c.forSale.lovelace));
        const nominalPriceLovelace = c.price.lovelace - c.forSale.lovelace;

        fields.push(html`<td>${renderAssets(nominalAssets)}</td>`);
        fields.push(html`<td>${(Number(nominalPriceLovelace)/1000000).toString()} ${ADA}</td>`);

        const sellerHex = bytesToHex(c.seller.bytes);
        fields.push(html`<td><pre title="${sellerHex}">${sellerHex}</pre></td>`);

        if (isPublic) {
            fields.push(html`<td><i>public</i></td>`);
        } else {
            const buyerHex = bytesToHex(c.buyer.bytes);
            fields.push(html`<td><pre title="${buyerHex}">${buyerHex}</pre></td>`);
        }
        
        return fields;
    }

    function renderOverview() {
        const cs = contracts === null ? [] : contracts;

        return html`
            <div id="overview-wrapper">
                <div id="overview">
                    <div class="form-title">
                        <h1>Active Sales</h1>
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
                                ${cs.map(c => html`<tr>${renderContract(c)}</tr>`)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function renderMain() {
        if (!isConnected()) {
            return renderDisconnected();
        } else {
            if (showContractInfo) {
                return renderContractInfo();
            } else if (showSaleForm) {
                return renderSaleForm();
            } else {
                return renderOverview();
            }
        }
    }

    props.toolbar.setContent(renderToolbar());

    return html`
        ${waitMessage != "" ? renderWaitMessage() : null}
        ${errorMessage != "" ? renderErrorMessage() : null}
        ${renderMain()}
    `;
}

/**
 * Only called once during startup of page
 */
export function init() {
    document.getElementById("modal-overlay")?.remove();

    const toolbarElement = document.getElementById("toolbar");

    const toolbar = new Proxy();
    if (toolbarElement === null) {
        throw new Error("#toolbar not found");
    } else {
        render(toolbar.render(), toolbarElement);
    }

    const mainElement = document.getElementById("main");

    if (mainElement === null) {
        throw new Error("#main not found");
    } else {
        const app = (function () {
            if (window?.cardano?.eternl === undefined) {
                return html`
                    ${Modal(html`<p>Error: <a href="https://chrome.google.com/webstore/detail/eternl/kmhcihpebfmpgmihbkipmjlmmioameka">Eternl</a> not installed</p>`, false)}
                `;
            } else {
                return html`<${App} toolbar=${toolbar}/>`;
            }
        })();

        render(app, mainElement);
    }
}
