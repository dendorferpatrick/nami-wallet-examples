# Nami Wallet examples
<p align="center"><img src="https://partyanimals.dance/favicon.png" alt="PartyAnimals" width="200"/></p>

We implemented many Nami wallet functionalities for our NFT project "Party Animals" [https://partyanimals.dance](https://partyanimals.dance/). 

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


## Basic Functionalities

In the repositories, you can find the following basic functionalities.
    
    checkConnection() : checks if Nami Wallet is connected
    
    connect(): connects your website with the Nami Wallet
    
    getAddress(): retrieves address of Nami Wallet
 
    getBalance(): shows balance and NFTs in Nami Wallet
    

## Feature Requests
If you want to see any additional functionalities you can leave a feature request. We are going to expand this repository over time and react to your feedback.

## Support 
If you find this repository helpful, please visit our NFT Project [https://partyanimals.dance](https://partyanimals.dance/) and support us:) 
