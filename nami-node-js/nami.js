var S = require('@emurgo/cardano-serialization-lib-nodejs')
var Buffer = require('buffer').Buffer;
const fetchPromise = import('node-fetch').then(mod => mod.default)
const fetch = (...args) => fetchPromise.then(fetch => fetch(...args))


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

    }
    createNewBech32PrivateKey() {
          let key = S.Bip32PrivateKey.generate_ed25519_bip32(); 
          return key.to_bech32()
    }
   

    getApiKey(networkId) {
        return this.blockfrostApiKey[networkId]
        
    }

 

    async createLockingPolicyScript( networkId, expirationTime) {
        // var now = new Date()

        const protocolParameters = await this._getProtocolParameter(networkId);
        
        const slot = parseInt(protocolParameters.slot);
        // const duration = expirationTime.getTime() - now.getTime()

        const duration = 1000; 
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



    async decodeTransaction(transactionHex) {

        const recipients = {}

        const transaction = S.Transaction.from_bytes(Buffer.from(transactionHex, "hex"));

        const transaction_body = transaction.body()
        // get outputs 
        transaction_body.inputs().len
        const outputs = transaction_body.outputs()
        // get inputs
        const inputs = transaction_body.inputs()

        // check number of outputs
        let sender = {}
        for (let inputIndex of [...Array(inputs.len()).keys()]) {
            const input = inputs.get(inputIndex);
            const txIndex = input.index()

            const txHash = Buffer.from(
                input.transaction_id().to_bytes(),
                'hex'
            ).toString('hex')

            const tx = await this._blockfrostRequest({
                endpoint: `/txs/${txHash}/utxos`,
                networkId: 0,
                method: "GET"
            });

            const txInput = tx.outputs.filter((row) => row.output_index == txIndex)[0]

          
            if (typeof sender[txInput.address] == "undefined") {
                sender[txInput.address] = {
                    amount: 0,
                    assets: {}
                }
            }
            txInput.amount.map((amount) => {
               
                
                if (amount.unit == "lovelace") {
                    sender[txInput.address].amount += parseInt(amount.quantity)
                } else {
                    let unit = amount.unit.slice(0, 56) + "." + HexToAscii(amount.unit.slice(56))
                    if (typeof sender[txInput.address].assets[unit] == "undefined") {


                        sender[txInput.address].assets[unit] = 0
                    }
                    
                    sender[txInput.address].assets[unit] = sender[txInput.address].assets[unit] + parseInt(amount.quantity)
                 
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
        console.log("Auxilary data", auxiliary_data,  auxiliary_data.metadata())
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
        
        
       
        Object.keys(sender).map((senderAddress) => {
            if (recipients[senderAddress] != "undefined") {
                sender[senderAddress].amount -= recipients[senderAddress].amount;
                recipients[senderAddress].amount = 0;
            

                Object.entries(recipients[senderAddress].assets).forEach(([unit, quantity]) => {
                    console.log("SENDER ", sender, unit, quantity)
                    if (typeof sender[senderAddress].assets[unit] != "undefined") {
                        sender[senderAddress].assets[unit] -= quantity;
                        recipients[senderAddress].assets[unit] = 0;
                        delete recipients[senderAddress].assets[unit];
                        if (sender[senderAddress].assets[unit] == 0) delete sender[senderAddress].assets[unit]
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
        const senderFinal = Object.keys(sender).map((key) => {
            return {
                address: key,
                ...sender[key]
            }
        })
        
        for (let r of recipientsFinal) {
            outputValue += r.amount
        }
        for (let s of senderFinal) {
            inputValue += s.amount
        }
        const fee = inputValue - outputValue

        return [senderFinal, recipientsFinal, metadata, fee]
    }

    signTx(txHash){ 

        const transaction = SL.Transaction.from_bytes(B.Buffer.from(txHash, "hex"));

        const transaction_body = transaction.body()
    
        const txBodyHash = SL.hash_transaction(transaction_body)
    
        const witness = SL.make_vkey_witness(txBodyHash, this.privateKey.to_raw_key())
        return witness

    }
   

    async submitTx({
        transactionRaw,
        witnesses,
        scripts,
        networkId
    }) {

        
        let transaction = S.Transaction.from_bytes(Buffer.from(transactionRaw, "hex"))


        const txWitnesses = transaction.witness_set();
        const txVkeys = txWitnesses.vkeys();
        const txScripts = txWitnesses.native_scripts();


        const addWitnesses = S.TransactionWitnessSet.from_bytes(
            Buffer.from(witnesses[0], "hex")
        );
        const addVkeys = addWitnesses.vkeys();
        const addScripts = addWitnesses.native_scripts();

        const totalVkeys = S.Vkeywitnesses.new();
        const totalScripts = S.NativeScripts.new();

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

        const totalWitnesses = S.TransactionWitnessSet.new();
        totalWitnesses.set_vkeys(totalVkeys);
        totalWitnesses.set_native_scripts(totalScripts);

        const signedTx = await S.Transaction.new(
            transaction.body(),
            totalWitnesses,
            transaction.auxiliary_data()
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
        console.log(body, endpoint, networkId, headers, method)
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
