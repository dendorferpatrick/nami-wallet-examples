var S = require('@emurgo/cardano-serialization-lib-nodejs')
var Buffer = require('buffer').Buffer;
const fetchPromise = import('node-fetch').then(mod => mod.default)
const fetch = (...args) => fetchPromise.then(fetch => fetch(...args))
; 

const ERROR = {
    FAILED_PROTOCOL_PARAMETER: 'Couldnt fetch protocol parameters from blockfrost',
    TX_TOO_BIG: 'Transaction too big'
}

function harden(num) {
    return 0x80000000 + num;
  }
  

class NamiWalletApi {
    constructor(blockfrostApiKey) {
        this.blockfrostApiKey = blockfrostApiKey; 
        this.privateKey = null; 
        this.accountKey = null; 
        this.utxoPubKey = null; 
        this.stakeKey = null; 
    }

    setPrivateKey(bech32PrivateKey) {
        // generating all keys following https://github.com/Emurgo/cardano-serialization-lib/blob/master/doc/getting-started/generating-keys.md
        this.privateKey = S.Bip32PrivateKey.from_bech32(bech32PrivateKey)


        this.accountKey = this.privateKey 
        .derive(harden(1852)) // purpose
        .derive(harden(1815)) // coin type
        .derive(harden(0)); // account #0

        this.utxoPubKey = this.accountKey
        .derive(0) // external
        .derive(0)
        .to_public();

        this.stakeKey = this.accountKey
        .derive(2) // chimeric
        .derive(0)
        .to_public();
        console.log("key successfully set!")
    }
    createNewBech32PrivateKey() {
          let key = S.Bip32PrivateKey.generate_ed25519_bip32(); 
          return key.to_bech32()
    }
   

    getApiKey(networkId) {
        return this.blockfrostApiKey[networkId]
        
    }

 

    async createLockingPolicyScript( networkId, expirationTime) {
        var now = new Date()

        const protocolParameters = await this._getProtocolParameter(networkId);
        
        const slot = parseInt(protocolParameters.slot);
        const duration = parseInt((expirationTime.getTime() - now.getTime())/1000)

        const ttl = slot + duration;

        const baseAddr = S.BaseAddress.new(
            networkId,
            S.StakeCredential.from_keyhash(this.utxoPubKey.to_raw_key().hash()),
            S.StakeCredential.from_keyhash(this.stakeKey.to_raw_key().hash()),
          );
          
        const paymentKeyHash = baseAddr
            .payment_cred()
            .to_keyhash();

        
        
        const nativeScripts = S.NativeScripts.new();
        const script = S.ScriptPubkey.new(paymentKeyHash);
        const nativeScript = S.NativeScript.new_script_pubkey(script);
        const lockScript = S.NativeScript.new_timelock_expiry(
            S.TimelockExpiry.new(ttl)
        );
        nativeScripts.add(nativeScript);
        nativeScripts.add(lockScript);
        const finalScript = S.NativeScript.new_script_all(
            S.ScriptAll.new(nativeScripts)
        );
        const policyId = Buffer.from(
            S.ScriptHash.from_bytes(
                finalScript.hash().to_bytes()
            ).to_bytes(),
            "hex"
        ).toString("hex");
        return {
            id: policyId,
            script: Buffer.from(finalScript.to_bytes()).toString("hex"),
            paymentKeyHash: Buffer.from(paymentKeyHash.to_bytes(), "hex").toString("hex"),
            ttl
        };
    }



