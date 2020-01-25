"use strict";
var  TokenStake = artifacts.require("./TokenStake.sol");

let Contract = require("truffle-contract");
let TokenAbi = require("singularitynet-token-contracts/abi/SingularityNetToken.json");
let TokenNetworks = require("singularitynet-token-contracts/networks/SingularityNetToken.json");
let TokenBytecode = require("singularitynet-token-contracts/bytecode/SingularityNetToken.json");
let Token = Contract({contractName: "SingularityNetToken", abi: TokenAbi, networks: TokenNetworks, bytecode: TokenBytecode});
Token.setProvider(web3.currentProvider);

var ethereumjsabi  = require('ethereumjs-abi');
var ethereumjsutil = require('ethereumjs-util');

async function testErrorRevert(prom)
{
    let rezE = -1
    try { await prom }
    catch(e) {
        rezE = e.message.indexOf('revert');
        //console.log("Catch Block: " + e.message);
    }
    assert(rezE >= 0, "Must generate error and error message must contain revert");
}
  
contract('TokenStake', function(accounts) {

    var tokenStake;
    var tokenAddress;
    var token;
    
    let GAmt = 10000  * 100000000;
    let Amt1 = 10  * 100000000;
    let Amt2 = 20  * 100000000;
    let Amt3 = 30 * 100000000;
    let Amt4 = 40 * 100000000;
    let Amt5 = 50 * 100000000;
    let Amt6 = 60 * 100000000;
    let Amt7 = 70 * 100000000;

    before(async () => 
        {
            tokenStake = await TokenStake.deployed();
            tokenAddress = await tokenStake.token.call();
            token = Token.at(tokenAddress);
        });


        const approveTokensToContract = async(_startAccountIndex, _endAccountIndex, _depositAmt) => {
            // Transfer & Approve amount for respective accounts to Contract Address
            for(var i=_startAccountIndex;i<=_endAccountIndex;i++) {
                await token.transfer(accounts[i],  _depositAmt, {from:accounts[0]});
                await token.approve(tokenStake.address,_depositAmt, {from:accounts[i]});
            }

            // TODO: Delete the following line as we dont have the deposit function
            //await serviceRequest.deposit(_depositAmt, {from:accounts[i]});
        };

        const updateOwnerAndVerify = async(_newOwner, _account) => {

            await tokenStake.updateOwner(_newOwner, {from:_account});

            // Get the Updated Owner
            const newOwner = await tokenStake.owner.call();
            assert.equal(newOwner, _newOwner);

        }

        const updateTokenOperatorAndVeryfy = async(_tokenOperator, _account) => {

            await tokenStake.updateOperator(_tokenOperator, {from:_account});

            // Get the Updated Token Operator
            const tokenOperator = await tokenStake.tokenOperator.call();
            assert.equal(tokenOperator, _tokenOperator);

        }
        
        const openStakeAndVerify = async(_startPeriod, _endPeriod, _approvalEndPeriod, _minStake, _interestRate, _interestRateDecimals, _account) => {
        
            const nextStakePeriodIndex_b = (await tokenStake.nextStakeMapIndex.call()).toNumber();
            // Open Stake for a Given Period
            await tokenStake.openForStake(_startPeriod, _endPeriod, _approvalEndPeriod, _minStake, _interestRate, _interestRateDecimals, {from:_account});

            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();
            const nextStakePeriodIndex_a = (await tokenStake.nextStakeMapIndex.call()).toNumber();
            const minStake = (await tokenStake.minStake.call()).toNumber();

            const [found_a, startPeriod_a, endPeriod_a, approvalEndPeriod_a, interestRate_a, interestRateDecimals_a, amount_a, stakedAmount_a, approvedAmount_a, status_a, stakeIndex_a]
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, "0x0");

            assert.equal(currentStakeMapIndex, nextStakePeriodIndex_b);
            assert.equal(nextStakePeriodIndex_a, nextStakePeriodIndex_b + 1);
            assert.equal(minStake, _minStake);

            assert.equal(startPeriod_a.toNumber(), _startPeriod);
            assert.equal(endPeriod_a.toNumber(), _endPeriod);
            assert.equal(approvalEndPeriod_a.toNumber(), _approvalEndPeriod);
            assert.equal(interestRate_a.toNumber(), _interestRate);
            assert.equal(interestRateDecimals_a.toNumber(), _interestRateDecimals);
            

        }

        const submitStakeAndVerify = async(_stakeAmount, _account) => {

            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();
            const contract_account_bal_b = (await tokenStake.balances(_account)).toNumber();
            const contract_totalStake_b = (await tokenStake.totalStake.call()).toNumber();
            const contract_tokenBalance_b = (await tokenStake.tokenBalance.call()).toNumber();

            const [found_b, startPeriod_b, endPeriod_b, approvalEndPeriod_b, interestRate_b, interestRateDecimals_b, amount_b, stakedAmount_b, approvedAmount_b, status_b, stakeIndex_b]
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, _account);

            // Submit the Stake
            await tokenStake.submitStake( _stakeAmount, {from:_account});

            const [found_a, startPeriod_a, endPeriod_a, approvalEndPeriod_a, interestRate_a, interestRateDecimals_a, amount_a, stakedAmount_a, approvedAmount_a, status_a, stakeIndex_a]
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, _account);

            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();
            const contract_account_bal_a = (await tokenStake.balances(_account)).toNumber();
            const contract_totalStake_a = (await tokenStake.totalStake.call()).toNumber();
            const contract_tokenBalance_a = (await tokenStake.tokenBalance.call()).toNumber();

            // Amount should be same as stake amount in case if there is only one submit
            // If there are more submits in a given staking period - will consider earlier submits in the same period
            assert.equal(amount_a.toNumber(), amount_b.toNumber() + _stakeAmount);
            assert.equal(stakedAmount_a.toNumber(), stakedAmount_b.toNumber() + _stakeAmount);

            // Wallet balance should reduce
            assert.equal(wallet_bal_a, wallet_bal_b - _stakeAmount);
            // Account balance in the contract should increase
            assert.equal(contract_account_bal_a, contract_account_bal_b + _stakeAmount);
            // Total Stake in the contract should increase
            assert.equal(contract_totalStake_a, contract_totalStake_b + _stakeAmount);

            // Should not have any change in Token Balance as the submit stake not approved
            assert.equal(contract_tokenBalance_a, contract_tokenBalance_b);
        }

        const approveStakeAndVerify = async(staker, approvedAmount, _account) => {

            // Token Balance in the Wallet
            const wallet_bal_b = (await token.balanceOf(staker)).toNumber();

            // Token Balance in the contract
            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();
            const contract_tokenBalance_b = (await tokenStake.tokenBalance.call()).toNumber();
            const contract_account_bal_b = (await tokenStake.balances(staker)).toNumber();
            const contract_totalStake_b = (await tokenStake.totalStake.call()).toNumber();
            
            const [found_b, startPeriod_b, endPeriod_b, approvalEndPeriod_b, interestRate_b, interestRateDecimals_b, amount_b, stakedAmount_b, approvedAmount_b, status_b, stakeIndex_b]
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, staker);

            await tokenStake.approveStake(staker, approvedAmount, {from:_account});

            const [found_a, startPeriod_a, endPeriod_a, approvalEndPeriod_a, interestRate_a, interestRateDecimals_a, amount_a, stakedAmount_a, approvedAmount_a, status_a, stakeIndex_a]
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, staker);

            // Token Balance in the Wallet
            const wallet_bal_a = (await token.balanceOf(staker)).toNumber();

            // Token Balance in the contract
            const contract_tokenBalance_a = (await tokenStake.tokenBalance.call()).toNumber();
            const contract_account_bal_a = (await tokenStake.balances(staker)).toNumber();
            const contract_totalStake_a = (await tokenStake.totalStake.call()).toNumber();

            // Stake Request should be approved
            assert.equal(status_a.toNumber(), 1); // 1-> Approved

            // Approved Amount should be updated
            assert.equal(approvedAmount, approvedAmount_a.toNumber());
            assert.equal(approvedAmount, amount_a.toNumber());

            // Account balance in the contract should reduce if approved amount < staked amount
            assert.equal(contract_account_bal_a, contract_account_bal_b - stakedAmount_a.toNumber() + approvedAmount_a.toNumber());

            // Total Stake in the contract should reduce if approved amount < staked amount
            assert.equal(contract_totalStake_a, contract_totalStake_b - stakedAmount_a.toNumber() + approvedAmount_a.toNumber());
            

            //Overall token balance in the contract should increase
            assert.equal(contract_tokenBalance_a, contract_tokenBalance_b + approvedAmount);

        }

        const rejectStakeAndVerify = async(staker, _account) => {

            // Token Balance
            const wallet_bal_b = (await token.balanceOf(staker)).toNumber();

            // Contract Stake Balance
            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();
            const contract_tokenBalance_b = (await tokenStake.tokenBalance.call()).toNumber();
            const contract_account_bal_b = (await tokenStake.balances(staker)).toNumber();

            const [found_b, startPeriod_b, endPeriod_b, approvalEndPeriod_b, interestRate_b, interestRateDecimals_b, amount_b, stakedAmount_b, approvedAmount_b, status_b, stakeIndex_b]
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, staker);

            // Call Reject Stake Request
            await tokenStake.rejectStake(staker, {from:_account});

            const [found_a, startPeriod_a, endPeriod_a, approvalEndPeriod_a, interestRate_a, interestRateDecimals_a, amount_a, stakedAmount_a, approvedAmount_a, status_a, stakeIndex_a]
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, staker);

            // Token Balance
            const wallet_bal_a = (await token.balanceOf(staker)).toNumber();

            // Contract Stake Balance
            const contract_tokenBalance_a = (await tokenStake.tokenBalance.call()).toNumber();
            const contract_account_bal_a = (await tokenStake.balances(staker)).toNumber();

            // Stake Request should be rejected
            assert.equal(status_a.toNumber(), 2); // 2-> Rejected

            // Stake Amount should be reset to zero
            assert.equal(amount_a.toNumber(), 0);

            // Token Balance in the wallet should increase
            assert.equal(wallet_bal_b, wallet_bal_a - amount_b.toNumber());

            // Token Balance in the contract should reduce
            assert.equal(contract_account_bal_b, contract_account_bal_a + amount_b.toNumber());

            // There should not be any change overall token balance in the contract
            assert.equal(contract_tokenBalance_a, contract_tokenBalance_b);
        }

        const withdrawStakeAndVerify = async (_stakeMapIndex, _account) => {

            // Token Balance
            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();

            // Contract Stake Balance
            const contract_tokenBalance_b = (await tokenStake.tokenBalance.call()).toNumber();
            const contract_account_bal_b = (await tokenStake.balances(_account)).toNumber();
            const contract_totalStake_b = (await tokenStake.totalStake.call()).toNumber();

            const [found_b, startPeriod_b, endPeriod_b, approvalEndPeriod_b, interestRate_b, interestRateDecimals_b, amount_b, stakedAmount_b, approvedAmount_b, status_b, stakeIndex_b]
            = await tokenStake.getStakeInfo.call(_stakeMapIndex, _account);

            // Call Withdraw Stake
            await tokenStake.withdrawStake(_stakeMapIndex, {from:_account});

            const [found_a, startPeriod_a, endPeriod_a, approvalEndPeriod_a, interestRate_a, interestRateDecimals_a, amount_a, stakedAmount_a, approvedAmount_a, status_a, stakeIndex_a]
            = await tokenStake.getStakeInfo.call(_stakeMapIndex, _account);

            // Token Balance
            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();

            // Contract Stake Balance
            const contract_tokenBalance_a = (await tokenStake.tokenBalance.call()).toNumber();
            const contract_account_bal_a = (await tokenStake.balances(_account)).toNumber();
            const contract_totalStake_a = (await tokenStake.totalStake.call()).toNumber();

            // Wallet Balance should increase
            const rewardAmount = Math.floor(amount_b.toNumber() * interestRate_b.toNumber() / (10 ** interestRateDecimals_b));

            assert.equal(wallet_bal_b, wallet_bal_a - amount_b.toNumber() - rewardAmount);

            // Account Balance, Total Stake & Token Balance in the contract should reduce
            assert.equal(contract_account_bal_b, contract_account_bal_a + amount_b.toNumber());
            assert.equal(contract_tokenBalance_b, contract_tokenBalance_a + amount_b.toNumber() + rewardAmount);
            assert.equal(contract_totalStake_b, contract_totalStake_a + amount_b.toNumber());

            // Amount in the respective staking period should reset to zero and Status to Claimed
            assert.equal(amount_a.toNumber(), 0 );
            assert.equal(status_a.toNumber(), 3); // 3->Claimed

        }

        const withdrawTokenAndVerify = async(_amount, _account) => {

            // Token Balance
            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();

            // Contract Stake Balance
            const contract_tokenBalance_b = (await tokenStake.tokenBalance.call()).toNumber();
            const contract_totalStake_b = (await tokenStake.totalStake.call()).toNumber();

            // Call Withdraw Stake
            await tokenStake.withdrawToken(_amount, {from:_account});

            // Token Balance
            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();

            // Contract Stake Balance
            const contract_tokenBalance_a = (await tokenStake.tokenBalance.call()).toNumber();
            const contract_totalStake_a = (await tokenStake.totalStake.call()).toNumber();

            // Wallet Balance Should Increase

            assert.equal(wallet_bal_b, wallet_bal_a - _amount);

            // Token Balance in the contract should reduce
            assert.equal(contract_tokenBalance_b, contract_tokenBalance_a + _amount);

            // There should not be any change to total stake in the contract
            assert.equal(contract_totalStake_b, contract_totalStake_a);

        }

        const depositTokenAndVerify = async(_amount, _account) => {

            // Token Balance
            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();

            // Contract Stake Balance
            const contract_tokenBalance_b = (await tokenStake.tokenBalance.call()).toNumber();
            const contract_totalStake_b = (await tokenStake.totalStake.call()).toNumber();

            // Call Withdraw Stake
            await tokenStake.depositToken(_amount, {from:_account});

            // Token Balance
            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();

            // Contract Stake Balance
            const contract_tokenBalance_a = (await tokenStake.tokenBalance.call()).toNumber();
            const contract_totalStake_a = (await tokenStake.totalStake.call()).toNumber();

            // Wallet Balance Should reduce
            assert.equal(wallet_bal_b, wallet_bal_a + _amount);

            // Token Balance in the contract should increase
            assert.equal(contract_tokenBalance_b, contract_tokenBalance_a - _amount);

            // There should not be any change to total stake in the contract
            assert.equal(contract_totalStake_b, contract_totalStake_a);

        }

        const renewStakeAndVerify = async (existingStakeMapIndex, _account) => {

            
            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();
            const contract_account_bal_b = (await tokenStake.balances(_account)).toNumber();
            const contract_totalStake_b = (await tokenStake.totalStake.call()).toNumber();
            const contract_tokenBalance_b = (await tokenStake.tokenBalance.call()).toNumber();

            // Existing Stake
            const [found_eb, startPeriod_eb, endPeriod_eb, approvalEndPeriod_eb, interestRate_eb, interestRateDecimals_eb, amount_eb, stakedAmount_eb, approvedAmount_eb, status_eb, stakeIndex_eb]
            = await tokenStake.getStakeInfo.call(existingStakeMapIndex, _account);

            const [found_b, startPeriod_b, endPeriod_b, approvalEndPeriod_b, interestRate_b, interestRateDecimals_b, amount_b, stakedAmount_b, approvedAmount_b, status_b, stakeIndex_b]
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, _account);

            // Submit the Stake
            await tokenStake.renewStake(existingStakeMapIndex, {from:_account});

            // Existing Stake
            const [found_ea, startPeriod_ea, endPeriod_ea, approvalEndPeriod_ea, interestRate_ea, interestRateDecimals_ea, amount_ea, stakedAmount_ea, approvedAmount_ea, status_ea, stakeIndex_ea]
            = await tokenStake.getStakeInfo.call(existingStakeMapIndex, _account);

            // Renew Stake
            const [found_a, startPeriod_a, endPeriod_a, approvalEndPeriod_a, interestRate_a, interestRateDecimals_a, amount_a, stakedAmount_a, approvedAmount_a, status_a, stakeIndex_a]
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, _account);

            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();
            const contract_account_bal_a = (await tokenStake.balances(_account)).toNumber();
            const contract_totalStake_a = (await tokenStake.totalStake.call()).toNumber();
            const contract_tokenBalance_a = (await tokenStake.tokenBalance.call()).toNumber();

            // Calculate the Reward
            const rewardAmount = Math.floor(amount_eb.toNumber() * interestRate_eb.toNumber() / (10 ** interestRateDecimals_eb));

            const newStakeAmount = amount_eb.toNumber() + rewardAmount;

            // There should be any change in the wallet balance
            assert.equal(wallet_bal_b, wallet_bal_a);

            // Previous Stake Amount Should be set to Zero & Status to Renewed
            assert.equal(amount_ea.toNumber(), 0);
            assert.equal(status_ea.toNumber(), 4); // 4 -> Renewed

            // New Stake Should be Open
            assert.equal(status_a.toNumber(), 0); // 0 -> Open

            // New Stake Amount Should previous stake amount + reward amount
            // Considered if the user has already stake in the current staking period
            assert.equal(amount_a.toNumber(), amount_b.toNumber() + newStakeAmount);
            assert.equal(stakedAmount_a.toNumber(), stakedAmount_b.toNumber() + newStakeAmount);
            
            // Account Balance & Total Stake in the contract should increase by the reward amount
            assert.equal(contract_account_bal_b, contract_account_bal_a - rewardAmount);
            assert.equal(contract_totalStake_b, contract_totalStake_a - rewardAmount);

            // Contract Token Balance Should Reduce as existing stake moved as new Stake and waiting for approval 
            assert.equal(contract_tokenBalance_b, contract_tokenBalance_a + newStakeAmount);

        }

        const waitUntilSubmitEnds = async() => {

            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

            const [found_a, startPeriod_a, endPeriod_a, approvalEndPeriod_a, interestRate_a, interestRateDecimals_a, amount_a, stakedAmount_a, approvedAmount_a, status_a, stakeIndex_a]
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, "0x0");

            const currentTimeStamp = Math.round(Date.now() / 1000);

            if(currentTimeStamp < endPeriod_a.toNumber()) {
                const secsToWait = currentTimeStamp - endPeriod_a.toNumber()+5;
                await sleep(secsToWait); // With 5 Sec Buffer
            }
        }

        const getRandomNumber = (max) => {
            return Math.floor(Math.random() * Math.floor(max));
        }

        const sleep = async (sec) => {
            console.log("Waiting for cycle to complete...Secs - " + sec);
            return new Promise((resolve) => {
                setTimeout(resolve, sec * 1000);
              });
        }

    // ************************ Test Scenarios Starts From Here ********************************************

    it("0. Initial Account Setup - Transfer & Approve Tokens", async function() 
    {
        // accounts[0] -> Contract Owner
        // accounts[1] to accounts[8] -> Token Stakers
        // accounts[9] -> Token Operator

        await approveTokensToContract(1, 9, GAmt);

    });

    it("1. Administrative Operations - Update Owner", async function() 
    {

        // Change the Owner to Accounts[1]
        await updateOwnerAndVerify(accounts[1], accounts[0]);
        // Revert to back the ownership to accounts[0]
        await updateOwnerAndVerify(accounts[0], accounts[1]);

        // Owner Cannot be updated by any other user
        await testErrorRevert(tokenStake.updateOwner(accounts[1], {from:accounts[2]}));

    });

    it("2. Administrative Operations - Update Token Operator", async function() 
    {

        // Update the Token Operator to accounts[9]
        await updateTokenOperatorAndVeryfy(accounts[9], accounts[0]);

        // Token Operator should be uodated only by Owner
        await testErrorRevert(tokenStake.updateOperator(accounts[8], {from:accounts[1]}));

        // Even the Oprator cannot update to another operator
        await testErrorRevert(tokenStake.updateOperator(accounts[8], {from:accounts[9]}));

    });


    it("3. Stake Operations - Open Stake", async function() 
    {

        const stakePeriod = 1 * 60; // 1 min * 60 Sec - In Secs
        // Open Stake for 1 mins

        // Get the start Period in Epoc Timestamp (In Secs)
        const startPeriod = Math.round(Date.now() / 1000) + 10;
        const endPeriod = startPeriod + stakePeriod;
        const endApproval = endPeriod + stakePeriod;
        const minStake = 100000000; // Min = 1 AGI
        const interestRate = 1; // 1%
        const interestRateDecimals = 2; // Final calc will be 1/100, in case of interestRate = 0.5%, decimals will be 3 and calc will be 5/1000
        
        // Non Token Operator should allow to open for staking
        await testErrorRevert(tokenStake.openForStake(startPeriod, endPeriod, endApproval, minStake, interestRate, interestRateDecimals, {from:accounts[1]}));
        // acocunts[9] is a Token Operator
        await openStakeAndVerify(startPeriod, endPeriod, endApproval, minStake, interestRate, interestRateDecimals, accounts[9]);
        // While Staking is in progress no addition open stake request should allow
        await testErrorRevert(tokenStake.openForStake(startPeriod + 86400, endPeriod + 86400, endApproval + 86400, minStake, interestRate, interestRateDecimals, {from:accounts[9]}));

    });

    it("4. Stake Operations - Submit Stake", async function() 
    {

        // Get the Current Staking Period Index - Should be the first one
        const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

        const max = 300;
        const stakeAmount_a1 =  getRandomNumber(max) * 100000000;
        const stakeAmount_a2 =  getRandomNumber(max) * 100000000;
        const stakeAmount_a3 =  getRandomNumber(max) * 100000000;
        const stakeAmount_a4 =  getRandomNumber(max) * 100000000;
        const stakeAmount_a5 =  getRandomNumber(max) * 100000000;

        await sleep(12); // Sleep to start the submissions

        // Submit Stake
        await submitStakeAndVerify(stakeAmount_a1, accounts[1]);
        await submitStakeAndVerify(stakeAmount_a2, accounts[2]);
        await submitStakeAndVerify(stakeAmount_a3, accounts[3]);
        await submitStakeAndVerify(stakeAmount_a4, accounts[4]);
        await submitStakeAndVerify(stakeAmount_a5, accounts[5]);

        // 2nd Submit Stake in the same period
        await submitStakeAndVerify(100, accounts[3]);

        // Try approve during submission phase - Should Fail
        await testErrorRevert(tokenStake.approveStake(accounts[1], stakeAmount_a1, {from:accounts[9]}));
        
        await sleep(60); // Sleep to elapse the Submission time

        // Check for Staking after staking period - Should Fail
        await testErrorRevert(tokenStake.submitStake( stakeAmount_a5, {from:accounts[5]}));

        // Approve Stake where accounts[9] is token Operator
        await approveStakeAndVerify(accounts[1], stakeAmount_a1, accounts[9]);
        await approveStakeAndVerify(accounts[5], stakeAmount_a5, accounts[9]);

        // Approve Stake with Approved Amount lesser than the stacked amount
        await approveStakeAndVerify(accounts[3], stakeAmount_a3-50000000, accounts[9]);

        // Rejest Stake
        await rejectStakeAndVerify(accounts[2], accounts[9]);
        await rejectStakeAndVerify(accounts[4], accounts[9]);

        await sleep(60); // Sleep to elapse the Approval time

        // Check for Staking after staking period - Should Fail
        await testErrorRevert(tokenStake.submitStake( stakeAmount_a5, {from:accounts[5]}));

    });

    it("5. Stake Operations - Withdraw Stake", async function() 
    {

        // Get the Current Staking Period Index - Should be the first one
        const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

        // Accounts 1,3,5 are approved - Anyone of them are eligible for withdrawing stake
        // Account - 5 will be used for testing Renewal Operation

        await withdrawStakeAndVerify(currentStakeMapIndex, accounts[3]);

        await withdrawStakeAndVerify(currentStakeMapIndex, accounts[1]);
        
        // Try withdraw the token again - Should Fail
        await testErrorRevert(tokenStake.withdrawStake(currentStakeMapIndex, {from:accounts[1]}));

    });

    it("6. Stake Pool Operations - Deposit & Withdraw Stake by Token Operator", async function() 
    {

        const contract_tokenBalance = (await tokenStake.tokenBalance.call()).toNumber();

        const withdrawAmount = (contract_tokenBalance - 10000000);
        const depositAmount = (contract_tokenBalance + 10000000) + 1000000000;

        // Withdrawing more than available tokens from pool - Should Fail
        await testErrorRevert(withdrawTokenAndVerify(contract_tokenBalance + 10, accounts[9]));

        // Withdraw the tokens from pool
        await withdrawTokenAndVerify(withdrawAmount, accounts[9]);

        // Deposit the tokens to pool
        await depositTokenAndVerify(depositAmount , accounts[9]);

        // Withdrawing tokens from pool with Owner Account - Should Fail
        await testErrorRevert(withdrawTokenAndVerify(withdrawAmount, accounts[0]));

        // Depositing tokens to pool with Owner Account - Should Fail
        await testErrorRevert(depositTokenAndVerify(depositAmount , accounts[0]));
        
    });

    it("7. Stake Operations - New Staking Period & Renewal Stake", async function() 
    {

        const existingStakeMapIndex = 0;

        // Renew when there is no staking period in place - Should fail
        // TODO: Uncomment after fixing the issue with InValid OpCode
        //await testErrorRevert(tokenStake.renewStake(existingStakeMapIndex, {from:accounts[5]}));

        const stakePeriod = 1 * 60; // 1 min * 60 Sec - In Secs
        // Open Stake for 1 mins

        // Get the start Period in Epoc Timestamp (In Secs)
        const startPeriod = Math.round(Date.now() / 1000) + 10;
        const endPeriod = startPeriod + stakePeriod;
        const endApproval = endPeriod + stakePeriod;
        const minStake = 100000000; // Min = 1 AGI
        const interestRate = 5; // 0.5%
        const interestRateDecimals = 3; // Final Calc interestRate / (10 ** interestRateDecimals) to support decimal values
        
        // acocunts[9] is a Token Operator
        await openStakeAndVerify(startPeriod, endPeriod, endApproval, minStake, interestRate, interestRateDecimals, accounts[9]);

        const max = 300;
        const stakeAmount_a6 =  getRandomNumber(max) * 100000000;
        const stakeAmount_a7 =  getRandomNumber(max) * 100000000;
        const depositAmount  =  getRandomNumber(max) * 100000000;

        await sleep(12); // Sleep to start the submissions

        // Submit Stake
        await submitStakeAndVerify(stakeAmount_a6, accounts[6]);
        await submitStakeAndVerify(stakeAmount_a7, accounts[7]);

        // Renew Stake
        await renewStakeAndVerify(existingStakeMapIndex, accounts[5]);

        await sleep(60); // Sleep to elapse the Submission time

        // Approve Stake where accounts[9] is token Operator
        await approveStakeAndVerify(accounts[6], stakeAmount_a6, accounts[9]);
        await approveStakeAndVerify(accounts[7], stakeAmount_a7, accounts[9]);

        // Get the StakeAmount for the staker - accounts[5]
        const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();
        const [found_b, startPeriod_b, endPeriod_b, approvalEndPeriod_b, interestRate_b, interestRateDecimals_b, amount_b, stakedAmount_b, approvedAmount_b, status_b, stakeIndex_b]
        = await tokenStake.getStakeInfo.call(currentStakeMapIndex, accounts[5]);

        await approveStakeAndVerify(accounts[5], amount_b.toNumber(), accounts[9]);

        await sleep(60); // Sleep to elapse the Approval time

        // Deposit the tokens to pool - to make sure enough token are there for withdrawal
        await depositTokenAndVerify(depositAmount , accounts[9]);

        // Accounts 6,7,5 are approved - Anyone of them are eligible for withdrawing stake
        // Account - 5 is from Renewal Operation

        await withdrawStakeAndVerify(currentStakeMapIndex, accounts[6]);
        await withdrawStakeAndVerify(currentStakeMapIndex, accounts[5]);

    });

    it("8. Stake Operations - Validation of Supporting Fields", async function() 
    {

        // Check the Stakers are properly added in the Lookup fields
        const stakeHolders_0 = await tokenStake.getStakeHolders(0); // Returns an array of stakeHolders
        assert.equal(stakeHolders_0.length, 5);
        // The order of the test cases should be as per the order of submits
        assert.equal(stakeHolders_0[0], accounts[1]);
        assert.equal(stakeHolders_0[1], accounts[2]);
        assert.equal(stakeHolders_0[2], accounts[3]);
        assert.equal(stakeHolders_0[3], accounts[4]);
        assert.equal(stakeHolders_0[4], accounts[5]);

        const stakeHolders_1 = await tokenStake.getStakeHolders(1); // Returns an array of stakeHolders

        assert.equal(stakeHolders_1.length, 3);
        // The order of the test cases should be as per the order of submits
        assert.equal(stakeHolders_1[0], accounts[6]);
        assert.equal(stakeHolders_1[1], accounts[7]);
        assert.equal(stakeHolders_1[2], accounts[5]);


        // Check for the Staker staking periods
        const stakeHolders_A1 = await tokenStake.getStakeHolderStakingPeriods(accounts[1]); // Returns an array of staking periods
        const stakeHolders_A5 = await tokenStake.getStakeHolderStakingPeriods(accounts[5]); // Returns an array of staking periods
        const stakeHolders_A6 = await tokenStake.getStakeHolderStakingPeriods(accounts[6]); // Returns an array of staking periods

        assert.equal(stakeHolders_A1.length, 1);
        assert.equal(stakeHolders_A5.length, 2);
        assert.equal(stakeHolders_A5[0],0);         // 1st Staking Period
        assert.equal(stakeHolders_A5[1],1);         // 2nd Staking Period after Renewal
        assert.equal(stakeHolders_A6.length, 1);

    });

});
