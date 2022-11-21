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