    async decodeTransaction(transactionHex, networkId ) {

        const recipients = {}

        const transaction = S.Transaction.from_bytes(Buffer.from(transactionHex, "hex"));
       
        const transaction_body = transaction.body()
        // get outputs 
        transaction_body.inputs().len
        const outputs = transaction_body.outputs()
      
        // get inputs
        const inputs = transaction_body.inputs()

        // check number of outputs
        let txInputs = {}
        for (let inputIndex of [...Array(inputs.len()).keys()]) {
            const input = inputs.get(inputIndex);
            const txIndex = input.index()

            const txHash = Buffer.from(
                input.transaction_id().to_bytes(),
                'hex'
            ).toString('hex')

            const tx = await this._blockfrostRequest({
                endpoint: `/txs/${txHash}/utxos`,
                networkId: networkId,
                method: "GET"
            });

            const txInput = tx.outputs.filter((row) => row.output_index == txIndex)[0]

          
            if (typeof txInputs[txInput.address] == "undefined") {
                txInputs[txInput.address] = {
                    amount: 0,
                    assets: {}
                }
            }
            txInput.amount.map((amount) => {
               
                
                if (amount.unit == "lovelace") {
                    txInputs[txInput.address].amount += parseInt(amount.quantity)
                } else {
                    let unit = amount.unit.slice(0, 56) + "." + HexToAscii(amount.unit.slice(56))
                    if (typeof txInputs[txInput.address].assets[unit] == "undefined") {


                        txInputs[txInput.address].assets[unit] = 0
                    }
                    
                    txInputs[txInput.address].assets[unit] = txInputs[txInput.address].assets[unit] + parseInt(amount.quantity)
                 
                }
                
            })
        
        }
        
        for (let outputIndex of [...Array(outputs.len()).keys()]) {
            let outputTransaction = outputs.get(outputIndex);
            let outputAddress = outputTransaction.address().to_bech32().toString()
            if (typeof recipients[outputAddress] == "undefined") {
                recipients[outputAddress] = {
                    amount: 0,
                    assets: {}
                }
            }

            recipients[outputAddress].amount += parseInt(outputTransaction.amount().coin().to_str())
            if (outputTransaction.amount().multiasset()) {
                let multiAssets = outputTransaction.amount().multiasset()
                let multiAssetKeys = multiAssets.keys()

                for (let assetsKeyIndex of [...Array(multiAssets.keys().len()).keys()]) {
                    let assetsKey = multiAssetKeys.get(assetsKeyIndex)
                    let assets = multiAssets.get(assetsKey)
                    let assetKeys = assets.keys()
                    let policyId = Buffer.from(assetsKey.to_bytes()).toString("hex")
                    for (let assetKeyIndex of [...Array(assetKeys.len()).keys()]) {
                        let asset = assetKeys.get(assetKeyIndex)
                        let assetNum = assets.get(asset)
                        let unit = policyId + "." + HexToAscii(Buffer.from(asset.name()).toString("hex"))

                        recipients[outputAddress].assets[unit] = parseInt( assetNum.to_str());
                    }
                }



            }
        }

        const auxiliary_data = transaction.auxiliary_data()
        
        const _metadata = auxiliary_data.metadata()
        let metadata = {}
        if (_metadata){
 
        const metadataKeys = _metadata.keys()
        
        for (let metadataKeyIndex of [...Array(metadataKeys.len()).keys()]){
            const metadataKey = metadataKeys.get(metadataKeyIndex)
            const metadataRaw = _metadata.get(metadataKey)
            const metadataJson = JSON.parse(S.decode_metadatum_to_json_str(metadataRaw, 0))
            metadata[metadataKey.to_str()] = metadataJson

        }
        }
        
        
       
        Object.keys(txInputs).map((senderAddress) => {
            if (recipients[senderAddress] != "undefined") {
                txInputs[senderAddress].amount -= recipients[senderAddress].amount;
                recipients[senderAddress].amount = 0;
            

                Object.entries(recipients[senderAddress].assets).forEach(([unit, quantity]) => {
                    
                    if (typeof txInputs[senderAddress].assets[unit] != "undefined") {
                        txInputs[senderAddress].assets[unit] -= quantity;
                        recipients[senderAddress].assets[unit] = 0;
                        delete recipients[senderAddress].assets[unit];
                        if (txInputs[senderAddress].assets[unit] == 0) delete txInputs[senderAddress].assets[unit]
                    }

                })
            }
        })

        let inputValue = 0
        let outputValue = 0
        
        const recipientsFinal = []
        Object.keys(recipients).map((key) => {
            if ((recipients[key].amount > 0) || Object.keys(recipients[key].assets).length > 0) recipientsFinal.push({
                address: key,
                ...recipients[key]
            })
        })
        const txInputsFinal = Object.keys(txInputs).map((key) => {
            return {
                address: key,
                ...txInputs[key]
            }
        })
        
        for (let r of recipientsFinal) {
            outputValue += r.amount
        }
        for (let s of txInputsFinal) {
            inputValue += s.amount
        }
        const fee = inputValue - outputValue

        return [txInputsFinal, recipientsFinal, metadata, fee]
    }

