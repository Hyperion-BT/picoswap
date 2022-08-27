# PicoSwap story

Alice has some NFTs she want to sell to Bob for an amount of ADA they both agree to.


Alice goes to `picoswap.hyperion-bt.com`, chooses testnet (preprod) or mainnet, and connects her wallet.

## Alice's first sale
Alice opens the 'Sell' form and enters the following details:
* an input value integer and a value AssetClass from a dropdown of what she wants to sell
* optionally a second value for another AssetClass, etc.
* an input value integer and a value AssetClass for what she wants to receive
* a checkbox to limit the sale to Bob only, and optionally Bob's receiving address (if unchecked it becomes a public sale)

Alice clicks on 'Submit' and sees a confirmation modal. Upon confirmation the DApp takes the form data (which has already been auto-validated, Submit would be disabled for faulty input) and generates a Datum json using Helios. The transaction is built using Lucid with the relevant UTXOs and that Datum json. The transaction is then sent through the wallet-connector for signing and submission (alternatively this can be submitted through Blockfrost by the DApp itself). A final notification modal appears with a link so Alice can share the contract with Bob. The DApp reloads upon closing the final modal.

## Alice's second interaction

If Alice has interacted with the PicoSwap before (using the same wallet on the same network) she we see a list of previous sales. The previous sales can either be active (i.e. pending), or inactive (fulfilled or cancelled). Alice will also see a list of completed purchases, sales where she is the explicit buyer, and public sales.

If Alice clicks on one of her inactive sales she is sent to the 'Sell' form, with the fields automatically filled with the previous values.

If Alice clicks on an active sale item she is sent to the 'Buy' form for that item.

If Alice clicks on one of her active sales she is sent to a modified 'Sell' from, with disabled fields and a 'Cancel' button.

# Alice cancels her sale

Alice can cancel her sale at any point in time. If Alice clicks 'Cancel' in the active sale form, and confirms the subsequent modal, a transaction is built that sends the locked funds to a new receiving address that has been broadcast by the wallet connector.

## Bob buys

Bob clicks on Alice's link and is sent to the 'Buy' form. Before continuing he must connect his wallet. The link url contains a query string that is used by the DApp to identify the contract. In a first version of picoswap this could just be the entire Datum in json format. The DApp scans through the UTXOs locked at the script-address in order to find all the UTXOs with the same datum. Bob verifies that the relevant UTXOs sum to the value he wants. The DApp verifies that Bob has sufficient funds. If Bob confirms his purchase the DApp creates the transaction and sends to his wallet for signing and submission.

The DApp reloads and Bob sees a listing of his previous and current interactions with PicoSwap.

## Minimal Viable Product version
Doesn't need to have the public sale capability (although the contract itself can already provision it).
Only needs to work with one type of wallet, and only needs to work on testnet.

# Extensions

The contract could contain an explicit deadline after which the tokens are returned to Alice. The actor that pays the cancelation fee can reward him/her-self with a liquidation value.

