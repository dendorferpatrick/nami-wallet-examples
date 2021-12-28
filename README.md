# Nami Wallet examples
<p align="center"><img src="https://partyanimals.dance/favicon.png" alt="PartyAnimals" width="200" style="margin-right:10px"/><img style="margin-left:10px" src="https://cfanboyminter.web.app/favicon.ico" alt="CardanoFanBoyMinter" width="200"/></p>

We implemented many Nami wallet functionalities for our NFT project "Party Animals" [https://partyanimals.dance](https://partyanimals.dance/) and [https://cfanboyminter.web.app/](https://cfanboyminter.web.app/). 

In this repository, we want to share how to implement the basic functionalities of Nami Wallet on your website.

## About Nami Wallet
Nami Wallet is a browser-based wallet extension to interact with the Cardano blockchain. It's an open-source project and built by Berry Pool.

You can download the wallet for different browsers here ([https://namiwallet.io](https://namiwallet.io/))


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

## Getting started Functionalities
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
Get balance and assets in wallet
```js
async nami.getBalance () : {lovelave: <amountLovelace>, assets: <assetList>}
```
Build transaction 
```js
let transaction = await nami.transaction( PaymentAddress = "", recipients = [{address: "", amount: "0" ,assets:[],   mintedAssets: []}], metadata = null, utxosRaw = [], networkId = 0, ttl = 3600, multiSig = false) 


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

// example policy that expires in 90 miniutes from now
const expirationTime = new Date();
expirationTime.setTime(expirationTime.getTime() + (1 * 60 * 90 * 1000))

let policy = await nami.createLockingPolicyScript(await nami.getHexAddress(), networkId , expirationTime)
```
    

## Feature Requests
If you want to see any additional functionalities you can leave a feature request. We are going to expand this repository over time and react to your feedback.

## Support 
If you find this repository helpful, please follow me on twitter [https://twitter.com/CardanoFanB](https://twitter.com/CardanoFanB) and have a look at our projects NFT Project [https://partyanimals.dance](https://partyanimals.dance/) and 
[https://cfanboyminter.web.app/](https://cfanboyminter.web.app/). Thank you for you support!

