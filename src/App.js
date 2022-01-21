import React, { useEffect, useState } from 'react';
import DateTimePicker from 'react-datetime-picker';
import './App.css';

import NamiWalletApi, { Cardano } from './nami-js';
import blockfrostApiKey from '../config.js'; 

let wallet;
let walletAPI;

export default function App() {
    const [connected, setConnected] = useState()
    const [address, setAddress] = useState()
    const [nfts, setNfts] = useState([])
    const [balance, setBalance] = useState()
    const [transaction, setTransaction] = useState()
    const [amount, setAmount] = useState("10")
    const [txHash, setTxHash] = useState()
    const [recipientAddress, setRecipientAddress] = useState("addr_test1qqsjrwqv6uyu7gtwtzvhjceauj8axmrhssqf3cvxangadqzt5f4xjh3za5jug5rw9uykv2klc5c66uzahu65vajvfscs57k2ql")
    const [witnesses, setWitnesses] = useState()
    const [policy, setPolicy] = useState()
    const [builtTransaction, setBuiltTransaction] = useState() 

    const [complextxHash, setComplextxHash] = useState()
    const [policyExpiration, setPolicyExpiration] = useState(new Date());
    const [complexTransaction, setComplexTransaction] = useState({
        recipients: [
            {
                address:"addr_test1qqsjrwqv6uyu7gtwtzvhjceauj8axmrhssqf3cvxangadqzt5f4xjh3za5jug5rw9uykv2klc5c66uzahu65vajvfscs57k2ql",
                amount: "3",
                mintedAssets:[
                    {
                        assetName: "MyNFT",
                        quantity:'1', 
                        policyId: "Example PolicyID",
                        policyScript:"ExamplePolicy"
                    }
                ]
            }
        ]
    })

    useEffect(() => {
        const defaultDate = new Date();
        defaultDate.setTime(defaultDate.getTime() + (1 * 60 * 90 * 1000))
        setPolicyExpiration(defaultDate);

    }, [])

    useEffect(() => {
        async function t() {
            const S = await Cardano();
            const walletName = localStorage.getItem('wallet_name')

            setTimeout(async () => {
                if(typeof window.cardano[walletName] !== undefined) {
                    wallet = new Wallet(window.cardano[walletName])
                    if (await wallet.isInstalled()) {
                        await wallet.isEnabled().then(async result => {
                            setConnected(result)

                            let walletInnerApi = await wallet.enable()

                            walletAPI = new WalletApi(
                                S,
                                wallet,
                                walletInnerApi,
                                blockfrostApiKey
                            )
                        })
                    }
                }
            }, 3000) // timout required because ccvault take a few seconds to inject api
        }

        const isWalletEnabled = localStorage.getItem('wallet_enabled')
        const walletName = localStorage.getItem('wallet_name')
        if(isWalletEnabled && walletName !== null) {
            t()
        }
    }, [])
   
    const connect = async (walletName) => {
        // Connects nami wallet to current website 
        const S = await Cardano();

        if(typeof window.cardano[walletName] !== undefined) {
            wallet = new Wallet(window.cardano[walletName])
            let walletInnerApi = await wallet.enable()

            setConnected(true)

            walletAPI = new WalletApi(
                S,
                wallet,
                walletInnerApi,
                blockfrostApiKey
            )

            localStorage.setItem('wallet_enabled', true)
            localStorage.setItem('wallet_name', walletName)
        } else {
            console.error(`You do not have the selected wallet installed.`)
        }
    }

    const getAddress = async () => {
        // retrieve address of nami wallet
        if (!connected) {
            await connect()
        }
        await walletInnerApi.getAddress().then((newAddress) => { console.log(newAddress); setAddress(newAddress) })
    }


    const getBalance = async () => {
        if (!connected) {
            await connect()
        }
        await walletInnerApi.getBalance().then(result => { console.log(result); setNfts(result.assets); setBalance(result.lovelace) })
    }


    const buildTransaction = async () => {
        if (!connected) {
            await connect()
        }

        const recipients = [{ "address": recipientAddress, "amount": amount }]
        let utxos = await walletInnerApi.getUtxosHex();
        const myAddress = await walletInnerApi.getAddress();
        
        let netId = await walletInnerApi.getNetworkId();
        const t = await walletInnerApi.transaction({
            PaymentAddress: myAddress,
            recipients: recipients,
            metadata: null,
            utxosRaw: utxos,
            networkId: netId.id,
            ttl: 3600,
            multiSig: null
        })
        console.log(t)
        setTransaction(t)
    }
    
    const buildFullTransaction = async () => {
        if (!connected) {
            await connect()
        }

        try {
            const recipients = complexTransaction.recipients
            const metadataTransaction = complexTransaction.metadata
            console.log(metadataTransaction)
            let utxos = await walletInnerApi.getUtxosHex();
            
            const myAddress = await walletInnerApi.getAddress();
            console.log(myAddress)
            let netId = await walletInnerApi.getNetworkId();

            const t = await walletInnerApi.transaction({
                PaymentAddress: myAddress,
                recipients: recipients,
                metadata: metadataTransaction,
                utxosRaw: utxos,
                networkId: netId.id,
                ttl: 3600,
                multiSig: null
            })

            setBuiltTransaction(t)
            const signature = await walletInnerApi.signTx(t)
            console.log(t, signature, netId.id)
            const txHash = await walletInnerApi.submitTx({
                transactionRaw: t,
                witnesses: [signature],

                networkId: netId.id
            })
            console.log(txHash)
            setComplextxHash(txHash)
        } catch (e){
            console.log(e)
        }
    }
    
    const signTransaction = async () => {
        if (!connected) {
            await connect()
        }

        const witnesses = await walletInnerApi.signTx(transaction)
        setWitnesses(witnesses)
    }

    const submitTransaction = async () => {
        let netId = await walletInnerApi.getNetworkId();
        const txHash = await walletInnerApi.submitTx({
            transactionRaw: transaction,
            witnesses: [witnesses],

            networkId: netId.id
        })
        setTxHash(txHash)
    }

    const createPolicy = async () => {
        console.log(policyExpiration)
        try {
            walletInnerApi = await wallet.enable()
            
            const myAddress = await walletInnerApi.getHexAddress();
            
            let networkId = await walletInnerApi.getNetworkId()
            const newPolicy = await walletInnerApi.createLockingPolicyScript(myAddress, networkId.id, policyExpiration)

            setPolicy(newPolicy)
            setComplexTransaction((prevState) => {
                const state = prevState;
                state.recipients[0].mintedAssets[0].policyId = newPolicy.id; 
                state.recipients[0].mintedAssets[0].policyScript = newPolicy.script; 
                state.metadata = {
                    "721": {
                        [newPolicy.id]: {
                            [state.recipients[0].mintedAssets[0].assetName]: {
                                name: "MyNFT",
                                description: "Test NFT",
                                image: "ipfs://QmUb8fW7qm1zCLhiKLcFH9yTCZ3hpsuKdkTgKmC8iFhxV8"
                            }
                        }
                    }
                };
                
                return {...state}
            })
        } catch (e) {
            console.log(e)
        }
    }

    return (<>
        <div className="container">
            <h1 style={{ textAlign: "center" }}>Introduction to basic Nami wallet functionalities</h1>
            <p>In these small examples we demonstrate basic Nami wallet functionalities.</p>
            <p>If you do not have Nami Wallet installed you can download Nami Wallet <a href="https://namiwallet.io/" target="_blank"> here</a>.</p>
            <div className="container">
                <div className="row" >
                    <h1> 1. Connect your website to Nami Wallet</h1>
                </div>
                <div className="row" >
                    <button className={`button ${connected ? "success" : ""}`} onClick={() => connect('nami')} > {connected ? "Connected" : "Connect to Nami"} </button>
                </div>
                <div className="row" >
                    <h1> 2. Retrieve your Nami wallet address</h1>
                </div>
                <div className="row" >
                    <button className={`button ${address ? "success" : ""}`} onClick={getAddress}> Get Your Address </button>
                    {address && <div className="item address">
                        <p>My Address:  {address} </p>
                    </div>}
                </div>
                <div className="row" >
                    <h1> 3. Retrieve your balance and NFTs</h1>
                </div>
                <div className="row" >
                    <button className={`button ${balance ? "success" : ""}`} onClick={getBalance}> Get Your Balance and NFTs </button>
                    {balance && <> <div className="column" >
                        <div className="item balance"><p>Balance ₳:  {balance / 1000000.} </p>

                        </div>


                        {nfts.map((nft) => {
                            return <><div className="item nft"><p>unit: {nft.unit}</p>
                                <p>quantity: {nft.quantity}</p>
                                <p>policy: {nft.policy}</p>
                                <p>name: {nft.name}</p>
                                <p>fingerprint: {nft.fingerprint}</p>
                            </div>
                            </>

                        })}
                    </div>
                    </>
                    }

                </div>
                <div className="row" >
                    <h1> 4. Build Transaction</h1>
                </div>
                <div className="row" >
                    <button className={`button ${(transaction) ? "success" : ""}`} onClick={() => { if (amount && recipientAddress) buildTransaction() }}> Build Transaction</button>
                    <div className="column">
                        <div className="item address"><p> Amount</p><input style={{ width: "400px", height: "30px", }}
                            value={amount}
                            onChange={(event) => setAmount(event.target.value.toString())} /></div>

                        <div className="item address"><p> Recipient Address</p>
                            <input style={{ width: "400px", height: "30px" }}
                                value={recipientAddress}
                                onChange={(event) => setRecipientAddress(event.target.value.toString())} /></div>
                    </div>
                </div>

                <div className="row" >
                    <h1> 5. Sign Transaction</h1>
                </div>
                <div className="row" >
                    <button className={`button ${(witnesses) ? "success" : ""}`} onClick={() => { if (transaction) signTransaction() }}> Sign Transaction</button>
                    <div className="column"></div>
                </div>
                <div className="row" >
                    <h1> 6. Submit Transaction</h1>
                </div>
                <div className="row" >
                    <button className={`button ${(txHash) ? "success" : ""}`} onClick={() => { console.log(witnesses); if (witnesses) submitTransaction() }}> Submit Transaction</button>

                    <div className="column" >
                        <div className="item address">
                            <p>TxHash:  {txHash} </p>
                        </div>
                    </div>

                </div>
                <div className="row" >
                    <h1> 7. Create Policy Script</h1>
                </div>
                <div className="row" >
                    <button className={`button ${(policy) ? "success" : ""}`} onClick={() => { if (policyExpiration) createPolicy() }}> Create Policy</button>

                    <div className="column" >
                    <p>Set Policy Expriaton Date: <DateTimePicker
                               onChange={setPolicyExpiration}
                               value={policyExpiration}
                               minDate={new Date()}
                           />
                           </p>
                        <div className="item address">
                            <p>policyId:  {policy?.id} </p>
                            <p>policyScript:  {policy?.script} </p>
                            <p>paymentKeyHash:  {policy?.paymentKeyHash} </p>
                            <p>ttl:  {policy?.ttl} </p>
                        </div>
                    </div>
                </div>
            </div>
                <div className="row" >
                    <h1> 8. Build Full Transaction (incl. Minting)</h1>
                </div>
                <div className="row" >
                    <button className={`button ${(complextxHash) ? "success" : ""}`} onClick={ buildFullTransaction}> Build Transaction</button>
                    <div className="column">
                        <div className="item address">
                                <p>Complex TxHash:  {complextxHash} </p>
                            </div>

                            <div className="item address"><p> Recipients Input</p><textarea style={{ width: "400px", height: "500px", }}
                                value={JSON.stringify(complexTransaction)}
                                onChange={(event) => 
                                {setComplexTransaction((prevState) =>( {...JSON.parse(event.target.value)}))}} />
                            </div>
                        <div className="item address">
                            <p>Transaction Hash: </p> <textarea style={{ width: "400px", height: "500px", }} value={builtTransaction} />
                        </div>
                    </div>
                </div>
        </div>

    </>
    )
}