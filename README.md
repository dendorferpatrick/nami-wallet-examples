# Nami Wallet Node JS functions
<p align="center"><img src="https://partyanimals.dance/favicon.png" alt="PartyAnimals" width="200" style="margin-right:10px"/><img style="margin-left:10px" src="https://cfanboyminter.web.app/favicon.ico" alt="CardanoFanBoyMinter" width="200"/></p>

We implemented many Nami wallet functionalities for our NFT project "Party Animals" [https://partyanimals.dance](https://partyanimals.dance/) and [https://cfanboyminter.web.app/](https://cfanboyminter.web.app/). 

In this repository, we want to share how to implement the basic functionalities of Nami Wallet on your website.


## Setup
To run the application locally these installation steps:
```
// Install packages for application
npm install
```
Before you can use the NamiWalletApi you have to create an account to get a blockfrost api key https://blockfrost.io/.
Create a ```./config.js``` file and add your API key information.
```js
const blockfrostApiKey = {
    0: "rbkrp5hOr3khPAWNo3x47t6CP7qKFyA5", // testnet
    1: "mainnetfqH0CVlBesnsj5IKhgIYCn231KzqUOyk" // mainnet
}

export default blockfrostApiKey;
```

## Getting started Functionalities
Import Nami Wallet
```js
var NamiWalletApi = require('./nami').NamiWalletApi
let blockfrostApiKey = {
                        0: "yourBlockfrostTestnetApiKey", // testnet
                        1: "yourBlockfrostMainnetApiKey" // mainnet
                        }
//React example
var nami =  new NamiWalletApi( blockfrostApiKey )             
```
Before you can use the ```NamiWalletApi``` you have to create an account to get a blockfrost api key [https://blockfrost.io/](https://blockfrost.io/).

Create new random private key
!!! Important !!! Store the key safely where noone unauthorized can access the private key
```js
nami.createNewBech32PrivateKey()
```
Set your private key
```js
nami.setPrivateKey(bech32PrivateKey)
```
Create minting policy
```js
await nami.createLockingPolicyScript(networkId, expirationTime)

// example policy that expires in 90 miniutes from now
const expirationTime = new Date();
expirationTime.setTime(expirationTime.getTime() + (1 * 60 * 90 * 1000))

let policy = await nami.createLockingPolicyScript(1, expirationTime)
```
Decodes hashed transaction and outputs transaction json including inputs, outputs, and fee.
```js
await nami.decodeTransaction(transactionHex, networkId): [inputs, outputs, metadata, fee]

// Example
let txHash = "84a600818258205decb3a13802de07a9aea0ce2d52d081907639bcf1c96cf19df6acd84af30a5a000182825839002121b80cd709cf216e589979633de48fd36c77840098e186ecd1d6804ba26a695e22ed25c4506e2f09662adfc531ad705dbf3546764c4c31821a0043d11ba1581c4f5285e230160b2723550d0b5acc1648e10e1b6f17f256449e7018a2a1454d794e46540182583900c99353318b89c0120fbae4338dddaba578fc0960e15454867446473ad56aa134c18a46183c03355036b21cbe4cc6f816ec2b718863463491821a0123cd04a3581ccddc4320fe2f2176f1b532e994c06b62f8e462bf59a047c653e30e35a14750696b6163687507581ce94a22f4ce53a6fb9e09bf435ea683b82b07cab0199207893b206858a14c4d794578616d706c654e465401581cf206dbf287305bd3efbf2e41dd20185631a582dfa75e8f423a077f13a14c4d794578616d706c654e465401021a0002ef81031a02caf4c2075820fb1bc0a4070a3962eddeaa4280e642376b22f1e07f02b05a4128ae9bdd2c2ad909a1581c4f5285e230160b2723550d0b5acc1648e10e1b6f17f256449e7018a2a1454d794e465401a101818201828200581cc99353318b89c0120fbae4338dddaba578fc0960e15454867446473a82051a031d4837f5a11902d1a178383466353238356532333031363062323732333535306430623561636331363438653130653162366631376632353634343965373031386132a1654d794e4654a36b6465736372697074696f6e6854657374204e465465696d6167657835697066733a2f2f516d556238665737716d317a434c68694b4c634648397954435a33687073754b646b54674b6d4338694668785638646e616d65654d794e4654"

let networkId = 0 // testnet
let [inputs, outputs, metadata, fee] = await nami.decodeTransaction(txHash, networkId) 

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
                networkId : 1)
console.log(txHash)
```
Hash Metadata (needed for multi-signature minting)
```js
nami.hashMetadata(metadata)
```

## Vending NFTs with multi-signature approach
If you want to sell your NFTs with a multi-signature approach, have a look here [Multi-Signature.md](https://github.com/dendorferpatrick/nami-wallet-examples/blob/master/Multi-Signature.md)

## Feature Requests
If you want to see any additional functionalities you can leave a feature request. We are going to expand this repository over time and react to your feedback.

## Support 
If you find this repository helpful, please follow me on twitter [https://twitter.com/CardanoFanB](https://twitter.com/CardanoFanB) and have a look at our projects NFT Project [https://partyanimals.dance](https://partyanimals.dance/) and 
[https://cfanboyminter.web.app/](https://cfanboyminter.web.app/). Thank you for you support!

