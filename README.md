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
Decode hashed transaction and output transaciton as json.
```js
await nami.decodeTransaction(transactionHex) 
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


## Feature Requests
If you want to see any additional functionalities you can leave a feature request. We are going to expand this repository over time and react to your feedback.

## Support 
If you find this repository helpful, please follow me on twitter [https://twitter.com/CardanoFanB](https://twitter.com/CardanoFanB) and have a look at our projects NFT Project [https://partyanimals.dance](https://partyanimals.dance/) and 
[https://cfanboyminter.web.app/](https://cfanboyminter.web.app/). Thank you for you support!

