/** @typedef {import('./helios.js').Tx} Tx */
import { Assets, ConstrData, Datum, TxId, MintingPolicyHash, NetworkParams, Value, TxOutput, UTxO, hexToBytes } from './helios.js';

const BLOCKFROST_API_KEY = "previewIMakoqNtbySYNVIpOsPKv16ZV4vhes6B";

const NETWORK_PARAMS_URL = "https://d1t0d7c2nekuk0.cloudfront.net/preview.json";

/**
 * @param {{}} obj 
 * @returns 
 */
function blockFrostAmountToValue(obj) {
    let value = new Value();

    for (let item of obj) {
        let qty = BigInt(item.quantity);

        if (item.unit == "lovelace") {
            value = value.add(new Value(qty));
        } else {
            let mph = MintingPolicyHash.fromHex(item.unit);

            /** @type {number[]} */
            let token = [];

            // TODO: extract tokenName from blockFrost data structure

            value = value.add(new Value(0n, new Assets([
                [mph, [
                    [token, qty]
                ]]
            ])));
        }
    }

    return value;
}

/**
 * PreviewNetwork uses BlockFrost as its source
 */
export class PreviewNetwork {
    #params;

    /**
     * @param {NetworkParams} params 
     */
    constructor(params) {
        this.#params = params;
    }

    /**
     * @returns {Promise<PreviewNetwork>}
     */
    static async new() {
        const networkParams = new NetworkParams(await fetch(NETWORK_PARAMS_URL).then(response => response.json()));

        return new PreviewNetwork(networkParams);
    }

    get name() {
        return "preview";
    }

    get params() {
        return this.#params;
    }

    get fetchConfig() {
        return {
            headers: {
                project_id: BLOCKFROST_API_KEY
            }
        };
    }

    isTestnet() {
        return true;
    }

    /**
     * @param {UTxO} utxo 
     * @returns {Promise<boolean>}
     */
    async hasUtxo(utxo) {
        const txId = utxo.txId;

        const url = `https://cardano-${this.name}.blockfrost.io/api/v0/txs/${txId.hex}/utxos`;

        const response = await fetch(url, this.fetchConfig);

        return response.ok;
    }

    /**
     * @param {Address} addr 
     * @returns {Promise<UTxO[]>}
     */
    async getUtxos(addr) {
        const url = `https://cardano-${this.name}.blockfrost.io/api/v0/addresses/${addr.toBech32()}/utxos?order=asc`;

        /** @type {{}[]} */
        let all = await fetch(url, this.fetchConfig).then(response => {
            return response.json()
        });

        if (all?.status_code > 299) {
            all = [];
        }

        return all.map(obj => {
            return new UTxO(
                TxId.fromHex(obj.tx_hash),
                BigInt(obj.output_index),
                new TxOutput(
                    addr,
                    blockFrostAmountToValue(obj.amount),
                    Datum.inline(ConstrData.fromCbor(hexToBytes(obj.inline_datum)))
                )
            );
        });
    }

    /**
     * @param {Tx} tx 
     * @returns {Promise<string>}
     */
    submitTx(tx) {
        const data = new Uint8Array(tx.toCbor());
        const url = `https://cardano-${this.name}.blockfrost.io/api/v0/tx/submit`;

        return new Promise((resolve, reject) => {
            const req = new XMLHttpRequest();
            req.onload = (_e) => {
                if (req.status == 200) {
                    resolve(req.responseText);
                } else {
                    reject(new Error(req.responseText));
                }
            }

            req.onerror = (e) => {
                reject(e);
            }

            req.open("POST", url, false);

            req.setRequestHeader("content-type", "application/cbor");
            req.setRequestHeader("project_id", BLOCKFROST_API_KEY);
            
            req.send(data);
        });   
    }
}