    async transaction({
        PaymentAddress = "",
        recipients = [],
        metadata = null,
        utxosRaw = [],
        networkId = 0,
        ttl = 3600, 
        multiSig = false
    }) {
        
        
        let utxos = utxosRaw.map(u => this.S.TransactionUnspentOutput.from_bytes(
            Buffer.from(
                u,
                'hex'
            )
        ))
        let protocolParameter = await this._getProtocolParameter(networkId)
        let mintedAssetsArray = []
        let outputs = this.S.TransactionOutputs.new()
        
        let minting = 0;
        let outputValues = {}
        let costValues = {}
        for (let recipient of recipients) {
            let lovelace = Math.floor((recipient.amount || 0) * 1000000).toString()
            let ReceiveAddress = recipient.address
            let multiAsset = this._makeMultiAsset(recipient?.assets || [])
            let mintedAssets = this._makeMintedAssets(recipient?.mintedAssets || [])
            
            let outputValue = this.S.Value.new(
                this.S.BigNum.from_str(lovelace)
            )
            let minAdaMint = this.S.Value.new(
                this.S.BigNum.from_str("0")
            )

            if (((recipient?.assets || []).length > 0)) {
                outputValue.set_multiasset(multiAsset)
                let minAda = this.S.min_ada_required(
                    outputValue,
                    this.S.BigNum.from_str(protocolParameter.minUtxo)
                )
                
                if (this.S.BigNum.from_str(lovelace).compare(minAda) < 0) outputValue.set_coin(minAda)

            }
            (recipient?.mintedAssets || []).map((asset) => {
                minting += 1;
                mintedAssetsArray.push({
                    ...asset,
                    address: recipient.address
                })
            })



            
          
            if (parseInt(outputValue.coin().to_str()) > 0) {
                outputValues[recipient.address] = outputValue
            }
            if ((recipient.mintedAssets || []).length > 0) {
                
                minAdaMint = this.S.min_ada_required(
                    mintedAssets,
                    this.S.BigNum.from_str(protocolParameter.minUtxo)
                );
                
                let requiredMintAda = this.S.Value.new(
                    this.S.BigNum.from_str("0")
                )
                requiredMintAda.set_coin(minAdaMint)
                if (outputValue.coin().to_str() == 0 ){
                    outputValue = requiredMintAda
                } else {
                    outputValue = outputValue.checked_add(requiredMintAda)
                }


            }
            if (ReceiveAddress != PaymentAddress) costValues[ReceiveAddress] = outputValue
            outputValues[ReceiveAddress] = outputValue
            if (parseInt(outputValue.coin().to_str()) > 0) {

                outputs.add(
                    this.S.TransactionOutput.new(
                        this.S.Address.from_bech32(ReceiveAddress),
                        outputValue

                    )
                )

            }

        }
        let RawTransaction = null
        if (minting > 0) {

            outputValues[PaymentAddress] = this.S.Value.new(
                this.S.BigNum.from_str("0"))

            
            RawTransaction = await this._txBuilderMinting({
                PaymentAddress: PaymentAddress,
                Utxos: utxos,
                Outputs: outputs,
                mintedAssetsArray: mintedAssetsArray,
                outputValues: outputValues,
                ProtocolParameter: protocolParameter,
                metadata: metadata,
                multiSig: multiSig, 
                ttl: ttl,
                costValues: costValues
            })
        } else {
            RawTransaction = await this._txBuilder({
                PaymentAddress: PaymentAddress,
                Utxos: utxos,
                Outputs: outputs,
                ProtocolParameter: protocolParameter,
                Metadata: metadata,
                
                Delegation: null
            })
        }
        return Buffer.from(RawTransaction, "hex").toString("hex")
      
    }
    signTx(txHash){ 

        const transaction = S.Transaction.from_bytes(B.Buffer.from(txHash, "hex"));

        const transaction_body = transaction.body()
    
        const txBodyHash = S.hash_transaction(transaction_body)
    
        const witness = S.make_vkey_witness(txBodyHash, this.privateKey.to_raw_key())
        return witness

    }
   

