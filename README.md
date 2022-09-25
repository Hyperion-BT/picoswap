# PicoSwap

PicoSwap is a Cardano atomic swap DApp. PicoSwap uses the [Helios](https://github.com/Hyperion-BT/Helios) library for the Smart Contract and Tx logic, and [Preact/Htm](https://preactjs.com/guide/v10/getting-started#alternatives-to-jsx) as a minimal UI framework.

This repository serves as a template for building Cardano DApps using only client-side JavaScript.

PicoSwap doesn't use any build-steps. The development files, including those of dependencies, are served directly to the client. This approach was chosen in order to maximize auditability (it should be as easy as possible to verify the correct implementation of PicoSwap), and minimize the number of pieces of software that must be blindly trusted (ideally only your browser, wallet, and the Cardano-network itself). In the future we envision that PicoSwap will be hosted using IPFS and that it will query the blockchain using only decentralized APIs.

Currently PicoSwap only works with the Eternl wallet (Chrome) connected to the Cardano preview testnet. Please raise a github issue if you would like to see another wallet supported.

## Deno as JavaScript language server for development
We recommend using Deno as a language server as it supports reading type annotations from external modules.

### Installing Deno
Install Deno using the following command (assuming you use Linux):
```
curl -fsSL https://deno.land/x/install/install.sh | sh
```

This should download the `deno` binary to `$HOME/.deno/bin/deno`. Either add this directory to your path, or copy the binary to the system-wide bin directory:
```
sudo cp $HOME/.deno/bin/deno /usr/local/bin/deno
```

### Configuring VSCode to use Deno
Make sure the `.vscode/settings.json` file points to the correct `deno` binary. Eg:
```
{
    "deno.enable": true,
    "deno.path": "/usr/local/bin/deno"
}
```

### Caching external sources
External modules must be cached by Deno before you can benefit from their type annotations.

Cache external modules using the following command:
```
deno cache --reload index.js
```
