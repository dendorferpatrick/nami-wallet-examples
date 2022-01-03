
var { TransactionUnspentOutput,
  TransactionOutputs,
  Value } = require('@emurgo/cardano-serialization-lib-nodejs')

/**
 * Copied directly from Nami wallet github repo
 * small changes to make it compatible
 *  
 */



let Loader = null

// HELPER

function createSubSet(utxoSelection, output) {
  if (BigInt(output.coin().to_str()) < BigInt(1)) {
    let subset = [];
    let remaining = [];
    for (let i = 0; i < utxoSelection.remaining.length; i++) {
      if (
        compare(utxoSelection.remaining[i].output().amount(), output) !==
        undefined
      ) {
        subset.push(utxoSelection.remaining[i]);
      } else {
        remaining.push(utxoSelection.remaining[i]);
      }
    }
    utxoSelection.subset = subset;
    utxoSelection.remaining = remaining;
  } else {
    utxoSelection.subset = utxoSelection.remaining.splice(
      0,
      utxoSelection.remaining.length
    );
  }
}
function mergeOutputsAmounts(outputs) {
  let compiledAmountList = Loader.Cardano.Value.new(
    Loader.Cardano.BigNum.from_str('0')
  );

  for (let i = 0; i < outputs.len(); i++) {
    compiledAmountList = addAmounts(
      outputs.get(i).amount(),
      compiledAmountList
    );
  }

  return compiledAmountList;
}

function addAmounts(amounts, compiledAmounts) {
  return compiledAmounts.checked_add(amounts);
}


function splitAmounts(amounts) {
  let splitAmounts = [];

  if (amounts.multiasset()) {
    let mA = amounts.multiasset();

    for (let i = 0; i < mA.keys().len(); i++) {
      let scriptHash = mA.keys().get(i);

      for (let j = 0; j < mA.get(scriptHash).keys().len(); j++) {
        let _assets = Loader.Cardano.Assets.new();
        let assetName = mA.get(scriptHash).keys().get(j);

        _assets.insert(
          Loader.Cardano.AssetName.from_bytes(assetName.to_bytes()),
          Loader.Cardano.BigNum.from_bytes(
            mA.get(scriptHash).get(assetName).to_bytes()
          )
        );

        let _multiasset = Loader.Cardano.MultiAsset.new();
        _multiasset.insert(
          Loader.Cardano.ScriptHash.from_bytes(scriptHash.to_bytes()),
          _assets
        );
        let _value = Loader.Cardano.Value.new(
          Loader.Cardano.BigNum.from_str('0')
        );
        _value.set_multiasset(_multiasset);

        splitAmounts.push(_value);
      }
    }
  }

  // Order assets by qty DESC
  splitAmounts = sortAmountList(splitAmounts, 'DESC');

  // Insure lovelace is last to account for min ada requirement
  splitAmounts.push(
    Loader.Cardano.Value.new(
      Loader.Cardano.BigNum.from_bytes(amounts.coin().to_bytes())
    )
  );

  return splitAmounts;
}
function sortAmountList(amountList, sortOrder = 'ASC') {
  return amountList.sort((a, b) => {
    let sortInt = sortOrder === 'DESC' ? BigInt(-1) : BigInt(1);
    return Number((getAmountValue(a) - getAmountValue(b)) * sortInt);
  });
}

function getAmountValue(amount) {
  let val = BigInt(0);
  let lovelace = BigInt(amount.coin().to_str());

  if (lovelace > 0) {
    val = lovelace;
  } else if (amount.multiasset() && amount.multiasset().len() > 0) {
    let scriptHash = amount.multiasset().keys().get(0);
    let assetName = amount.multiasset().get(scriptHash).keys().get(0);
    val = BigInt(amount.multiasset().get(scriptHash).get(assetName).to_str());
  }

  return val;
}

function cloneUTxOList(utxoList) {
  return utxoList.map((utxo) => {
    return Loader.Cardano.TransactionUnspentOutput.from_bytes(utxo.to_bytes())
  }
  );
}

function cloneValue(value) { return Loader.Cardano.Value.from_bytes(value.to_bytes()); }