    async submitTx({
        transactionRaw,
        witnesses,
        scripts,
        networkId, 
        metadata = null
    }) {

        
        let transaction = S.Transaction.from_bytes(Buffer.from(transactionRaw, "hex"))


        const txWitnesses = transaction.witness_set();
        const txVkeys = txWitnesses.vkeys();
        const txScripts = txWitnesses.native_scripts();
        const totalVkeys = S.Vkeywitnesses.new();
        const totalScripts = S.NativeScripts.new();


        for (witness in witnesses){
        
        const addWitnesses = S.TransactionWitnessSet.from_bytes(
            Buffer.from(witnesses[0], "hex")
        );
        const addVkeys = addWitnesses.vkeys();
        if (addVkeys) {
            for (let i = 0; i < addVkeys.len(); i++) {
                totalVkeys.add(addVkeys.get(i));
            }
        }
      
        }
      

        if (txVkeys) {
            for (let i = 0; i < txVkeys.len(); i++) {
                totalVkeys.add(txVkeys.get(i));
            }
        }
        if (txScripts) {
            for (let i = 0; i < txScripts.len(); i++) {
                totalScripts.add(txScripts.get(i));
            }
        }
       

        const totalWitnesses = S.TransactionWitnessSet.new();
        totalWitnesses.set_vkeys(totalVkeys);
        totalWitnesses.set_native_scripts(totalScripts);
        let aux; 
        if (metadata){


        aux = S.AuxiliaryData.new()
        const generalMetadata = S.GeneralTransactionMetadata.new();
        Object.entries(metadata).map(([MetadataLabel, Metadata]) => {
        
        generalMetadata.insert(
            this.S.BigNum.from_str(MetadataLabel),
            this.S.encode_json_str_to_metadatum(JSON.stringify(Metadata), 0)
        );
        });

        aux.set_metadata(generalMetadata)      
        } else {
            aux = transaction.auxiliary_data(); 
        }
        const signedTx = await S.Transaction.new(
            transaction.body(),
            totalWitnesses,
            aux
        );
        const txhash = await this._blockfrostRequest({
            endpoint: `/tx/submit`,
            headers: {
                "Content-Type": "application/cbor"
            },
            body: Buffer.from(signedTx.to_bytes(), "hex"),
            networkId: networkId,
            method: "POST"
        });
        
        return txhash

    }





    hashMetadata(metadata){
        let aux = S.AuxiliaryData.new()
        
        
        const generalMetadata = S.GeneralTransactionMetadata.new();
        Object.entries(metadata).map(([MetadataLabel, Metadata]) => {
        
        generalMetadata.insert(
            S.BigNum.from_str(MetadataLabel),
            S.encode_json_str_to_metadatum(JSON.stringify(Metadata), 0)
        );
        });

        aux.set_metadata(generalMetadata)
        
        
        

    const metadataHash = S.hash_auxiliary_data(aux);
    return Buffer.from(metadataHash.to_bytes(), "hex").toString("hex")

    }



    //////////////////////////////////////////////////


    _makeMintedAssets(mintedAssets) {
     
        let AssetsMap = {}

        for (let asset of mintedAssets) {
            let assetName = asset.assetName
            let quantity = asset.quantity
            if (!Array.isArray(AssetsMap[asset.policyId])) {
                AssetsMap[asset.policyId] = []
            }
            AssetsMap[asset.policyId].push({
                "unit": Buffer.from(assetName, 'ascii').toString('hex'),
                "quantity": quantity
            })

        }
        let multiAsset = this.S.MultiAsset.new()
        
        for (const policy in AssetsMap) {

            const ScriptHash = this.S.ScriptHash.from_bytes(
                Buffer.from(policy, 'hex')
            )
            const Assets = this.S.Assets.new()

            const _assets = AssetsMap[policy]

            for (const asset of _assets) {
                const AssetName = this.S.AssetName.new(Buffer.from(asset.unit, 'hex'))
                const BigNum = this.S.BigNum.from_str(asset.quantity)

                Assets.insert(AssetName, BigNum)
            }
            
            multiAsset.insert(ScriptHash, Assets)
            
        }
        const value = this.S.Value.new(
            this.S.BigNum.from_str("0")
        );
        
        value.set_multiasset(multiAsset);
        return value
    }

    _makeMultiAsset(assets) {
        
        let AssetsMap = {}
        for (let asset of assets) {
            let [policy, assetName] = asset.unit.split('.')
            let quantity = asset.quantity
            if (!Array.isArray(AssetsMap[policy])) {
                AssetsMap[policy] = []
            }
            AssetsMap[policy].push({
                "unit": Buffer.from(assetName, 'ascii').toString('hex'),
                "quantity": quantity
            })

        }

        let multiAsset = this.S.MultiAsset.new()
     
        for (const policy in AssetsMap) {

            const ScriptHash = this.S.ScriptHash.from_bytes(
                Buffer.from(policy, 'hex')
            )
            const Assets = this.S.Assets.new()

            const _assets = AssetsMap[policy]

            for (const asset of _assets) {
                const AssetName = this.S.AssetName.new(Buffer.from(asset.unit, 'hex'))
                const BigNum = this.S.BigNum.from_str(asset.quantity.toString())

                Assets.insert(AssetName, BigNum)
            }
            
            multiAsset.insert(ScriptHash, Assets)
            
        }

        return multiAsset
    }

