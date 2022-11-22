import { bytesToHex, bytesToText } from "./helios.js";

/**
 * 
 * @param {import("./helios.js").MintingPolicyHash} mph 
 * @returns {String}
 */
export function formatMintingPolicyID(mph){
    const policyID = mph.hex;
    // Displays a shorter version of the policyID
    return `${policyID.substring(0,10)}...${policyID.substring(46)}`;
}


/**
 *
 * @param {number[]} bytes
 * @returns {string}
 */
export function parseTokenName(bytes){
    try {
        // bytesToText throws an error in case
        // the bytes aren't valid Utf-8
        return bytesToText(bytes);
    } catch (_e) {
        // falling back to hex value, which is allowed
        // according to Plutus Ledger API
        return bytesToHex(bytes);
    }
}
