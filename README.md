# Nami Wallet examples
<p align="center"><img src="https://partyanimals.dance/favicon.png" alt="PartyAnimals" width="200" style="margin-right:10px"/><img style="margin-left:10px" src="https://cfanboyminter.web.app/favicon.ico" alt="CardanoFanBoyMinter" width="200"/></p>

We implemented many Nami wallet functionalities for our NFT project "Party Animals" [https://partyanimals.dance](https://partyanimals.dance/) and [https://cfanboyminter.web.app/](https://cfanboyminter.web.app/). 

In this repository, we want to share how to implement the basic functionalities of Nami Wallet on your website.

## About Nami Wallet
Nami Wallet is a browser-based wallet extension to interact with the Cardano blockchain. It's an open-source project and built by Berry Pool.

You can download the wallet for different browsers here ([https://namiwallet.io](https://namiwallet.io/))

If you find this repository useful and want to support us, you can donate ADA to this wallet ```addr1qysjrwqv6uyu7gtwtzvhjceauj8axmrhssqf3cvxangadqzt5f4xjh3za5jug5rw9uykv2klc5c66uzahu65vajvfscshgt2vq```. 
## Setup
To run the application locally these installation steps:
```
// Install packages for application
npm install

// Install the module with cardano serialization lib
cd src/nami-js
npm install

// Return to workspace
cd ../..
```
To run the application start the node process with
```
npm run start
```
Run our example app to try out the functionalities of our package.

Before you can use the NamiWalletApi you have to create an account to get a blockfrost api key https://blockfrost.io/.
Create a ```./config.js``` file and add your API key information.
```js
const blockfrostApiKey = {
    0: "rbkrp5hOr3khPAWNo3x47t6CP7qKFyA5", // testnet
    1: "mainnetfqH0CVlBesnsj5IKhgIYCn231KzqUOyk" // mainnet
}

export default blockfrostApiKey;
```

## Getting started 
Import Nami Wallet
```js
import NamiWalletApi, { Cardano } from './nami-js';

//React example
let nami; 
 useEffect(() => {
        async function t() {

            const S = await Cardano();
            nami = new NamiWalletApi(
                S,
                window.cardano,
               {
                0: "yourBlockfrostTestnetApiKey", // testnet
                1: "yourBlockfrostMainnetApiKey" // mainnet
                }   
            )
        }
        t()
    }, [])



```
Before you can use the ```NamiWalletApi``` you have to create an account to get a blockfrost api key [https://blockfrost.io/](https://blockfrost.io/).

Check if Nami is installed
```js
nami.isInstalled()
```

Check if Nami is enabled
```js
nami.isEnabled() 
```
Enable Nami
```js
nami.enable()
```
Get Bech32 Address 
```js
let address = nami.getAddress() 
console.log(address)
```
Nami Address Hex Format
```js
nami.getHexAddress()
```
Get Current Network of Nami
```js
let network = nami.getNetworkId()
console.log(network)
```
Get balance and assets in wallet (be aware that the amount can be more than shown in the nami wallet because if you hold NFTs those capture some of your ADA)
```js
async nami.getBalance () : {lovelave: <amountLovelace>, assets: <assetList>}
```
Build transaction 
```js
let transaction = await nami.transaction( PaymentAddress = "", 
recipients = [{address: "", amount: "0" ,assets:[],   mintedAssets: []}], 
metadata = null, 
metadataHash = null, 
addMetadata = true, 
utxosRaw = [],
networkId = 0, 
ttl = 3600, 
multiSig = false) 


// Example 

let transaction = await nami.transaction(
    PaymentAddress = "addr_test1qqe5eg44cq6805apc2wru7vk0tdn6weurckl9j0jwx958af8yp00jmh469gvx9vlyf6fwf9dfkjselmyvylm8yjyufuskfku3a", 
    utxos = (await nami.getUtxosHex()), 
    recipients = [{address:"addr_test1qqsjrwqv6uyu7gtwtzvhjceauj8axmrhssqf3cvxangadqzt5f4xjh3za5jug5rw9uykv2klc5c66uzahu65vajvfscs57k2ql","amount":"3",
    assets: [{unit:"5612bdcde30b1edf25823f62aa73c1b06831fb0f406c6c812da455db.TestNft", quantity: "1"}],  // Existing Assets
    mintedAssets:[{"assetName":"MyNFT","quantity":"1",
    "policyId":"Example PolicyID","policyScript":"ExamplePolicy"}] // NFTs to be minted
    ], // list of recipients
    metadata = {"721":
    {"8201828200581c334ca2b5c03477d3a1c29c3e79967adb3d3b3c1e2df2c9f2718b43f582051a030c5adf":
    {"MyNFT":{"name":"MyNFT","description":"This is a test NFT","image":"ipfs://QmUb8fW7qm1zCLhiKLcFH9yTCZ3hpsuKdkTgKmC8iFhxV8"}}}} //Metadata following NFT standard

```
Sign transaction 
```js
const witness = await nami.signTx(transaction)
```

Submit transaction with blockfrost API
```js
await nami.submitTx( transactionRaw,witnesses,scripts,networkId)

//Example 
let txHash = await nami.submitTx( {transactionRaw: transaction,
                witnesses: [witness],
                networkId : (await getNetworkId()).id))
console.log(txHash)
```

Create Minitng Policy
```js
await nami.createLockingPolicyScript(address,  (await getNetworkId()).id , expirationTime)

// example policy that expires in 90 minutes from now
const expirationTime = new Date();
expirationTime.setTime(expirationTime.getTime() + (1 * 60 * 90 * 1000))

let policy = await nami.createLockingPolicyScript(await nami.getHexAddress(), networkId , expirationTime)
```

Hash Metadata (needed for multi-signature minting)
```js
nami.hashMetadata(metadata)
```
    
## Vending NFTs with multi-signature approach
If you want to sell your NFTs with a multi-signature approach, have a look here [Multi-Signature.md](./Multi-Signature.md)
## Feature Requests
If you want to see any additional functionalities you can leave a feature request. We are going to expand this repository over time and react to your feedback.

## Support 
If you find this repository helpful, please follow me on twitter [https://twitter.com/CardanoFanB](https://twitter.com/CardanoFanB) and have a look at our projects NFT Project [https://partyanimals.dance](https://partyanimals.dance/) and 
[https://cfanboyminter.web.app/](https://cfanboyminter.web.app/). 
If you like you can donate ADA to this wallet ```addr1qysjrwqv6uyu7gtwtzvhjceauj8axmrhssqf3cvxangadqzt5f4xjh3za5jug5rw9uykv2klc5c66uzahu65vajvfscshgt2vq```. 
Thank you for you support!