    _utxoToAssets(utxo) {
        let value = utxo.output().amount()
        const assets = [];
        assets.push({
            unit: 'lovelace',
            quantity: value.coin().to_str()
        });
        if (value.multiasset()) {
            const multiAssets = value.multiasset().keys();
            for (let j = 0; j < multiAssets.len(); j++) {
                const policy = multiAssets.get(j);
                const policyAssets = value.multiasset().get(policy);
                const assetNames = policyAssets.keys();
                for (let k = 0; k < assetNames.len(); k++) {
                    const policyAsset = assetNames.get(k);
                    const quantity = policyAssets.get(policyAsset);
                    const asset =
                        Buffer.from(
                            policy.to_bytes()
                        ).toString('hex') + "." +
                        Buffer.from(
                            policyAsset.name()
                        ).toString('ascii')


                    assets.push({
                        unit: asset,
                        quantity: quantity.to_str(),
                    });
                }
            }
        }
        return assets;
    }
    async _txBuilderMinting({
        PaymentAddress,
        Utxos,
        Outputs,
        ProtocolParameter,
        mintedAssetsArray = [],
    
        outputValues = {},
        metadata = null,
        ttl = 3600,
        multiSig = false, 
        costValues = {}
    }) {
        
       
        const MULTIASSET_SIZE = 5000;
        const VALUE_SIZE = 5000;
        const totalAssets = 0;

        
        
        CoinSelection.setProtocolParameters(
            ProtocolParameter.minUtxo.toString(),
            ProtocolParameter.linearFee.minFeeA.toString(),
            ProtocolParameter.linearFee.minFeeB.toString(),
            ProtocolParameter.maxTxSize.toString()
        )
        const selection = await CoinSelection.randomImprove(
            Utxos,
            Outputs,
            20 + totalAssets,
            
        )

        const nativeScripts = this.S.NativeScripts.new();
        let mint = this.S.Mint.new();
        
        let mintedAssetsDict = {}
        let assetsDict = {}
        for (let asset of mintedAssetsArray) {
            if (typeof assetsDict[asset.assetName] == "undefined") {
                assetsDict[asset.assetName] = {};
                assetsDict[asset.assetName].quantity = 0
                assetsDict[asset.assetName].policyScript = asset.policyScript;
            }
            assetsDict[asset.assetName].quantity = assetsDict[asset.assetName].quantity + parseInt(asset.quantity)
        }
        
        Object.entries(assetsDict).map(([assetName, asset])=>{
            
            
            const mintAssets = this.S.MintAssets.new();
            mintAssets.insert(
                this.S.AssetName.new(Buffer.from(assetName)),
                this.S.Int.new(this.S.BigNum.from_str(asset.quantity.toString()))
            );
           
            if (typeof mintedAssetsDict[asset.policyScript] == "undefined") {
                mintedAssetsDict[asset.policyScript] = this.S.MintAssets.new();
           
            }
            mintedAssetsDict[asset.policyScript].insert(
                this.S.AssetName.new(Buffer.from(assetName)),
                this.S.Int.new(this.S.BigNum.from_str(asset.quantity.toString()))
            );
         
           

        })


        for (let asset of mintedAssetsArray) {
            const multiAsset = this.S.MultiAsset.new();
            const mintedAssets = this.S.Assets.new();
           
            const policyScript = this.S.NativeScript.from_bytes(Buffer.from(asset.policyScript, "hex"))
            nativeScripts.add(policyScript);
            
            mintedAssets.insert(
                this.S.AssetName.new(Buffer.from(asset.assetName)),
                this.S.BigNum.from_str(asset.quantity.toString())
            );

            multiAsset.insert(
                this.S.ScriptHash.from_bytes(policyScript.hash(this.S.ScriptHashNamespace.NativeScript).to_bytes()),
                mintedAssets
            );
            const mintedValue = this.S.Value.new(
                this.S.BigNum.from_str("0")
            );
            mintedValue.set_multiasset(multiAsset);
            if (typeof outputValues[asset.address] == "undefined") {
                outputValues[asset.address] = this.S.Value.new(
                    this.S.BigNum.from_str("0")
                );
            }
            // if (asset.address != PaymentAddress) {
            //     let minAdaMint = this.S.min_ada_required(
            //         mintedValue,
            //         this.S.BigNum.from_str(ProtocolParameter.minUtxo)
            //     );

            //     mintedValue.set_coin(minAdaMint)
            // }
            outputValues[asset.address] = outputValues[asset.address].checked_add(mintedValue)
        }
      
        Object.entries(mintedAssetsDict).map(([policyScriptHex, mintAssets]) => {
        const policyScript = this.S.NativeScript.from_bytes(Buffer.from(policyScriptHex, "hex"))
        mint.insert(
            this.S.ScriptHash.from_bytes(
                policyScript
                    .hash(this.S.ScriptHashNamespace.NativeScript)
                    .to_bytes()
            ),
            mintAssets
        );
      
            }) 

       

        const inputs = this.S.TransactionInputs.new();
        
        selection.input.forEach((utxo) => {

            inputs.add(
                this.S.TransactionInput.new(
                    utxo.input().transaction_id(),
                    utxo.input().index()
                )
            );
            outputValues[PaymentAddress] = outputValues[PaymentAddress].checked_add(utxo.output().amount());
        });

  
        const rawOutputs = this.S.TransactionOutputs.new();
        
        Object.entries(outputValues).map(([address, value]) => {
            
            rawOutputs.add(
                this.S.TransactionOutput.new(
                    this.S.Address.from_bech32(address),
                    value
                )
            );
        })
        
        const fee = this.S.BigNum.from_str("0");
        const rawTxBody = this.S.TransactionBody.new(
            inputs,
            rawOutputs,
            fee,
            ttl + ProtocolParameter.slot
        );
        rawTxBody.set_mint(mint);

       

        let aux = this.S.AuxiliaryData.new()
        
        if (metadata) {
            const generalMetadata = this.S.GeneralTransactionMetadata.new();
            Object.entries(metadata).map(([MetadataLabel, Metadata]) => {
            
            generalMetadata.insert(
                this.S.BigNum.from_str(MetadataLabel),
                this.S.encode_json_str_to_metadatum(JSON.stringify(Metadata), 0)
            );
            });

            aux.set_metadata(generalMetadata)
            
            rawTxBody.set_auxiliary_data_hash(this.S.hash_auxiliary_data(aux));
            


        }

        rawTxBody.set_auxiliary_data_hash(this.S.hash_auxiliary_data(aux));
        const witnesses = this.S.TransactionWitnessSet.new();
        witnesses.set_native_scripts(nativeScripts);

        const dummyVkeyWitness =
            "8258208814c250f40bfc74d6c64f02fc75a54e68a9a8b3736e408d9820a6093d5e38b95840f04a036fa56b180af6537b2bba79cec75191dc47419e1fd8a4a892e7d84b7195348b3989c15f1e7b895c5ccee65a1931615b4bdb8bbbd01e6170db7a6831310c";

        const vkeys = this.S.Vkeywitnesses.new();
        vkeys.add(
            this.S.Vkeywitness.from_bytes(
                Buffer.from(dummyVkeyWitness, "hex")
            )
        );

        vkeys.add(
            this.S.Vkeywitness.from_bytes(
                Buffer.from(dummyVkeyWitness, "hex")
            )
        );
        if (multiSig) {
        vkeys.add(
            this.S.Vkeywitness.from_bytes(
                Buffer.from(dummyVkeyWitness, "hex")
            )
        );
            }
        witnesses.set_vkeys(vkeys);


        const rawTx = this.S.Transaction.new(
            rawTxBody,
            witnesses,
            aux
        );

        let minFee = this.S.min_fee(rawTx, this.S.LinearFee.new(
            this.S.BigNum.from_str(ProtocolParameter.linearFee.minFeeA),
            this.S.BigNum.from_str(ProtocolParameter.linearFee.minFeeB)
        ));
        
        outputValues[PaymentAddress] = outputValues[PaymentAddress].checked_sub(this.S.Value.new(minFee));
        Object.entries(costValues).map(([address, value]) => {

            outputValues[PaymentAddress] = outputValues[PaymentAddress].checked_sub(value);

        })

        const outputs = this.S.TransactionOutputs.new();
        Object.entries(outputValues).map(([address, value]) => {
            
            outputs.add(
                this.S.TransactionOutput.new(
                    this.S.Address.from_bech32(address),
                    value
                )
            );
        })

      
        
        const finalTxBody = this.S.TransactionBody.new(
            inputs,
            outputs,
            minFee,
            ttl + ProtocolParameter.slot
        );

        finalTxBody.set_mint(rawTxBody.multiassets());

        finalTxBody.set_auxiliary_data_hash(rawTxBody.auxiliary_data_hash());

        const finalWitnesses = this.S.TransactionWitnessSet.new();
        finalWitnesses.set_native_scripts(nativeScripts);

        const transaction = this.S.Transaction.new(
            finalTxBody,
            finalWitnesses,
            rawTx.auxiliary_data()
        );

        const size = transaction.to_bytes().length * 2;
        if (size > ProtocolParameter.maxTxSize) throw ERROR.TX_TOO_BIG;
        
        return transaction.to_bytes()
    }
    async _txBuilder({
        PaymentAddress,
        Utxos,
        Outputs,
        ProtocolParameter,

        metadata = null,
        

    }) {
        
        const MULTIASSET_SIZE = 5000;
        const VALUE_SIZE = 5000;
        const totalAssets = 0;

        
        
        CoinSelection.setProtocolParameters(
            ProtocolParameter.minUtxo.toString(),
            ProtocolParameter.linearFee.minFeeA.toString(),
            ProtocolParameter.linearFee.minFeeB.toString(),
            ProtocolParameter.maxTxSize.toString()
        )

        const selection = await CoinSelection.randomImprove(
            Utxos,
            Outputs,
            20 + totalAssets,
            
        )
        
        const inputs = selection.input;
        const txBuilder = this.S.TransactionBuilder.new(
            this.S.LinearFee.new(
                this.S.BigNum.from_str(ProtocolParameter.linearFee.minFeeA),
                this.S.BigNum.from_str(ProtocolParameter.linearFee.minFeeB)
            ),
            this.S.BigNum.from_str(ProtocolParameter.minUtxo.toString()),
            this.S.BigNum.from_str(ProtocolParameter.poolDeposit.toString()),
            this.S.BigNum.from_str(ProtocolParameter.keyDeposit.toString()),
            MULTIASSET_SIZE,
            MULTIASSET_SIZE
        );

        for (let i = 0; i < inputs.length; i++) {
            const utxo = inputs[i];
            txBuilder.add_input(
                utxo.output().address(),
                utxo.input(),
                utxo.output().amount()
            );
        }


        let AUXILIARY_DATA
        if (metadata) {
            AUXILIARY_DATA = this.S.AuxiliaryData.new()
            const generalMetadata = this.S.GeneralTransactionMetadata.new();
            Object.entries(Metadata).map(([MetadataLabel, Metadata]) => {
            generalMetadata.insert(
                this.S.BigNum.from_str(MetadataLabel),
                this.S.encode_json_str_to_metadatum(JSON.stringify(Metadata), 0)
            );
            });

            aux.set_metadata(generalMetadata)
            
            txBuilder.set_auxiliary_data(AUXILIARY_DATA)
        }

        for (let i = 0; i < Outputs.len(); i++) {
            txBuilder.add_output(Outputs.get(i))
        }


        const change = selection.change;
        const changeMultiAssets = change.multiasset();
        // check if change value is too big for single output
        if (changeMultiAssets && change.to_bytes().length * 2 > VALUE_SIZE) {
            const partialChange = this.S.Value.new(
                this.S.BigNum.from_str('0')
            );

            const partialMultiAssets = this.S.MultiAsset.new();
            const policies = changeMultiAssets.keys();
            const makeSplit = () => {
                for (let j = 0; j < changeMultiAssets.len(); j++) {
                    const policy = policies.get(j);
                    const policyAssets = changeMultiAssets.get(policy);
                    const assetNames = policyAssets.keys();
                    const assets = this.S.Assets.new();
                    for (let k = 0; k < assetNames.len(); k++) {
                        const policyAsset = assetNames.get(k);
                        const quantity = policyAssets.get(policyAsset);
                        assets.insert(policyAsset, quantity);
                        //check size
                        const checkMultiAssets = this.S.MultiAsset.from_bytes(
                            partialMultiAssets.to_bytes()
                        );
                        checkMultiAssets.insert(policy, assets);
                        const checkValue = this.S.Value.new(
                            this.S.BigNum.from_str('0')
                        );
                        checkValue.set_multiasset(checkMultiAssets);
                        if (
                            checkValue.to_bytes().length * 2 >=
                            VALUE_SIZE
                        ) {
                            partialMultiAssets.insert(policy, assets);
                            return;
                        }
                    }
                    partialMultiAssets.insert(policy, assets);
                }
            };

            makeSplit();
            partialChange.set_multiasset(partialMultiAssets);

            const minAda = this.S.min_ada_required(
                partialChange,
                this.S.BigNum.from_str(ProtocolParameter.minUtxo)
            );
            partialChange.set_coin(minAda);

            txBuilder.add_output(
                this.S.TransactionOutput.new(
                    this.S.Address.from_bech32(PaymentAddress),
                    partialChange
                )
            );
        }
        txBuilder.add_change_if_needed(
            this.S.Address.from_bech32(PaymentAddress)
        );
        const transaction = this.S.Transaction.new(
            txBuilder.build(),
            this.S.TransactionWitnessSet.new(),
            AUXILIARY_DATA
        )

        const size = transaction.to_bytes().length * 2;
        if (size > ProtocolParameter.maxTxSize) throw ERROR.TX_TOO_BIG;

        return transaction.to_bytes()
    }

