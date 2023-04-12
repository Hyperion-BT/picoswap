/** @typedef {import("./render.js").UI} UI */
import { html, render } from "./render.js";
import { useState, useEffect, useMemo } from "./hooks.js";

/** @typedef {import('./helios.js').Address} Address */
import { Datum, IntData, Value, Tx, UTxO, TxOutput, TxId, ListData } from "./helios.js";
import { calcScriptAddress, Contract, generateDatum, getCompiledProgram, highlightedContract } from "./contract.js";
/** @typedef {import('./wallet.js').WalletState} WalletState */
import { Wallet } from "./wallet.js";
import { PreviewNetwork } from "./network.js";

import { Proxy } from "./Proxy.js";
import { Modal } from "./Modal.js";
import { Link } from "./Link.js";
import { SaleForm } from "./SaleForm.js";
import { Overview } from "./Overview.js";


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
    const [isSyncing, setIsSyncing] = useState(false);
    const [pending, setPending] = useState([]); // pending contracts
    const [hidePublic, setHidePublic] = useState(false);

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
     * Sync wallet every 10s
     */
    useEffect(() => {
        const timer = setInterval(() => {
            syncWallet();
        }, 10000);

        return () => {
            clearInterval(timer);
        }
    }, [wallet]);

    /**
     * Auto sync network only if there are pending transactions
     */
    useEffect(() => {
        if (pending.length > 0) {
            setTimeout(() => {
                syncNetwork();
            }, 5000);
        }
    }, [pending]);

    /**
     * @param {number} ms 
     * @returns {Promise<void>}
     */
    function wait(ms = 0) {
        return new Promise((resolve, _reject) => {
            setTimeout(resolve, ms);
        });
    }

    /**
     * @param {Contract} contract 
     */
    function pushPendingContract(contract) {
        setPending(pending.concat([contract]));
    }

    function isConnected() {
        return walletState !== null;
    }

    async function connect() {
        setWaitMessage(WALLET_WAIT_MSG);

        await wait();

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

                await syncNetworkInternal(network);

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

    async function syncNetwork() {
        if (!isSyncing) {
            setIsSyncing(true);

            if (network !== null) {
                await syncNetworkInternal(network);
            }

            setIsSyncing(false);
        }
    }

    async function syncWallet() {
        if (wallet === null) {
            // assume already disconnected
            return;
        }

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

    /**
     * Updates the list of UTxOs locked at the contract address
     * Also updates the list of pending contract transactions
     * @param {PreviewNetwork} network 
     */
    async function syncNetworkInternal(network) {
        // TODO: use IDB as a caching layer

        const utxos = await network.getUtxos(calcScriptAddress());

        const contracts = Contract.groupUtxos(utxos);

        /** @type {Contract[]} */
        const newPending = [];

        for (const pc of pending) {
            if (pc.state == 0) {
                // check if in the new list
                if (contracts.findIndex(c => c.eq(pc)) == -1) {
                    newPending.push(pc);
                }
            } else if (pc.state == 2) {
                if (contracts.findIndex(c => c.eq(pc)) != -1) {
                    newPending.push(pc);
                }
            }
        }

        setPending(newPending);
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

        await wait(100);

        try {
            // build the transaction
            const tx = new Tx();

            const [utxos, spareUtxos] = walletState.pickUtxos(asset);
            for (const utxo of utxos) {
                tx.addInput(utxo);
            }

            const scriptAddress = calcScriptAddress();
            const changeAddress = walletState.getChangeAddress();
            const nonce = BigInt(Math.round(Math.random() * 10000000));

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

            await tx.finalize(network.params, changeAddress, spareUtxos);

            setWaitMessage("Waiting for wallet signature...");

            const pkws = await wallet.signTx(tx);

            setWaitMessage("Verifying signature...");

            tx.addSignatures(pkws);

            setWaitMessage("Submitting transaction...");

            //console.log(JSON.stringify(tx.dump(), undefined, 4));

            const txId = TxId.fromHex(await wallet.submitTx(tx));

            console.log(`submitted tx ${txId.hex}`);

            // add pending to pending list
            const datum = output.getDatumData();
            if (datum instanceof ListData) {
                pushPendingContract(new Contract(datum, [new UTxO(txId, 0n, output)], 0)); // even better would be that the wallet supports tx chaining, so wouldn't have to manage that here
            } else {
                throw new Error("unexpected");
            }

            setWaitMessage("");
            setErrorMessage("");
            setShowSaleForm(false);
        } catch (e) {
            setWaitMessage("");
            console.error(e);
            setErrorMessage(`Error: ${e.message}`);
        }
    }

    /**
     * @param {Contract} contract 
     * @returns {Promise<void>}
     */
    async function cancelContract(contract) {
        setWaitMessage("Building transaction...");

        await wait(100);

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

            // conserve the number of asset utxos
            for (const utxo of contract.utxos) {
                const output = new TxOutput(
                    changeAddress,
                    utxo.origOutput.value
                );

                tx.addOutput(output);
            }

            tx.addCollateral(walletState.pickCollateral());

            tx.addSigner(contract.seller);

            tx.attachScript(getCompiledProgram());

            await tx.finalize(network.params, changeAddress, spareUtxos);

            setWaitMessage("Waiting for wallet signature...");

            //console.log(tx.dump());

            //console.log(getCompiledProgram().src.pretty());

            const pkws = await wallet.signTx(tx);

            setWaitMessage("Verifying signature...");

            tx.addSignatures(pkws);

            setWaitMessage("Submitting transaction...");

            console.log(`submitted tx ${await network.submitTx(tx)}`);

            // add to pending list
            pushPendingContract(new Contract(contract.datum, contract.utxos, 2));

            setWaitMessage("");
            setErrorMessage("");
        } catch (e) {
            setWaitMessage("");
            console.error(e);
            setErrorMessage(`Error: ${e.message}`);
        }
    }

    /**
     * @param {Contract} contract 
     */
    async function buyContract(contract) {
        setWaitMessage("Building transaction...");

        await wait(100);

        try {
            const tx = new Tx();
            const nominalPrice = contract.price.sub(new Value(contract.forSale.lovelace));
            const [paymentUtxos, spareUtxos] = walletState.pickUtxos(nominalPrice); // the contract utxos should cover the rest

            for (const utxo of paymentUtxos) {
                tx.addInput(utxo);
            }

            for (const utxo of contract.utxos) {
                tx.addInput(utxo, new IntData(42n)); // dummy redeemer
            }

            tx.attachScript(getCompiledProgram());

            // make sure the seller gets their lovelace, with the appropriate nonce (to avoid double satisfaction)
            const datum = Datum.hashed(new IntData(contract.nonce));

            tx.addOutput(new TxOutput(contract.sellerAddress, contract.price, datum));

            const changeAddress = walletState.getChangeAddress();

            // send the contract inputs to the buyer
            for (const utxo of contract.utxos) {
                tx.addOutput(new TxOutput(
                    changeAddress,
                    utxo.value,
                ));
            }



            if (contract.buyer !== null) {
                tx.addSigner(contract.buyer);
            }

            tx.addCollateral(walletState.pickCollateral());

            //console.log(tx.dump());

            // send any change back to the buyer
            await tx.finalize(network.params, changeAddress, spareUtxos);

            //console.log(tx.dump());

            setWaitMessage("Waiting for wallet signature...");

            const pkws = await wallet.signTx(tx);

            setWaitMessage("Verifying signature...");

            tx.addSignatures(pkws);

            setWaitMessage("Submitting transaction...");

            console.log(`submitted tx ${await network.submitTx(tx)}`);

            // add to pending list
            pushPendingContract(new Contract(contract.datum, contract.utxos, 2)); // ideally this is handled by the wallet

            setWaitMessage("");
            setErrorMessage("");
        } catch (e) {
            setWaitMessage("");
            console.error(e);
            setErrorMessage(`Error: ${e.message}`);
        }
    }

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
                    <h1><img src="./img/picoswap-logo-black.svg"/></h1>
                    <div class="content">
                        <p>With PicoSwap you can perform secure atomic swaps of your Cardano NFTs and other native tokens, 100% client-side (powered by the <${Link} href="https://github.com/hyperion-bt/helios" text="Helios"/> library).</p>
                        <br/>
                        <p>Right now PicoSwap only works with the <${Link} href="https://chrome.google.com/webstore/detail/eternl/kmhcihpebfmpgmihbkipmjlmmioameka" text="Eternl"/> wallet, and only with the preview testnet. We will expand this after the V2 parameter update.</p>
                        <br/>
                        <p>Connect your wallet to get started.</p>
                    </div>
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

    function renderOverview() {
        return html`
            <${Overview} 
                walletState=${walletState} 
                pending=${pending} 
                contracts=${contracts} 
                isSyncing=${isSyncing} 
                onSync=${syncNetwork} 
                onCancelContract=${cancelContract} 
                onBuyContract=${buyContract} 
                waitMessage=${waitMessage} 
                hidePublic=${hidePublic} 
                onChangeHidePublic=${setHidePublic}
            />
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
