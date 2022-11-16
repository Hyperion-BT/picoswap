/**
 * 
 * @param {String} hex 
 * @returns {String}
 */
function fromHexToText(hex){
    const every2Chars = /.{2}/g;
    const match = hex.match(every2Chars);
    if(match) {
        return match.map(
            // converts each hex character to text
            (v) => String.fromCharCode(parseInt(v,16))
        ).join("");
    }else{
        return "";
    }
}

/**
 * 
 * @param {import("./helios.js").MintingPolicyHash} mph 
 * @returns {String}
 */
function formatMintingPolicyID(mph){
    const policyID = mph.hex;
    // Displays a shorter version of the policyID
    return `${policyID.substring(0,10)}...${policyID.substring(46)}`;
}

export { fromHexToText, formatMintingPolicyID };