    async _getProtocolParameter(networkId) {

        let latestBlock = await this._blockfrostRequest({
            endpoint: "/blocks/latest",
            networkId: networkId,
            method: "GET"
        })
        if (!latestBlock) throw ERROR.FAILED_PROTOCOL_PARAMETER

        let p = await this._blockfrostRequest({
            endpoint: `/epochs/${latestBlock.epoch}/parameters`,
            networkId: networkId,
            method: "GET"
        }) // if(!p) throw ERROR.FAILED_PROTOCOL_PARAMETER

        return {
            linearFee: {
                minFeeA: p.min_fee_a.toString(),
                minFeeB: p.min_fee_b.toString(),
            },
            minUtxo: '1000000', //p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
            poolDeposit: p.pool_deposit,
            keyDeposit: p.key_deposit,
            maxTxSize: p.max_tx_size,
            slot: latestBlock.slot,
        };

    }
    async _submitRequest(body) {

        let latestBlock = await this._blockfrostRequest({
            endpoint: "/blocks/latest",
            network: networkId
        })
        if (!latestBlock) throw ERROR.FAILED_PROTOCOL_PARAMETER

        let p = await this._blockfrostRequest({
            endpoint: `/epochs/${latestBlock.epoch}/parameters`,
            networkId: networkId
        }) //
        if (!p) throw ERROR.FAILED_PROTOCOL_PARAMETER

        return {
            linearFee: {
                minFeeA: p.min_fee_a.toString(),
                minFeeB: p.min_fee_b.toString(),
            },
            minUtxo: '1000000', //p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
            poolDeposit: p.pool_deposit,
            keyDeposit: p.key_deposit,
            maxTxSize: p.max_tx_size,
            slot: latestBlock.slot,
        };

    }
    async _blockfrostRequest({
        body,
        endpoint = "",
        networkId = 0,
        headers = {},
        method = "GET"
    }) {
        let networkEndpoint = networkId == 0 ?
            'https://cardano-testnet.blockfrost.io/api/v0' :
            'https://cardano-mainnet.blockfrost.io/api/v0'
        let blockfrostApiKey = this.getApiKey(networkId)
        
        try {
            return await (await fetch(`${networkEndpoint}${endpoint}`, {
                headers: {
                    project_id: blockfrostApiKey,
                    ...headers
                },
                method: method,
                body
            })).json()
        } catch (error) {
            console.log(error)
            return null
        }
    }

}
//////////////////////////////////////////////////
//Auxiliary

function AsciiToBuffer(string) {
    return Buffer.from(string, "ascii")
}

function HexToBuffer(string) {
    return Buffer.from(string, "hex")
}

function AsciiToHex(string) {
    return AsciiToBuffer(string).toString('hex')
}

function HexToAscii(string) {
    return HexToBuffer(string).toString("ascii")
}

function BufferToAscii(buffer) {
    return buffer.toString('ascii')
}

function BufferToHex(buffer) {
    return buffer.toString("hex")
}

module.exports = {
    NamiWalletApi: NamiWalletApi
};
