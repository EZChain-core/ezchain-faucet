const {CONFIG, avm, bintools} = require('./ava');
const axios = require('axios').default;
const {sendAvaC, CONFIG_C} = require("./eth");
const BN = require('bn.js');
const Web3 = require("web3");

// const AVA = require('./ava');
var router = require('express').Router();

router.get('/howmuch', (req, res) => {
    res.json({
        dropSizeX: CONFIG.DROP_SIZE,
        dropSizeC: CONFIG_C.DROP_SIZE
    });
});


router.post('/token', (req, res) => {
    let address = req.body["address"];
    let captchaResponse = req.body["g-recaptcha-response"];

    // Return error if captcha doesnt exist
    if(!captchaResponse){
        res.json({
            status: 'error',
            message: 'Invalid Captcha'
        });
        return;
    }

    let params = new URLSearchParams();
    params.append('secret', CONFIG.CAPTCHA_SECRET );
    params.append('response', captchaResponse );


    // Verify Captcha
    axios({
        method: 'post',
        url: "https://www.google.com/recaptcha/api/siteverify",
        data: params,
    }).then( async (axios_res) => {
        // console.log(axios_res.data);
        let data = axios_res.data;
        // If captcha succesfull send tx
        if(data.success){

            // X CHAIN
            if(address[0] === 'X'){
                sendTx(address, res).then(txid => {
                    if(txid.status){
                        res.json(txid);
                    }else{
                        res.json({
                            status: 'success',
                            message: txid
                        });
                    }
                }).catch(err => {
                    console.error(err);
                    res.json({
                        status: 'error',
                        message: 'Error issuing the transaction.'
                    });
                });
            }

            // C CHAIN
            else if(address[0] === 'C'){

                let ethAddr = address.substring(2);
                // let result;

                let hexAddr;
                if(ethAddr.substring(0,2) === '0x'){
                    hexAddr = ethAddr;
                }else{
                    try{
                        let deserial = bintools.cb58Decode(ethAddr);
                        let hex = deserial.toString('hex');
                        hexAddr = hex;
                    }catch(e){
                        console.log(e);
                        res.json({
                            status: 'error',
                            message: 'Invalid Address'
                        });
                        return;
                    }
                }

                try{
                    let receipt = await sendAvaC(hexAddr);
                    onsuccess(res, receipt.transactionHash);
                }catch(e){
                    console.log(e);
                    res.json({
                        status: 'error',
                        message: 'Failed to send transaction.'
                    });
                }
            }else if(Web3.utils.isAddress(address)){
                let receipt = await sendAvaC(address);
                onsuccess(res, receipt.transactionHash);
            }else{
                res.json({
                    status: 'error',
                    message: 'Invalid Address'
                });
            }
        }else{
            res.json({
                status: 'error',
                message: 'Invalid Captcha'
            });
        }
    });
});



function onsuccess(res, txHash){
    res.json({
        status: 'success',
        message: txHash
    });
}



// Sends a drop from the faucet to the given address
async function sendTx(addr){
    let myAddresses = [CONFIG.FAUCET_ADDRESS];
    // console.log(myAddresses);
    let utxos = (await avm.getUTXOs(myAddresses)).utxos;
    // console.log(utxos.getAllUTXOs());
    let sendAmount = new BN(CONFIG.DROP_SIZE);


    // If balance is lower than drop size, throw an insufficient funds error
    let balance = await avm.getBalance(CONFIG.FAUCET_ADDRESS, CONFIG.ASSET_ID);
    let balanceVal = new BN(balance.balance);

    if(sendAmount.gt(balanceVal)){
        console.log("Insufficient funds. Remaining AVAX: ",balanceVal.toString());
        return {
            status: 'error',
            message: 'Insufficient funds to create the transaction. Please file an issues on the repo: https://github.com/ava-labs/faucet-site'
        }
    }
    // console.log(avm.getBlockchainID());
    let memo = bintools.stringToBuffer("Faucet drip");
    let unsigned_tx = await avm.buildBaseTx(
        utxos,
        sendAmount,
        CONFIG.ASSET_ID,
        [addr],
        myAddresses,
        myAddresses,
        memo
    ).catch(err => {
        console.log(err);
    });

    // Meaning an error occurred
    if(unsigned_tx.status){
        return unsigned_tx;
    }

    let signed_tx = avm.signTx(unsigned_tx);
    let txid = await avm.issueTx(signed_tx);

    console.log(`(X) Sent a drop with tx id:  ${txid} to address: ${addr}`);
    return txid;
}



module.exports = router;