function improve(utxoSelection, outputAmount, limit, range) {
  let nbFreeUTxO = utxoSelection.subset.length;

  if (
    compare(utxoSelection.amount, range.ideal) >= 0 ||
    nbFreeUTxO <= 0 ||
    limit <= 0
  ) {
    // Return subset in remaining
    utxoSelection.remaining = [
      ...utxoSelection.remaining,
      ...utxoSelection.subset,
    ];
    utxoSelection.subset = [];

    return;
  }

  /** @type {TransactionUnspentOutput} utxo */
  const utxo = utxoSelection.subset
    .splice(Math.floor(Math.random() * nbFreeUTxO), 1)
    .pop();

  const newAmount = Loader.Cardano.Value.new(
    Loader.Cardano.BigNum.from_str('0')
  )
    .checked_add(utxo.output().amount())
    .checked_add(outputAmount);

  if (
    abs(getAmountValue(range.ideal) - getAmountValue(newAmount)) <
    abs(getAmountValue(range.ideal) - getAmountValue(outputAmount)) &&
    compare(newAmount, range.maximum) <= 0
  ) {
    utxoSelection.selection.push(utxo);
    utxoSelection.amount = addAmounts(
      utxo.output().amount(),
      utxoSelection.amount
    );
    limit--;
  } else {
    utxoSelection.remaining.push(utxo);
  }

  return improve(utxoSelection, outputAmount, limit, range);
}



function searchAmountValue(needle, haystack) {
  let val = BigInt(0);
  let lovelace = BigInt(needle.coin().to_str());

  if (lovelace > 0) {
    val = BigInt(haystack.coin().to_str());
  } else if (
    needle.multiasset() &&
    haystack.multiasset() &&
    needle.multiasset().len() > 0 &&
    haystack.multiasset().len() > 0
  ) {
    let scriptHash = needle.multiasset().keys().get(0);
    let assetName = needle.multiasset().get(scriptHash).keys().get(0);
    val = BigInt(haystack.multiasset().get(scriptHash).get(assetName).to_str());
  }

  return val;
}

function cloneUTxOSelection(utxoSelection) {
  
  return {
    selection: cloneUTxOList(utxoSelection.selection),
    remaining: cloneUTxOList(utxoSelection.remaining),
    subset: cloneUTxOList(utxoSelection.subset),
    amount: cloneValue(utxoSelection.amount),
  };
}
// Helper
function abs(big) {
  return big < 0 ? big * BigInt(-1) : big;
}

