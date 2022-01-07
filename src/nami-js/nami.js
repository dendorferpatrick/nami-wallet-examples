import Loader from "./loader";
import CoinSelection from "./coinSelection";
import { Buffer } from "buffer";
import AssetFingerprint from '@emurgo/cip14-js';


export async function Cardano() {
    await Loader.load();
    return Loader.Cardano;
  };

const ERROR = {
    FAILED_PROTOCOL_PARAMETER: 'Couldnt fetch protocol parameters from blockfrost',
    TX_TOO_BIG: 'Transaction too big'
}

class NamiWalletApi {
    constructor(serilizationLib, nami, apiKey) {
        this.apiKey  = apiKey
        this.Nami = nami
        this.S = serilizationLib
    }
// Nami Wallet Endpoints
  async isInstalled() {
    if (this.Nami) return true
    else return false
  }


  async isEnabled() {
    return await this.Nami.isEnabled()
  }

  async enable() {
    if (!await this.isEnabled()) {
      try {
        return await this.Nami.enable()
      } catch (error) {
        throw error
      }
    }
  }

  async getAddress() {
    
    if (!this.isEnabled()) throw ERROR.NOT_CONNECTED;
    
    const addressHex = Buffer.from(
        (await this.Nami.getUsedAddresses())[0],
        "hex"
    );
    
    const address = this.S.BaseAddress.from_address(
        this.S.Address.from_bytes(addressHex)
    )
        .to_address()
        .to_bech32();

    
    return address;
  
  }
  async getHexAddress(){
  const addressHex = Buffer.from(
    (await window.cardano.getUsedAddresses())[0],
    "hex"
  );
  return addressHex
  }

  async getNetworkId() {
    if (!this.isEnabled()) throw ERROR.NOT_CONNECTED;
    let networkId = await this.Nami.getNetworkId()
    return {
      id: networkId,
      network: networkId === 1 ? 'mainnet' : 'testnet'
    }
  }


