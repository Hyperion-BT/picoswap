/** @typedef {import('./helios.js').Tx} Tx */
/** @typedef {import('./helios.js').Signature}  Signature */
/** @typedef {import('./helios.js').PubKeyHash} PubKeyHash */
import { Address, bytesToHex, hexToBytes, TxWitnesses, UTxO, Value } from "./helios.js";

/**
 * Sync cached version of Wallet
 */
export class WalletState {
    #addresses;
    #changeAddressIndex;
    #utxos;

    /**
     * @param {Address[]} addresses
     * @param {number} changeAddressIndex
     * @param {UTxO[]} utxos
     */
    constructor(addresses, changeAddressIndex, utxos) {
        this.#addresses = addresses;
        this.#changeAddressIndex = changeAddressIndex;
        this.#utxos = utxos;
    }

    /**
     * @returns {Value}
     */
    calcBalance() {
        let sum = new Value();

        for (const utxo of this.#utxos) {
            sum = sum.add(utxo.value);
        }

        return sum;
    }

    /**
     * @returns {Address}
     */
    getBaseAddress() {
        return this.#addresses[0];
    }

    /**
     * @returns {Address}
     */
    getChangeAddress() {
        return this.#addresses[this.#changeAddressIndex];
    }

    /**
     * Returns the first UTxO, so the caller can check precisely which network the user is connected to (eg. preview or preprod)
     * @returns {?UTxO}
     */
    getRefUtxo() {
        if(this.#utxos.length == 0) {
            return null;
        } else {
            return this.#utxos[0]
        }
    }

    /**
     * First picks the UTxO necessary to cover the assets.
     * After that UTxOs to complete the necessary lovelace amount are picked.
     * Uses a simple strategy that picks the smallest UTxOs first
     * Throws error if there aren't enough UTxOs
     * @param {Value} amount
     * @returns {[UTxO[], UTxO[]]} - first: picked, second: not picked that can be used as a backup
     */
    pickUtxos(amount) {
        let sum = new Value();

        /** @type {UTxO[]} */
        let notYetPicked = this.#utxos.slice();

        /** @type {UTxO[]} */
        const picked = [];

        const mphs = amount.assets.mintingPolicies;

        /**
         * Picks smallest utxos until 'needed' is reached
         * @param {bigint} neededQuantity
         * @param {(utxo: UTxO) => bigint} getQuantity
         */
        function picker(neededQuantity, getQuantity) {
            // first sort notYetPicked in ascending order
            notYetPicked.sort((a, b) => {
                return Number(getQuantity(a) - getQuantity(b));
            });


            let count = 0n;
            const remaining = [];

            while (count < neededQuantity) {
                const utxo = notYetPicked.shift();

                if (utxo === undefined) {
                    throw new Error("not enough utxos to cover amount");
                } else {
                    const qty = getQuantity(utxo);

                    if (qty > 0n) {
                        count += qty;
                        picked.push(utxo);
                        sum = sum.add(utxo.value);
                    } else {
                        remaining.push(utxo)
                    }
                }
            }

            notYetPicked = remaining;
        }

        for (const mph of mphs) {
            const tokenNames = amount.assets.getTokenNames(mph);

            for (const tokenName of tokenNames) {
                const need = amount.assets.get(mph, tokenName);
                const have = sum.assets.get(mph, tokenName);

                if (have < need) {
                    const diff = need - have;

                    picker(diff, (utxo) => utxo.value.assets.get(mph, tokenName));
                }
            }
        }

        // now use the same strategy for lovelace
        const need = amount.lovelace;
        const have = sum.lovelace;

        if (have < need) {
            const diff = need - have;

            picker(diff, (utxo) => utxo.value.lovelace);
        }

        return [picked, notYetPicked];
    }

    /**
     * Returned collateral can't contain an native assets (pure lovelace)
     * TODO: combine UTxOs if a single UTxO isn't enough
     * @param {bigint} amount - 2 Ada should cover most things
     * @returns {UTxO}
     */
    pickCollateral(amount = 2000000n) {
        const pureUtxos = this.#utxos.filter(utxo => utxo.value.assets.isZero());

        if (pureUtxos.length == 0) {
            throw new Error("no pure UTxOs in wallet (needed for collateral)");
        }

        const bigEnough = pureUtxos.filter(utxo => utxo.value.lovelace >= amount);

        if (bigEnough.length == 0) {
            throw new Error("no UTxO in wallet that is big enough to cover collateral");
        }

        bigEnough.sort((a,b) => Number(a.value.lovelace - b.value.lovelace));

        return bigEnough[0];
    }

    /**
     * @param {Address} addr
     * @returns {boolean}
     */
    isOwnAddress(addr) {
        const pkh = addr.pubKeyHash;

        if (pkh === null) {
            return false;
        } else {
            return this.isOwnPubKeyHash(pkh);
        }
    }

    /**
     * @param {PubKeyHash} pkh
     * @returns {boolean}
     */
    isOwnPubKeyHash(pkh) {
        for (const addr of this.#addresses) {
            const aPkh = addr.pubKeyHash;

            if (aPkh !== null && aPkh.eq(pkh)) {
                return true;
            }
        }

        return false;
    }
}

export class Wallet {
    #initHandle;
    #fullHandle;

    /**
     * @param {{}} initHandle 
     * @param {{}} fullHandle 
     */
    constructor(initHandle, fullHandle) {
        this.#initHandle = initHandle;
        this.#fullHandle = fullHandle;
    }

    /**
     * @type {string}
     */
    get name() {
        return this.#initHandle.name;
    }

    /**
     * @returns {Promise<number>}
     */
    async getNetworkId() {
        return await this.#fullHandle.getNetworkId();
    }

    /**
     * @returns {Promise<UTxO[]>}
     */
    async getUtxos() {
        // I was honestly expecting this to be some convenient json, but it is in fact CBOR
        const rawUtxos = await this.#fullHandle.getUtxos();

        return rawUtxos.map((rawUtxo) => UTxO.fromCbor(hexToBytes(rawUtxo)));
    }

    /**
     * @returns {Promise<[Address[], number]>}
     */
    async getAddresses() {
        let addresses = await this.#fullHandle.getUsedAddresses();

        const changeAddressIndex = addresses.length;

        addresses = addresses.concat(await this.#fullHandle.getUnusedAddresses());

        return [
            addresses.map((a) => new Address(hexToBytes(a))),
            changeAddressIndex,
        ];
    }

    /**
     * @returns {Promise<WalletState>}
     */
    async getState() {
        const [addresses, changeAddressIndex] = await this.getAddresses();

        const utxos = await this.getUtxos();

        return new WalletState(addresses, changeAddressIndex, utxos);
    }

    /**
     * @param {Tx} tx
     * @returns {Promise<Signature[]>} signatures
     */
    async signTx(tx) {
        const res = await this.#fullHandle.signTx(bytesToHex(tx.toCbor()), true);

        return TxWitnesses.fromCbor(hexToBytes(res)).signatures;
    }

    /**
     * @param {Tx} tx
     * @returns {Promise<string>}
     */
    async submitTx(tx) {
        return await this.#fullHandle.submitTx(bytesToHex(tx.toCbor()));
    }
}