function compare(group, candidate) {
  let gQty = BigInt(group.coin().to_str());
  let cQty = BigInt(candidate.coin().to_str());

  if (candidate.multiasset()) {
    let cScriptHash = candidate.multiasset().keys().get(0);
    let cAssetName = candidate.multiasset().get(cScriptHash).keys().get(0);

    if (group.multiasset() && group.multiasset().len()) {
      if (
        group.multiasset().get(cScriptHash) &&
        group.multiasset().get(cScriptHash).get(cAssetName)
      ) {
        gQty = BigInt(
          group.multiasset().get(cScriptHash).get(cAssetName).to_str()
        );
        cQty = BigInt(
          candidate.multiasset().get(cScriptHash).get(cAssetName).to_str()
        );
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  return gQty >= cQty ? (gQty === cQty ? 0 : 1) : -1;
}
class CoinSelection {
  constructor() {
    this.protocolParameters = null;
  }


  setLoader(lib) {
    Loader = {
      Cardano: lib
    }
  };

  setProtocolParameters(minUTxO, minFeeA, minFeeB, maxTxSize) {
    this.protocolParameters = {
      minUTxO: minUTxO,
      minFeeA: minFeeA,
      minFeeB: minFeeB,
      maxTxSize: maxTxSize,
    };
  }

  randomImprove(inputs, outputs, limit) {
    if (!this.protocolParameters)
      throw new Error(
        'Protocol parameters not set. Use setthis.protocolParameters().'
      );

    //await Loader.load();

    const _minUTxOValue =
      BigInt(outputs.len()) * BigInt(this.protocolParameters.minUTxO);

    /** @type {UTxOSelection} */
    let utxoSelection = {
      selection: [],
      remaining: [...inputs], // Shallow copy
      subset: [],
      amount: Loader.Cardano.Value.new(Loader.Cardano.BigNum.from_str('0')),
    };

    let mergedOutputsAmounts = mergeOutputsAmounts(outputs);

    // Explode amount in an array of unique asset amount for comparison's sake
    let splitOutputsAmounts = splitAmounts(mergedOutputsAmounts);

    // Phase 1: Select enough input
    for (let i = 0; i < splitOutputsAmounts.length; i++) {
      createSubSet(utxoSelection, splitOutputsAmounts[i]); // Narrow down for NatToken UTxO
      
      utxoSelection = this.select(
        utxoSelection,
        splitOutputsAmounts[i],
        limit,
        _minUTxOValue
      );
    }

    // Phase 2: this.improve
    splitOutputsAmounts = sortAmountList(splitOutputsAmounts);

    for (let i = 0; i < splitOutputsAmounts.length; i++) {
      createSubSet(utxoSelection, splitOutputsAmounts[i]); // Narrow down for NatToken UTxO

      let range = {};
      range.ideal = Loader.Cardano.Value.new(
        Loader.Cardano.BigNum.from_str('0')
      )
        .checked_add(splitOutputsAmounts[i])
        .checked_add(splitOutputsAmounts[i]);
      range.maximum = Loader.Cardano.Value.new(
        Loader.Cardano.BigNum.from_str('0')
      )
        .checked_add(range.ideal)
        .checked_add(splitOutputsAmounts[i]);

      improve(
        utxoSelection,
        splitOutputsAmounts[i],
        limit - utxoSelection.selection.length,
        range
      );
    }

    // Insure change hold enough Ada to cover included native assets and fees
    const change = utxoSelection.amount.checked_sub(mergedOutputsAmounts);

    let minAmount = Loader.Cardano.Value.new(
      Loader.Cardano.min_ada_required(
        change,
        Loader.Cardano.BigNum.from_str(this.protocolParameters.minUTxO)
      )
    );

    let maxFee =
      BigInt(this.protocolParameters.minFeeA) *
      BigInt(this.protocolParameters.maxTxSize) +
      BigInt(this.protocolParameters.minFeeB);

    maxFee = Loader.Cardano.Value.new(
      Loader.Cardano.BigNum.from_str(maxFee.toString())
    );

    minAmount = minAmount.checked_add(maxFee);

    if (compare(change, minAmount) < 0) {
      // Not enough, add missing amount and run select one last time
      const minAda = minAmount
        .checked_sub(Loader.Cardano.Value.new(change.coin()))
        .checked_add(Loader.Cardano.Value.new(utxoSelection.amount.coin()));

      createSubSet(utxoSelection, minAda);
      utxoSelection = select(utxoSelection, minAda, limit, _minUTxOValue);
    }

    return {
      input: utxoSelection.selection,
      output: outputs,
      remaining: utxoSelection.remaining,
      amount: utxoSelection.amount,
      change: utxoSelection.amount.checked_sub(mergedOutputsAmounts),
    };
  }



  select(utxoSelection, outputAmount, limit, minUTxOValue) {
    try {
      

      utxoSelection = this.randomSelect(
        cloneUTxOSelection(utxoSelection), // Deep copy in case of fallback needed
        outputAmount,
        limit - utxoSelection.selection.length,
        minUTxOValue
      );
    } catch (e) {
      if (e.message === 'INPUT_LIMIT_EXCEEDED') {
        // Limit reached : Fallback on DescOrdAlgo
        utxoSelection = this.descSelect(
          utxoSelection,
          outputAmount,
          limit - utxoSelection.selection.length,
          minUTxOValue
        );
      } else {
        throw e;
      }
    }

    return utxoSelection;
  }

  randomSelect(utxoSelection, outputAmount, limit, minUTxOValue) {

    let nbFreeUTxO = utxoSelection.subset.length;
    
    // If quantity is met, return subset into remaining list and exit
    if (
      this.isQtyFulfilled(outputAmount, utxoSelection.amount, minUTxOValue, nbFreeUTxO)
    ) {
      utxoSelection.remaining = [
        ...utxoSelection.remaining,
        ...utxoSelection.subset,
      ];
      utxoSelection.subset = [];
      return utxoSelection;
    }

    if (limit <= 0) {
      throw new Error('INPUT_LIMIT_EXCEEDED');
    }

    if (nbFreeUTxO <= 0) {
      if (this.isQtyFulfilled(outputAmount, utxoSelection.amount, 0, 0)) {
        throw new Error('MIN_UTXO_ERROR');
      }
      throw new Error('INPUTS_EXHAUSTED');
    }

    /** @type {TransactionUnspentOutput} utxo */
    let utxo = utxoSelection.subset
      .splice(Math.floor(Math.random() * nbFreeUTxO), 1)
      .pop();

    utxoSelection.selection.push(utxo);
    utxoSelection.amount = addAmounts(
      utxo.output().amount(),
      utxoSelection.amount
    );

    return this.randomSelect(utxoSelection, outputAmount, limit - 1, minUTxOValue);
  }

  descSelect(utxoSelection, outputAmount, limit, minUTxOValue) {
    // Sort UTxO subset in DESC order for required Output unit type
    utxoSelection.subset = utxoSelection.subset.sort((a, b) => {
      return Number(
        searchAmountValue(outputAmount, b.output().amount()) -
        searchAmountValue(outputAmount, a.output().amount())
      );
    });

    do {
      if (limit <= 0) {
        throw new Error('INPUT_LIMIT_EXCEEDED');
      }

      if (utxoSelection.subset.length <= 0) {
        if (this.isQtyFulfilled(outputAmount, utxoSelection.amount, 0, 0)) {
          throw new Error('MIN_UTXO_ERROR');
        }
        throw new Error('INPUTS_EXHAUSTED');
      }

      /** @type {TransactionUnspentOutput} utxo */
      let utxo = utxoSelection.subset.splice(0, 1).pop();

      utxoSelection.selection.push(utxo);
      utxoSelection.amount = addAmounts(
        utxo.output().amount(),
        utxoSelection.amount
      );

      limit--;
    } while (
      !this.isQtyFulfilled(
        outputAmount,
        utxoSelection.amount,
        minUTxOValue,
        utxoSelection.subset.length - 1
      )
    );

    // Quantity is met, return subset into remaining list and return selection
    utxoSelection.remaining = [
      ...utxoSelection.remaining,
      ...utxoSelection.subset,
    ];
    utxoSelection.subset = [];

    return utxoSelection;
  }




  isQtyFulfilled(
    outputAmount,
    cumulatedAmount,
    minUTxOValue,
    nbFreeUTxO
  ) {
    let amount = outputAmount;

    if (minUTxOValue && BigInt(outputAmount.coin().to_str()) > 0) {
      let minAmount = Loader.Cardano.Value.new(
        Loader.Cardano.min_ada_required(
          cumulatedAmount,
          Loader.Cardano.BigNum.from_str(minUTxOValue.toString())
        )
      );

      // Lovelace min amount to cover assets and number of output need to be met
      if (compare(cumulatedAmount, minAmount) < 0) return false;

      // If requested Lovelace lower than minAmount, plan for change
      if (compare(outputAmount, minAmount) < 0) {
        amount = minAmount.checked_add(
          Loader.Cardano.Value.new(
            Loader.Cardano.BigNum.from_str(this.protocolParameters.minUTxO)
          )
        );
      }

      // Try covering the max fees
      if (nbFreeUTxO > 0) {
        let maxFee =
          BigInt(this.protocolParameters.minFeeA) *
          BigInt(this.protocolParameters.maxTxSize) +
          BigInt(this.protocolParameters.minFeeB);

        maxFee = Loader.Cardano.Value.new(
          Loader.Cardano.BigNum.from_str(maxFee.toString())
        );

        amount = amount.checked_add(maxFee);
      }
    }

    return compare(cumulatedAmount, amount) >= 0;
  }





};
const coinSelection = new CoinSelection();
module.exports = { CoinSelection: coinSelection };