  async getBalance (){
    // get balance of Nami Wallet
    if (!this.isEnabled()) {
        await this.enable()
    }
    let networkId = await this.getNetworkId(); 
    let protocolParameter = await this._getProtocolParameter(networkId.id)

    const valueCBOR = await this.Nami.getBalance()
    const value = this.S.Value.from_bytes(Buffer.from(valueCBOR, "hex"))

    const utxos = await this.Nami.getUtxos()
    const parsedUtxos = utxos.map((utxo) => this.S.TransactionUnspentOutput.from_bytes(Buffer.from(utxo, "hex")))

    let countedValue = this.S.Value.new(this.S.BigNum.from_str("0"))
    parsedUtxos.forEach(element => { countedValue = countedValue.checked_add(element.output().amount()) });
    const minAda = this.S.min_ada_required(countedValue, this.S.BigNum.from_str(protocolParameter.minUtxo)); 

    const availableAda = countedValue.coin().checked_sub(minAda); 
    const lovelace = availableAda.to_str(); 
    console.log("assets", protocolParameter.minUtxo)
    const assets = [];
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
                    Buffer.from(policy.to_bytes(), 'hex').toString('hex') +
                    Buffer.from(policyAsset.name(), 'hex').toString('hex');
                const _policy = asset.slice(0, 56);
                const _name = asset.slice(56);
                const fingerprint = new AssetFingerprint(
                    Buffer.from(_policy, 'hex'),
                    Buffer.from(_name, 'hex')
                ).fingerprint();
                assets.push({
                    unit: asset,
                    quantity: quantity.to_str(),
                    policy: _policy,
                    name: HexToAscii(_name),
                    fingerprint,
                });
            }
        }
    }

    return {"lovelace": lovelace, 
            "assets": assets}
};

    getApiKey(networkId) {
        if (networkId == 0) {
            return this.apiKey[0]
            
        } else {
            return this.apiKey[1]
            
        }
    }

    async registerPolicy(policy){
        fetch(`https://pool.pm/register/policy/${policy.id}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: "all",
              scripts: [
                {
                  keyHash: policy.paymentKeyHash,
                  type: "sig",
                },
                { slot: policy.ttl, type: "before" },
              ],
            }),
          })
            .then((res) => res.json())
            .then(console.log);
    }
    async getUtxos(utxos) {
        let Utxos = utxos.map(u => this.S.TransactionUnspentOutput.from_bytes(
            Buffer.from(
                u,
                'hex'
            )
        ))
        let UTXOS = []
        for (let utxo of Utxos) {
            let assets = this._utxoToAssets(utxo)

            UTXOS.push({
                txHash: Buffer.from(
                    utxo.input().transaction_id().to_bytes(),
                    'hex'
                ).toString('hex'),
                txId: utxo.input().index(),
                amount: assets
            })
        }
        return UTXOS
    }



    async getUtxosHex() {
        return await this.Nami.getUtxos()
    }



    async transaction({
        PaymentAddress = "",
        recipients = [],
        metadata = null,
        metadataHash = null, 
        addMetadata = true, 
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
                metadataHash : metadataHash, 
                addMetadata : addMetadata, 
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

    async createLockingPolicyScript(address, networkId, expirationTime) {
        
        var now = new Date()

        const protocolParameters = await this._getProtocolParameter(networkId);
        
        const slot = parseInt(protocolParameters.slot);
        const duration = expirationTime.getTime() - now.getTime()


        const ttl = slot + duration;

        const paymentKeyHash = this.S.BaseAddress.from_address(
            this.S.Address.from_bytes(
                Buffer.from(address, "hex")

            ))
            .payment_cred()
            .to_keyhash();
        
        const nativeScripts = this.S.NativeScripts.new();
        const script = this.S.ScriptPubkey.new(paymentKeyHash);
        const nativeScript = this.S.NativeScript.new_script_pubkey(script);
        const lockScript = this.S.NativeScript.new_timelock_expiry(
            this.S.TimelockExpiry.new(ttl)
        );
        nativeScripts.add(nativeScript);
        nativeScripts.add(lockScript);
        const finalScript = this.S.NativeScript.new_script_all(
            this.S.ScriptAll.new(nativeScripts)
        );
        const policyId = Buffer.from(
            this.S.ScriptHash.from_bytes(
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


    async signTx(transaction, partialSign = false) {
        if (!this.isEnabled()) throw ERROR.NOT_CONNECTED;
        return await this.Nami.signTx(transaction, partialSign)
      }
    
    async signData(string) {
        let address = await getAddressHex()
        let coseSign1Hex = await Nami.signData(
            address,
            Buffer.from(
                string,
                "ascii"
            ).toString('hex')
        )
        return coseSign1Hex
    }

    hashMetadata(metadata){
        let aux = this.S.AuxiliaryData.new()
        
        
        const generalMetadata = this.S.GeneralTransactionMetadata.new();
        Object.entries(metadata).map(([MetadataLabel, Metadata]) => {
        
        generalMetadata.insert(
            this.S.BigNum.from_str(MetadataLabel),
            this.S.encode_json_str_to_metadatum(JSON.stringify(Metadata), 0)
        );
        });

        aux.set_metadata(generalMetadata)
        
        
        

    const metadataHash = this.S.hash_auxiliary_data(aux);
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
        metadataHash = null, 
        addMetadata = true, 
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
            
         
            


        }
        if (metadataHash) { 
            const auxDataHash  = this.S.AuxiliaryDataHash.from_bytes(Buffer.from(metadataHash, "hex"))
            console.log(auxDataHash)
            rawTxBody.set_auxiliary_data_hash(auxDataHash);
        }
        else
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
        let auxFinal; 
        if (addMetadata)
         auxFinal = rawTx.auxiliary_data()
        else
         auxFinal = this.S.AuxiliaryData.new()
        const transaction = this.S.Transaction.new(
            finalTxBody,
            finalWitnesses,
            auxFinal
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
        console.log(selection)
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

    async submitTx({
        transactionRaw,
        witnesses,
        scripts,
        networkId, 
        metadata
    }) {

        
        let transaction = this.S.Transaction.from_bytes(Buffer.from(transactionRaw, "hex"))


        const txWitnesses = transaction.witness_set();
        const txVkeys = txWitnesses.vkeys();
        const txScripts = txWitnesses.native_scripts();


        const addWitnesses = this.S.TransactionWitnessSet.from_bytes(
            Buffer.from(witnesses[0], "hex")
        );
        const addVkeys = addWitnesses.vkeys();
        const addScripts = addWitnesses.native_scripts();

        const totalVkeys = this.S.Vkeywitnesses.new();
        const totalScripts = this.S.NativeScripts.new();

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
        if (addVkeys) {
            for (let i = 0; i < addVkeys.len(); i++) {
                totalVkeys.add(addVkeys.get(i));
            }
        }
        if (addScripts) {
            for (let i = 0; i < addScripts.len(); i++) {
                totalScripts.add(addScripts.get(i));
            }
        }

        const totalWitnesses = this.S.TransactionWitnessSet.new();
        totalWitnesses.set_vkeys(totalVkeys);
        totalWitnesses.set_native_scripts(totalScripts);
        let aux; 
        if (metadata){


        aux = this.S.AuxiliaryData.new()
        const generalMetadata = this.S.GeneralTransactionMetadata.new();
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
        const signedTx = await this.S.Transaction.new(
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



export default NamiWalletApi;
