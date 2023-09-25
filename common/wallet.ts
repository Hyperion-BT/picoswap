import {
  Address,
  bytesToHex,
  hexToBytes,
  PubKeyHash,
  Signature,
  Tx,
  TxWitnesses,
  UTxO,
  Value,
} from "@hyperionbt/helios";

/**
 * Sync cached version of Wallet
 */
export class WalletState {
  #addresses: Address[];
  #changeAddressIndex: number;
  #utxos: UTxO[];

  /**
   * @param {Address[]} addresses
   * @param {number} changeAddressIndex
   * @param {UTxO[]} utxos
   */
  constructor(addresses: Address[], changeAddressIndex: number, utxos: UTxO[]) {
    this.#addresses = addresses;
    this.#changeAddressIndex = changeAddressIndex;
    this.#utxos = utxos;
  }

  /**
   * @returns {Value}
   */
  calcBalance(): Value {
    let sum = new Value();

    for (const utxo of this.#utxos) {
      sum = sum.add(utxo.value);
    }

    return sum;
  }

  /**
   * @returns {Address}
   */
  getBaseAddress(): Address {
    return this.#addresses[0];
  }

  /**
   * @returns {Address}
   */
  getChangeAddress(): Address {
    return this.#addresses[this.#changeAddressIndex];
  }

  /**
   * Returns the first UTxO, so the caller can check precisely which network the user is connected to (eg. preview or preprod)
   * @returns {?UTxO}
   */
  getRefUtxo(): UTxO | null {
    if (this.#utxos.length == 0) {
      return null;
    } else {
      return this.#utxos[0];
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
  pickUtxos(amount: Value): [UTxO[], UTxO[]] {
    let sum = new Value();

    let notYetPicked: UTxO[] = this.#utxos.slice();

    const picked: UTxO[] = [];

    const mphs = amount.assets.mintingPolicies;

    /**
     * Picks smallest utxos until 'needed' is reached
     * @param {bigint} neededQuantity
     * @param {(utxo: UTxO) => bigint} getQuantity
     */
    function picker(
      neededQuantity: bigint,
      getQuantity: (utxo: UTxO) => bigint
    ) {
      // first sort notYetPicked in ascending order
      notYetPicked.sort((a, b) => {
        return Number(getQuantity(a) - getQuantity(b));
      });

      let count = 0n;
      const remaining: UTxO[] = [];

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
            remaining.push(utxo);
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
  pickCollateral(amount: bigint = 2000000n): UTxO {
    const pureUtxos = this.#utxos.filter((utxo) => utxo.value.assets.isZero());

    if (pureUtxos.length == 0) {
      throw new Error("no pure UTxOs in wallet (needed for collateral)");
    }

    const bigEnough = pureUtxos.filter((utxo) => utxo.value.lovelace >= amount);

    if (bigEnough.length == 0) {
      throw new Error(
        "no UTxO in wallet that is big enough to cover collateral"
      );
    }

    bigEnough.sort((a, b) => Number(a.value.lovelace - b.value.lovelace));

    return bigEnough[0];
  }

  /**
   * @param {Address} addr
   * @returns {boolean}
   */
  isOwnAddress(addr: Address): boolean {
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
  isOwnPubKeyHash(pkh: PubKeyHash): boolean {
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
  #initHandle: any;
  #fullHandle: any;

  /**
   * @param {{}} initHandle
   * @param {{}} fullHandle
   */
  constructor(initHandle: any, fullHandle: any) {
    this.#initHandle = initHandle;
    this.#fullHandle = fullHandle;
  }

  /**
   * @type {string}
   */
  get name(): string {
    return this.#initHandle.name;
  }

  /**
   * @returns {Promise<number>}
   */
  async getNetworkId(): Promise<number> {
    return await this.#fullHandle.getNetworkId();
  }

  /**
   * @returns {Promise<UTxO[]>}
   */
  async getUtxos(): Promise<UTxO[]> {
    // I was honestly expecting this to be some convenient json, but it is in fact CBOR
    const rawUtxos = await this.#fullHandle.getUtxos();

    return rawUtxos.map((rawUtxo: string) =>
      UTxO.fromCbor(hexToBytes(rawUtxo))
    );
  }

  /**
   * @returns {Promise<[Address[], number]>}
   */
  async getAddresses(): Promise<[Address[], number]> {
    let addresses = await this.#fullHandle.getUsedAddresses();

    const changeAddressIndex = addresses.length;

    addresses = addresses.concat(await this.#fullHandle.getUnusedAddresses());

    return [
      addresses.map((a: string) => new Address(hexToBytes(a))),
      changeAddressIndex,
    ];
  }

  /**
   * @returns {Promise<WalletState>}
   */
  async getState(): Promise<WalletState> {
    const [addresses, changeAddressIndex] = await this.getAddresses();

    const utxos = await this.getUtxos();

    return new WalletState(addresses, changeAddressIndex, utxos);
  }

  /**
   * @param {Tx} tx
   * @returns {Promise<Signature[]>} signatures
   */
  async signTx(tx: Tx): Promise<Signature[]> {
    const res = await this.#fullHandle.signTx(bytesToHex(tx.toCbor()), true);

    return TxWitnesses.fromCbor(hexToBytes(res)).signatures;
  }

  /**
   * @param {Tx} tx
   * @returns {Promise<string>}
   */
  async submitTx(tx: Tx): Promise<string> {
    return await this.#fullHandle.submitTx(bytesToHex(tx.toCbor()));
  }
}
