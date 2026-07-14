We need a website in which you can connect to Moonbeam/Moonriver with an Ethereum-enabled wallet (Like Metamask) and perform some operations via the proxy precompile:

- Offboard as an collator (schedule request to leave candidates, execute request to leave ccandidate)
- Remove the author mapping keys
- Balance transfer using the ERC_20 precompile

The idea is that all thee calls needed are wrapped in a proxy.proxy call and all of them via the precompile so we can execute them form the Ethereum wallet.

Note that we need an input box for the "Real account" but all other parameters should be retrieved onchain. You'll find the relevant documentation in the folloiwng links.

https://docs.moonbeam.network/builders/ethereum/precompiles/account/proxy/
https://docs.moonbeam.network/builders/ethereum/precompiles/features/staking/
https://docs.moonbeam.network/node-operators/networks/collators/activities/#stop-collating
https://docs.moonbeam.network/node-operators/networks/collators/author-mapping/
https://docs.moonbeam.network/builders/ethereum/precompiles/ux/erc20/

You can ask me questions about design but I want you to execute the development without any stops/checkpoints