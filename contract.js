import { html, SPACE } from "./render.js";

/** @typedef {import("./helios.js").UplcData} UplcData */
/** @typedef {import("./helios.js").UplcProgram} UplcProgram */
import { Address, ConstrData, Program, PubKeyHash, Value, hexToBytes, bytesToHex, highlight, UTxO } from "./helios.js";

const optimize = false;

export const contractScript = `
spending picoswap

// Note: each input UTxO must contain some lovelace, so the datum price will be a bit higher than the nominal price
// Note: public sales are possible when a buyer isn't specified

struct Datum {
    seller: PubKeyHash
    price:  Value              
    buyer:  Option[PubKeyHash]
    nonce:  Int // double satisfaction protection

    func seller_signed(self, tx: Tx) -> Bool {
        tx.is_signed_by(self.seller)
    }

    func buyer_signed(self, tx: Tx) -> Bool {
        self.buyer.switch{
            None    => true,
            s: Some => tx.is_signed_by(s.some)
        }
    }

    func seller_received_money(self, tx: Tx) -> Bool {
        // protect against double satisfaction exploit by datum tagging the output using a nonce
        tx.value_sent_to_datum(self.seller, self.nonce, false) >= self.price
    }
}

func main(datum: Datum, ctx: ScriptContext) -> Bool {
    tx: Tx = ctx.tx;

    // sellers can do whatever they want with the locked UTxOs
    datum.seller_signed(tx) || (
        // buyers can do whatever they want with the locked UTxOs, as long as the sellers receive their end of the deal
        datum.buyer_signed(tx) && 
		datum.seller_received_money(tx)
    )
}`;

const datumScript = `
// code to generate a Datum
const SELLER_BYTES   = # // must be 28 bytes long
const PRICE_LOVELACE = 0
const BUYER_BYTES    = # // must be 0 or 28 bytes long
const NONCE          = 0

const DATUM = Datum{
    seller: PubKeyHash::new(SELLER_BYTES),
    price:  Value::lovelace(PRICE_LOVELACE),
    buyer:  if (BUYER_BYTES.length == 0) {
                Option[PubKeyHash]::None
            } else {
                Option[PubKeyHash]::Some{PubKeyHash::new(BUYER_BYTES)}
            },
    nonce:  NONCE
}`;

const src = contractScript + datumScript;

/**
 * @returns {UplcProgram}
 */
export function getCompiledProgram() {
    return Program.new(contractScript).compile(optimize);
}

/**
 * @returns {Address}
 */
export function calcScriptAddress() {
    return Address.fromValidatorHash(true, Program.new(contractScript).compile(optimize).validatorHash);
}


export const highlightedContract = (function() {
    const elems = [];

    const src = contractScript.trim();
    const markers = highlight(src);
    const n = markers.length;

    /** @type {any[]} */
    let currentLine = [];

    /** @type {string[]} */
    let currentChars = [];

    let currentMarker = -1;

    function flushChars() {
        if (currentChars.length > 0) {
            currentLine.push(html`<span c="${currentMarker}">${currentChars.join("")}</span>`);
            currentChars = [];
        }
    }

    function flushLine() {
        elems.push(html`<pre>${currentLine}</pre>`);
        currentLine = [];
    }

    for (let i = 0; i < n; i++) {
        const m = markers[i];

        if (m != currentMarker) {
            flushChars();
        }

        currentMarker = m;
        const c = src.at(i);

        if (c === undefined) {
            throw new Error("unexpected");
        } else if (c == '\n') {
            flushChars();

            if (currentLine.length == 0) {
                elems.push(html`<br/>`);
            } else {
                flushLine();
            }
        } else if (c == ' ') {
            currentChars.push(SPACE);
        } else {
            currentChars.push(c);
        }
    }

    flushChars();

    if (currentLine.length > 0) {
        flushLine();
    }

    return elems;
})();

// utxos are grouped per contract
export class Contract {
    #datum;
    #utxos;

    /**
     * 0: starting, 1: active, 2: ending
     * @type {number}
     */
    #state;

    /**
     * @param {ConstrData} datum 
     * @param {UTxO[]} utxos
     * @param {number} state 
     */
    constructor(datum, utxos, state = 1) {
        this.#datum = datum;
        this.#utxos = utxos;
        this.#state = state;
    }

    /**
     * @type {ConstrData}
     */
    get datum() {
        return this.#datum;
    }
    
    /**
     * @type {UTxO[]}
     */
    get utxos() {
        return this.#utxos.slice();
    }

    /**
     * @type {PubKeyHash}
     */
    get seller() {
        return new PubKeyHash(this.#datum.fields[0].bytes);
    }

    /**
     * Doesn't include the staking part
     * @type {Address}
     */
    get sellerAddress() {
        return Address.fromPubKeyHash(true, this.seller);
    }

    /**
     * @type {Value}
     */
    get price() {
        return Value.fromData(this.#datum.fields[1]);
    }

    /**
     * @type {Value}
     */
    get forSale() {
        return UTxO.sumValue(this.#utxos);
    }

    /**
     * @type {?PubKeyHash}
     */
    get buyer() {
        const option = this.#datum.fields[2];

        if (option.index == 0) {
            return new PubKeyHash(option.fields[0].bytes);
        } else {
            return null;
        }
    }

    /**
     * @type {bigint}
     */
    get nonce() {
        return this.#datum.fields[3].int;
    }

    /**
     * @type {number}
     */
    get state() {
        return this.#state;
    }

    /**
     * @param {Contract} other 
     * @returns {boolean}
     */
    eq(other) {
        return this.#datum.toSchemaJson() == other.#datum.toSchemaJson();
    }

    /**
     * @param {UTxO[]} utxos 
     * @returns {Contract[]}
     */
    static groupUtxos(utxos) {
        // group based on equal datum
        
        /** @type {Map<string, UTxO[]>} */
        const groups = new Map();

        for (const utxo of utxos) {
            const datum = utxo.origOutput.datum;

            if (datum !== null && datum.isInline()) {                
                const key = bytesToHex(datum.data.toCbor());

                const lst = groups.get(key);

                if (lst === undefined) {
                    groups.set(key, [utxo]);
                } else {
                    lst.push(utxo);
                }
            }
        }

        return Array.from(groups.entries()).map(([key, utxos]) => {
            const datum = ConstrData.fromCbor(hexToBytes(key));

            return new Contract(datum, utxos);
        });
    }
}

/**
 * @param {Address} sellerAddress 
 * @param {Value} price 
 * @param {?Address} buyerAddress 
 * @param {bigint} nonce 
 * @returns {UplcData}
 */
export function generateDatum(sellerAddress, price, buyerAddress, nonce) {
    const program = Program.new(src);

    const sellerPkh = sellerAddress.pubKeyHash;
    if (sellerPkh === null) {
        throw new Error("unexpected null sellerPkh");
    } else {
        program.changeParam("SELLER_BYTES", JSON.stringify(sellerPkh.bytes));
    }

    if (!price.assets.isZero()) {
        throw new Error("price doesn't yet support other assets");
    } else {
        program.changeParam("PRICE_LOVELACE", price.lovelace.toString());
    }

    if (buyerAddress !== null) {
        const buyerPkh = buyerAddress.pubKeyHash;
        if (buyerPkh === null) {
            throw new Error("unexpected null buyerPkh");
        } else {
            program.changeParam("BUYER_BYTES", JSON.stringify(buyerPkh.bytes));
        }
    }

    program.changeParam("NONCE", nonce.toString());

    return program.evalParam("DATUM").data;
}
