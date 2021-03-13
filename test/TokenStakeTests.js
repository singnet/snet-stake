"use strict";
var  TokenStake = artifacts.require("./TokenStake.sol");

let Contract = require("@truffle/contract");
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
            token = await Token.at(tokenAddress);
        });



        const approveTokensToContract = async(_startAccountIndex, _endAccountIndex, _depositAmt) => {
            // Transfer & Approve amount for respective accounts to Contract Address
            for(var i=_startAccountIndex;i<=_endAccountIndex;i++) {
                await token.transfer(accounts[i],  _depositAmt, {from:accounts[0]});
                await token.approve(tokenStake.address,_depositAmt, {from:accounts[i]});
            }

        };

        const updateOwnerAndVerify = async(_newOwner, _account) => {

            let newOwner = "0x0"

            const owner_b = await tokenStake.owner.call();
            await tokenStake.transferOwnership(_newOwner, {from:_account});

            // Following lines of code if for Claimable Contract - which extends ownable functionality
            /*
            // Owner should not be updated until new Owner Accept the Ownership
            newOwner = await tokenStake.owner.call();
            assert.equal(newOwner, owner_b);

            // Call the function to accept the ownership
            await tokenStake.claimOwnership({from:_newOwner});
            */
            newOwner = await tokenStake.owner.call();

            assert.equal(newOwner, _newOwner);

        }

        const updateTokenOperatorAndVeryfy = async(_tokenOperator, _account) => {

            await tokenStake.updateOperator(_tokenOperator, {from:_account});

            // Get the Updated Token Operator
            const tokenOperator = await tokenStake.tokenOperator.call();
            assert.equal(tokenOperator, _tokenOperator);

        }
        
        const updateMaxDaysToOpenAndVeryfy = async(_maxNumOfDaysToOpen, _account) => {

            await tokenStake.updateMaxDaysToOpen(_maxNumOfDaysToOpen, {from:_account});

            // Get the Updated max Num Of Days To Open
            const maxDaysToOpenInSecs = await tokenStake.maxDaysToOpenInSecs.call();
            assert.equal(maxDaysToOpenInSecs, (_maxNumOfDaysToOpen * 24 * 60 * 60));

        }
        

        const openStakeAndVerify = async(_startPeriod, _endSubmission, _endApproval, _requestWithdrawStartPeriod, _endPeriod, _rewardAmount, _maxCap, _minStake, _maxStake, _openForExternal, _account) => {
        
            const currentStakeMapIndex_b = (await tokenStake.currentStakeMapIndex.call()).toNumber();

            // Open Stake for a Given Period
            await tokenStake.openForStake(_startPeriod, _endSubmission, _endApproval, _requestWithdrawStartPeriod, _endPeriod, _rewardAmount, _maxCap, _minStake, _maxStake, _openForExternal, {from:_account});

            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

            const {found: found_a, pendingForApprovalAmount: pendingForApprovalAmount_a, approvedAmount: approvedAmount_a, autoRenewal: autoRenewal_a}
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, "0x0000000000000000000000000000000000000000");

            const {startPeriod: startPeriod_a, submissionEndPeriod: submissionEndPeriod_a, approvalEndPeriod: approvalEndPeriod_a, requestWithdrawStartPeriod: requestWithdrawStartPeriod_a, endPeriod: endPeriod_a, minStake: minStake_a, maxStake: maxStake_a, windowMaxCap: windowMaxCap_a, openForExternal: openForExternal_a, windowTotalStake: windowTotalStake_a, windowRewardAmount: windowRewardAmount_a, stakeHolders: stakeHolders_a}
            = await tokenStake.stakeMap.call(currentStakeMapIndex);

            // Test the Stake Map Index
            assert.equal(currentStakeMapIndex, currentStakeMapIndex_b + 1);

            // Test the Staking Period Configurations
            assert.equal(startPeriod_a.toNumber(), _startPeriod);
            assert.equal(submissionEndPeriod_a.toNumber(), _endSubmission);
            assert.equal(approvalEndPeriod_a.toNumber(), _endApproval);
            assert.equal(requestWithdrawStartPeriod_a.toNumber(), _requestWithdrawStartPeriod);
            assert.equal(endPeriod_a.toNumber(), _endPeriod);
            assert.equal(minStake_a.toNumber(), _minStake);
            assert.equal(maxStake_a.toNumber(), _maxStake);
            assert.equal(windowMaxCap_a.toNumber(), _maxCap);
            assert.equal(openForExternal_a, _openForExternal);
            assert.equal(windowTotalStake_a.toNumber(), 0);
            assert.equal(windowRewardAmount_a.toNumber(), _rewardAmount);

        }

        const submitStakeAndVerify = async(_stakeAmount, _autoRenewal, _account) => {

            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();
            const contract_bal_b = (await token.balanceOf(tokenStake.address)).toNumber();

            const contract_account_bal_b = (await tokenStake.balances(_account)).toNumber();
            const totalPendingApprovalStake_b = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            const {found: found_b, pendingForApprovalAmount: pendingForApprovalAmount_b, approvedAmount: approvedAmount_b, autoRenewal: autoRenewal_b}
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, _account);

            const {startPeriod: startPeriod_b, submissionEndPeriod: submissionEndPeriod_b, approvalEndPeriod: approvalEndPeriod_b, requestWithdrawStartPeriod: requestWithdrawStartPeriod_b, endPeriod: endPeriod_b, minStake: minStake_b, maxStake: maxStake_b, windowMaxCap: windowMaxCap_b, openForExternal: openForExternal_b, windowTotalStake: windowTotalStake_b, windowRewardAmount: windowRewardAmount_b, stakeHolders: stakeHolders_b}
            = await tokenStake.stakeMap.call(currentStakeMapIndex);            

            // Submit the Stake
            await tokenStake.submitStake( _stakeAmount, _autoRenewal, {from:_account});

            const {found: found_a, pendingForApprovalAmount: pendingForApprovalAmount_a, approvedAmount: approvedAmount_a, autoRenewal: autoRenewal_a}
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, _account);

            const {startPeriod: startPeriod_a, submissionEndPeriod: submissionEndPeriod_a, approvalEndPeriod: approvalEndPeriod_a, requestWithdrawStartPeriod: requestWithdrawStartPeriod_a, endPeriod: endPeriod_a, minStake: minStake_a, maxStake: maxStake_a, windowMaxCap: windowMaxCap_a, openForExternal: openForExternal_a, windowTotalStake: windowTotalStake_a, windowRewardAmount: windowRewardAmount_a, stakeHolders: stakeHolders_a}
            = await tokenStake.stakeMap.call(currentStakeMapIndex);

            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();
            const contract_bal_a = (await token.balanceOf(tokenStake.address)).toNumber();

            const contract_account_bal_a = (await tokenStake.balances(_account)).toNumber();
            const totalPendingApprovalStake_a = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            assert.equal(autoRenewal_a, _autoRenewal)

            // Amount should be same as stake amount in case if there is only one submit
            // If there are more submits in a given staking period - will consider earlier submits in the same period
            assert.equal(pendingForApprovalAmount_a.toNumber(), pendingForApprovalAmount_b.toNumber() + _stakeAmount);

            // Total Pending Amount Should Increase
            assert.equal(totalPendingApprovalStake_a, totalPendingApprovalStake_b + _stakeAmount);

            // Wallet balance should reduce
            assert.equal(wallet_bal_a, wallet_bal_b - _stakeAmount);

            // Contract balance should increase
            assert.equal(contract_bal_a, contract_bal_b + _stakeAmount);

            // Account balance in the contract should increase
            assert.equal(contract_account_bal_a, contract_account_bal_b + _stakeAmount);

            // Should not have any change in the window total stake as the Stake is not Approved
            assert.equal(windowTotalStake_a.toNumber(), windowTotalStake_b.toNumber());
        }

        const approveStakeAndVerify = async(staker, approvedAmount, _account) => {

            // Token Balance in the Wallet
            const wallet_bal_b = (await token.balanceOf(staker)).toNumber();
            const contract_bal_b = (await token.balanceOf(tokenStake.address)).toNumber();

            // Token Balance in the contract
            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();
            const contract_account_bal_b = (await tokenStake.balances(staker)).toNumber();
            const totalPendingApprovalStake_b = (await tokenStake.totalPendingApprovalStake.call()).toNumber();
            
            const {found: found_b, pendingForApprovalAmount: pendingForApprovalAmount_b, approvedAmount: approvedAmount_b, autoRenewal: autoRenewal_b}
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, staker);

            const {startPeriod: startPeriod_b, submissionEndPeriod: submissionEndPeriod_b, approvalEndPeriod: approvalEndPeriod_b, requestWithdrawStartPeriod: requestWithdrawStartPeriod_b, endPeriod: endPeriod_b, minStake: minStake_b, maxStake: maxStake_b, windowMaxCap: windowMaxCap_b, openForExternal: openForExternal_b, windowTotalStake: windowTotalStake_b, windowRewardAmount: windowRewardAmount_b, stakeHolders: stakeHolders_b}
            = await tokenStake.stakeMap.call(currentStakeMapIndex);    

            await tokenStake.approveStake(staker, approvedAmount, {from:_account});

            const {found: found_a, pendingForApprovalAmount: pendingForApprovalAmount_a, approvedAmount: approvedAmount_a, autoRenewal: autoRenewal_a}
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, staker);

            const {startPeriod: startPeriod_a, submissionEndPeriod: submissionEndPeriod_a, approvalEndPeriod: approvalEndPeriod_a, requestWithdrawStartPeriod: requestWithdrawStartPeriod_a, endPeriod: endPeriod_a, minStake: minStake_a, maxStake: maxStake_a, windowMaxCap: windowMaxCap_a, openForExternal: openForExternal_a, windowTotalStake: windowTotalStake_a, windowRewardAmount: windowRewardAmount_a, stakeHolders: stakeHolders_a}
            = await tokenStake.stakeMap.call(currentStakeMapIndex);

            // Token Balance in the Wallet
            const wallet_bal_a = (await token.balanceOf(staker)).toNumber();
            const contract_bal_a = (await token.balanceOf(tokenStake.address)).toNumber();

            // Token Balance in the contract
            const contract_account_bal_a = (await tokenStake.balances(staker)).toNumber();
            const totalPendingApprovalStake_a = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            const returnAmount = pendingForApprovalAmount_b - approvedAmount;

            // Approved Amount should be updated
            assert.equal(approvedAmount_a.toNumber(), approvedAmount_b.toNumber() + approvedAmount);
            assert.equal(pendingForApprovalAmount_a.toNumber(), 0);

            // Total Pending Amount Should Reduce
            assert.equal(totalPendingApprovalStake_a, totalPendingApprovalStake_b - pendingForApprovalAmount_b);

            // User Wallet should increase
            assert.equal(wallet_bal_a, wallet_bal_b + returnAmount);

            // Contract Token Balance Should Reduce
            assert.equal(contract_bal_a, contract_bal_b - returnAmount);

            // Account balance in the contract should reduce if approved amount < staked amount
            assert.equal(contract_account_bal_a, contract_account_bal_b - returnAmount);

            // Staking Period Window Total Stake should increase
            assert.equal(windowTotalStake_a.toNumber(), windowTotalStake_b.toNumber() + approvedAmount);

        }

        const rejectStakeAndVerify = async(_stakeMapIndex, staker, _account) => {

            // Token Balance
            const wallet_bal_b = (await token.balanceOf(staker)).toNumber();
            const contract_bal_b = (await token.balanceOf(tokenStake.address)).toNumber();

            // Contract Stake Balance
            const contract_account_bal_b = (await tokenStake.balances(staker)).toNumber();
            const totalPendingApprovalStake_b = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            const {found: found_b, pendingForApprovalAmount: pendingForApprovalAmount_b, approvedAmount: approvedAmount_b, autoRenewal: autoRenewal_b}
            = await tokenStake.getStakeInfo.call(_stakeMapIndex, staker);

            const {startPeriod: startPeriod_b, submissionEndPeriod: submissionEndPeriod_b, approvalEndPeriod: approvalEndPeriod_b, requestWithdrawStartPeriod: requestWithdrawStartPeriod_b, endPeriod: endPeriod_b, minStake: minStake_b, maxStake: maxStake_b, windowMaxCap: windowMaxCap_b, openForExternal: openForExternal_b, windowTotalStake: windowTotalStake_b, windowRewardAmount: windowRewardAmount_b, stakeHolders: stakeHolders_b}
            = await tokenStake.stakeMap.call(_stakeMapIndex);   

            // Call Reject Stake Request
            await tokenStake.rejectStake(_stakeMapIndex, staker, {from:_account});

            const {found: found_a, pendingForApprovalAmount: pendingForApprovalAmount_a, approvedAmount: approvedAmount_a, autoRenewal: autoRenewal_a}
            = await tokenStake.getStakeInfo.call(_stakeMapIndex, staker);

            const {startPeriod: startPeriod_a, submissionEndPeriod: submissionEndPeriod_a, approvalEndPeriod: approvalEndPeriod_a, requestWithdrawStartPeriod: requestWithdrawStartPeriod_a, endPeriod: endPeriod_a, minStake: minStake_a, maxStake: maxStake_a, windowMaxCap: windowMaxCap_a, openForExternal: openForExternal_a, windowTotalStake: windowTotalStake_a, windowRewardAmount: windowRewardAmount_a, stakeHolders: stakeHolders_a}
            = await tokenStake.stakeMap.call(_stakeMapIndex);

            // Token Balance
            const wallet_bal_a = (await token.balanceOf(staker)).toNumber();
            const contract_bal_a = (await token.balanceOf(tokenStake.address)).toNumber();

            // Contract Stake Balance
            const contract_account_bal_a = (await tokenStake.balances(staker)).toNumber();
            const totalPendingApprovalStake_a = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            // Stake Amount should be reset to zero
            assert.equal(pendingForApprovalAmount_a.toNumber(), 0);
            assert.equal(approvedAmount_a.toNumber(), 0);

            // Token Balance in the wallet should increase
            assert.equal(wallet_bal_b, wallet_bal_a - pendingForApprovalAmount_b.toNumber());

            // Total Pending Amount Should Reduce
            assert.equal(totalPendingApprovalStake_b, totalPendingApprovalStake_a + pendingForApprovalAmount_b.toNumber());

            // Contract Token Balance Should Reduce
            assert.equal(contract_bal_b, contract_bal_a + pendingForApprovalAmount_b.toNumber());

            // Token Balance in the contract should reduce
            assert.equal(contract_account_bal_b, contract_account_bal_a + pendingForApprovalAmount_b.toNumber());

        }

        const updateAutoRenewalAndVerify = async (_stakeMapIndex, _autoRenew, _account) => {

            // Call request for Withdraw Stake
            await tokenStake.updateAutoRenewal(_stakeMapIndex, _autoRenew, {from:_account});

            const {found: found_a, pendingForApprovalAmount: pendingForApprovalAmount_a, approvedAmount: approvedAmount_a, autoRenewal: autoRenewal_a}
            = await tokenStake.getStakeInfo.call(_stakeMapIndex, _account);

            assert.equal(autoRenewal_a, _autoRenew);

        }

        const claimStakeAndVerify = async (_stakeMapIndex, _account) => {

            // Token Balance
            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();
            const contract_bal_b = (await token.balanceOf(tokenStake.address)).toNumber();

            // Contract Stake Balance
            const contract_account_bal_b = (await tokenStake.balances(_account)).toNumber();
            const totalPendingApprovalStake_b = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            const {found: found_b, pendingForApprovalAmount: pendingForApprovalAmount_b, approvedAmount: approvedAmount_b, autoRenewal: autoRenewal_b}
            = await tokenStake.getStakeInfo.call(_stakeMapIndex, _account);

            const {startPeriod: startPeriod_b, submissionEndPeriod: submissionEndPeriod_b, approvalEndPeriod: approvalEndPeriod_b, requestWithdrawStartPeriod: requestWithdrawStartPeriod_b, endPeriod: endPeriod_b, minStake: minStake_b, maxStake: maxStake_b, windowMaxCap: windowMaxCap_b, openForExternal: openForExternal_b, windowTotalStake: windowTotalStake_b, windowRewardAmount: windowRewardAmount_b, stakeHolders: stakeHolders_b}
            = await tokenStake.stakeMap.call(_stakeMapIndex); 

            // Call Withdraw Stake
            await tokenStake.claimStake(_stakeMapIndex, {from:_account});

            const {found: found_a, pendingForApprovalAmount: pendingForApprovalAmount_a, approvedAmount: approvedAmount_a, autoRenewal: autoRenewal_a}
            = await tokenStake.getStakeInfo.call(_stakeMapIndex, _account);

            // Token Balance
            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();
            const contract_bal_a = (await token.balanceOf(tokenStake.address)).toNumber();

            // Contract Stake Balance
            const contract_account_bal_a = (await tokenStake.balances(_account)).toNumber();
            const totalPendingApprovalStake_a = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            // Calculate the rewardAmount
            const rewardAmount = Math.floor(approvedAmount_b.toNumber() * windowRewardAmount_b.toNumber() / (windowTotalStake_b.toNumber() < windowMaxCap_b.toNumber() ? windowTotalStake_b.toNumber() : windowMaxCap_b.toNumber()));

            // Wallet Balance should increase
            assert.equal(wallet_bal_b, wallet_bal_a - approvedAmount_b.toNumber() - rewardAmount);

            // Contract Token Balance Should Reduce
            assert.equal(contract_bal_b, contract_bal_a + approvedAmount_b.toNumber() + rewardAmount);

            // Account Balance, Total Stake & Total Approved Stake in the contract should reduce
            assert.equal(contract_account_bal_b, contract_account_bal_a + approvedAmount_b.toNumber());

            // There should not be any change in the total Pending Approval Stake
            assert.equal(totalPendingApprovalStake_a, totalPendingApprovalStake_b);

            // Amount in the respective staking period should reset to zero
            assert.equal(approvedAmount_a.toNumber(), 0);

        }

        const withdrawTokenAndVerify = async(_amount, _account) => {

            // Token Balance
            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();
            const contract_bal_b = (await token.balanceOf(tokenStake.address)).toNumber();

            // Call Withdraw Stake
            await tokenStake.withdrawToken(_amount, {from:_account});

            // Token Balance
            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();
            const contract_bal_a = (await token.balanceOf(tokenStake.address)).toNumber();

            // Wallet Balance Should Increase
            assert.equal(wallet_bal_b, wallet_bal_a - _amount);

            // Contract Balance Should Reduce
            assert.equal(contract_bal_b, contract_bal_a + _amount);

        }

        const depositTokenAndVerify = async(_amount, _account) => {

            // Token Balance
            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();
            const contract_bal_b = (await token.balanceOf(tokenStake.address)).toNumber();

            // Call Withdraw Stake
            await tokenStake.depositToken(_amount, {from:_account});

            // Token Balance
            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();
            const contract_bal_a = (await token.balanceOf(tokenStake.address)).toNumber();

            // Wallet Balance Should reduce
            assert.equal(wallet_bal_b, wallet_bal_a + _amount);

            // Contract Balance Should Increase
            assert.equal(contract_bal_b, contract_bal_a - _amount);
            
        }

        const autoRenewStakeAndVerify = async (existingStakeMapIndex, _staker, _approvedAmount, _account) => {

            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

            const wallet_bal_b = (await token.balanceOf(_staker)).toNumber();
            const contract_bal_b = (await token.balanceOf(tokenStake.address)).toNumber();

            const contract_account_bal_b = (await tokenStake.balances(_staker)).toNumber();
            const totalPendingApprovalStake_b = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            // Existing Stake
            const {found: found_eb, pendingForApprovalAmount: pendingForApprovalAmount_eb, approvedAmount: approvedAmount_eb, autoRenewal: autoRenewal_eb}
            = await tokenStake.getStakeInfo.call(existingStakeMapIndex, _staker);

            const {startPeriod: startPeriod_eb, submissionEndPeriod: submissionEndPeriod_eb, approvalEndPeriod: approvalEndPeriod_eb, requestWithdrawStartPeriod: requestWithdrawStartPeriod_eb, endPeriod: endPeriod_eb, minStake: minStake_eb, maxStake: maxStake_eb, windowMaxCap: windowMaxCap_eb, openForExternal: openForExternal_eb, windowTotalStake: windowTotalStake_eb, windowRewardAmount: windowRewardAmount_eb, stakeHolders: stakeHolders_eb}
            = await tokenStake.stakeMap.call(existingStakeMapIndex);

            const {found: found_b, pendingForApprovalAmount: pendingForApprovalAmount_b, approvedAmount: approvedAmount_b, autoRenewal: autoRenewal_b}
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, _staker);

            const {startPeriod: startPeriod_b, submissionEndPeriod: submissionEndPeriod_b, approvalEndPeriod: approvalEndPeriod_b, requestWithdrawStartPeriod: requestWithdrawStartPeriod_b, endPeriod: endPeriod_b, minStake: minStake_b, maxStake: maxStake_b, windowMaxCap: windowMaxCap_b, openForExternal: openForExternal_b, windowTotalStake: windowTotalStake_b, windowRewardAmount: windowRewardAmount_b, stakeHolders: stakeHolders_b}
            = await tokenStake.stakeMap.call(currentStakeMapIndex);

            // auto renew the Stake
            await tokenStake.autoRenewStake(existingStakeMapIndex, _staker, _approvedAmount, {from:_account});

            // Existing Stake
            const {found: found_ea, pendingForApprovalAmount: pendingForApprovalAmount_ea, approvedAmount: approvedAmount_ea, autoRenewal: autoRenewal_ea}
            = await tokenStake.getStakeInfo.call(existingStakeMapIndex, _staker);

            // Current Stake
            const {found: found_a, pendingForApprovalAmount: pendingForApprovalAmount_a, approvedAmount: approvedAmount_a, autoRenewal: autoRenewal_a}
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, _staker);

            // Staking Window
            const {startPeriod: startPeriod_a, submissionEndPeriod: submissionEndPeriod_a, approvalEndPeriod: approvalEndPeriod_a, requestWithdrawStartPeriod: requestWithdrawStartPeriod_a, endPeriod: endPeriod_a, minStake: minStake_a, maxStake: maxStake_a, windowMaxCap: windowMaxCap_a, openForExternal: openForExternal_a, windowTotalStake: windowTotalStake_a, windowRewardAmount: windowRewardAmount_a, stakeHolders: stakeHolders_a}
            = await tokenStake.stakeMap.call(currentStakeMapIndex);

            const wallet_bal_a = (await token.balanceOf(_staker)).toNumber();
            const contract_bal_a = (await token.balanceOf(tokenStake.address)).toNumber();

            const contract_account_bal_a = (await tokenStake.balances(_staker)).toNumber();
            const totalPendingApprovalStake_a = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            // Calculate the Reward
            const rewardAmount = Math.floor(approvedAmount_eb.toNumber() * windowRewardAmount_eb.toNumber() / (windowTotalStake_eb.toNumber() < windowMaxCap_eb.toNumber() ? windowTotalStake_eb.toNumber() : windowMaxCap_eb.toNumber()));

            const newStakeAmount = approvedAmount_eb.toNumber() + rewardAmount;
            const returnAmount = newStakeAmount -  _approvedAmount;

            // Wallet should 
            assert.equal(wallet_bal_b, wallet_bal_a - returnAmount);

            // Contract Token Balance Should Reduce
            assert.equal(contract_bal_b, contract_bal_a + returnAmount);

            // Previous Stake Amount Should be set to Zero
            assert.equal(approvedAmount_ea.toNumber(), 0);

            // New Stake Should be Auto Renewed
            assert.equal(autoRenewal_a, true);

            // Should not be any change to Pending Approval Amount
            assert.equal(pendingForApprovalAmount_a.toNumber(), pendingForApprovalAmount_b.toNumber());

            // There should not be any change in the total Pending Approval Stake
            assert.equal(totalPendingApprovalStake_a, totalPendingApprovalStake_b);

            // Approved Amount should be increased
            assert.equal(approvedAmount_a.toNumber(), approvedAmount_b.toNumber() + _approvedAmount);

            // Staking Period Window Total Stake should increase
            assert.equal(windowTotalStake_a.toNumber(), windowTotalStake_b.toNumber() + _approvedAmount);

            // Account balance in the contract should reduce if approved amount < new staked amount
            assert.equal(contract_account_bal_a, contract_account_bal_b + rewardAmount - returnAmount);

        }

        const renewStakeAndVerify = async (existingStakeMapIndex, _stakeAmount, _autoRenewal, _account) => {

            
            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();
            const contract_bal_b = (await token.balanceOf(tokenStake.address)).toNumber();

            const contract_account_bal_b = (await tokenStake.balances(_account)).toNumber();
            const totalPendingApprovalStake_b = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            // Existing Stake
            const {found: found_eb, pendingForApprovalAmount: pendingForApprovalAmount_eb, approvedAmount: approvedAmount_eb, autoRenewal: autoRenewal_eb}
            = await tokenStake.getStakeInfo.call(existingStakeMapIndex, _account);

            const {startPeriod: startPeriod_eb, submissionEndPeriod: submissionEndPeriod_eb, approvalEndPeriod: approvalEndPeriod_eb, requestWithdrawStartPeriod: requestWithdrawStartPeriod_eb, endPeriod: endPeriod_eb, minStake: minStake_eb, maxStake: maxStake_eb, windowMaxCap: windowMaxCap_eb, openForExternal: openForExternal_eb, windowTotalStake: windowTotalStake_eb, windowRewardAmount: windowRewardAmount_eb, stakeHolders: stakeHolders_eb}
            = await tokenStake.stakeMap.call(existingStakeMapIndex);

            const {found: found_b, pendingForApprovalAmount: pendingForApprovalAmount_b, approvedAmount: approvedAmount_b, autoRenewal: autoRenewal_b}
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, _account);

            // renew the Stake
            await tokenStake.renewStake(existingStakeMapIndex, _stakeAmount, _autoRenewal, {from:_account});

            // Existing Stake
            const {found: found_ea, pendingForApprovalAmount: pendingForApprovalAmount_ea, approvedAmount: approvedAmount_ea, autoRenewal: autoRenewal_ea}
            = await tokenStake.getStakeInfo.call(existingStakeMapIndex, _account);

            // Renew Stake
            const {found: found_a, pendingForApprovalAmount: pendingForApprovalAmount_a, approvedAmount: approvedAmount_a, autoRenewal: autoRenewal_a}
            = await tokenStake.getStakeInfo.call(currentStakeMapIndex, _account);

            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();
            const contract_bal_a = (await token.balanceOf(tokenStake.address)).toNumber();

            const contract_account_bal_a = (await tokenStake.balances(_account)).toNumber();
            const totalPendingApprovalStake_a = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            // Calculate the Reward
            const rewardAmount = Math.floor(approvedAmount_eb.toNumber() * windowRewardAmount_eb.toNumber() / (windowTotalStake_eb.toNumber() < windowMaxCap_eb.toNumber() ? windowTotalStake_eb.toNumber() : windowMaxCap_eb.toNumber()));

            const newStakeAmount = approvedAmount_eb.toNumber() + rewardAmount;
            const returnAmount = newStakeAmount -  _stakeAmount;

            // There should be any change in the wallet balance
            assert.equal(wallet_bal_b, wallet_bal_a - returnAmount);

            // Contract Token Balance Should Reduce
            assert.equal(contract_bal_b, contract_bal_a + returnAmount);

            // Previous Stake Amount Should be set to Zero (approvedAmount == Amount)
            assert.equal(approvedAmount_ea.toNumber(), 0);

            // New Stake Amount Should previous stake amount + reward amount
            // Considered if the user has already stake in the current staking period
            assert.equal(pendingForApprovalAmount_a.toNumber(), pendingForApprovalAmount_b.toNumber() + _stakeAmount);
            
            // total Pending Approval Stake should increase
            assert.equal(totalPendingApprovalStake_a, totalPendingApprovalStake_b + _stakeAmount);

            // Account Balance & Total Stake in the contract should increase by the reward amount
            assert.equal(contract_account_bal_a, contract_account_bal_b + rewardAmount - returnAmount);

        }

        const withdrawStakeAndVerify = async (existingStakeMapIndex, _stakeAmount, _account) => {

            const wallet_bal_b = (await token.balanceOf(_account)).toNumber();
            const contract_bal_b = (await token.balanceOf(tokenStake.address)).toNumber();

            const contract_account_bal_b = (await tokenStake.balances(_account)).toNumber();
            const totalPendingApprovalStake_b = (await tokenStake.totalPendingApprovalStake.call()).toNumber();
            
            const {found: found_b, pendingForApprovalAmount: pendingForApprovalAmount_b, approvedAmount: approvedAmount_b, autoRenewal: autoRenewal_b}
            = await tokenStake.getStakeInfo.call(existingStakeMapIndex, _account);
            
            const {startPeriod: startPeriod_b, submissionEndPeriod: submissionEndPeriod_b, approvalEndPeriod: approvalEndPeriod_b, requestWithdrawStartPeriod: requestWithdrawStartPeriod_b, endPeriod: endPeriod_b, minStake: minStake_b, maxStake: maxStake_b, windowMaxCap: windowMaxCap_b, openForExternal: openForExternal_b, windowTotalStake: windowTotalStake_b, windowRewardAmount: windowRewardAmount_b, stakeHolders: stakeHolders_b}
            = await tokenStake.stakeMap.call(existingStakeMapIndex);            
            
            // Withdraw the Stake
            await tokenStake.withdrawStake(existingStakeMapIndex, _stakeAmount, {from:_account});
            
            const {found: found_a, pendingForApprovalAmount: pendingForApprovalAmount_a, approvedAmount: approvedAmount_a, autoRenewal: autoRenewal_a}
            = await tokenStake.getStakeInfo.call(existingStakeMapIndex, _account);
            
            const {startPeriod: startPeriod_a, submissionEndPeriod: submissionEndPeriod_a, approvalEndPeriod: approvalEndPeriod_a, requestWithdrawStartPeriod: requestWithdrawStartPeriod_a, endPeriod: endPeriod_a, minStake: minStake_a, maxStake: maxStake_a, windowMaxCap: windowMaxCap_a, openForExternal: openForExternal_a, windowTotalStake: windowTotalStake_a, windowRewardAmount: windowRewardAmount_a, stakeHolders: stakeHolders_a}
            = await tokenStake.stakeMap.call(existingStakeMapIndex);
            
            const wallet_bal_a = (await token.balanceOf(_account)).toNumber();
            const contract_bal_a = (await token.balanceOf(tokenStake.address)).toNumber();

            const contract_account_bal_a = (await tokenStake.balances(_account)).toNumber();
            const totalPendingApprovalStake_a = (await tokenStake.totalPendingApprovalStake.call()).toNumber();

            // Pending for Approval Should Reduce
            assert.equal(pendingForApprovalAmount_a.toNumber(), pendingForApprovalAmount_b.toNumber() - _stakeAmount);
            
            // total Pending Approval Stake should reduce
            assert.equal(totalPendingApprovalStake_a, totalPendingApprovalStake_b - _stakeAmount);

            // Should not be any change to Approved Amount
            assert.equal(approvedAmount_a.toNumber(), approvedAmount_b.toNumber());

            // Token Balance in the wallet should increase
            assert.equal(wallet_bal_a, wallet_bal_b + _stakeAmount);

            // Contract Token Balance Should Reduce
            assert.equal(contract_bal_b, contract_bal_a + _stakeAmount);

            // Token Balance in the contract should reduce
            assert.equal(contract_account_bal_a, contract_account_bal_b - _stakeAmount);

        }

        const enableOrDisableOperationsAndVerify = async(_disableOperations, _account) => {


            // Diable Operations
            await tokenStake.enableOrDisableOperations(_disableOperations, {from:_account});

            const stakingOperationDisabled = await tokenStake.stakingOperationDisabled.call();

            assert.equal(stakingOperationDisabled, _disableOperations);

        }

        const waitTimeInSlot = async(slot) => {

            const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

            const {startPeriod: startPeriod_b, submissionEndPeriod: submissionEndPeriod_b, approvalEndPeriod: approvalEndPeriod_b, requestWithdrawStartPeriod: requestWithdrawStartPeriod_b, endPeriod: endPeriod_b, minStake: minStake_b, maxStake: maxStake_b, windowMaxCap: windowMaxCap_b, openForExternal: openForExternal_b, windowTotalStake: windowTotalStake_b, windowRewardAmount: windowRewardAmount_b, stakeHolders: stakeHolders_b}
            = await tokenStake.stakeMap.call(currentStakeMapIndex);

            const currentTimeStamp = Math.round(Date.now() / 1000);

            var waitTimeInSec = 0;

            switch(slot) {
                case "OPEN_FOR_SUBMISSION":
                    waitTimeInSec = startPeriod_b.toNumber() - currentTimeStamp;
                    break;
                case "OPEN_FOR_APPROVAL":
                    waitTimeInSec = submissionEndPeriod_b.toNumber() - currentTimeStamp;
                    break;
                case "OPEN_OPT_UPDATE":
                    waitTimeInSec = requestWithdrawStartPeriod_b.toNumber() - currentTimeStamp;
                    break;
                case "END_STAKE":
                    waitTimeInSec = endPeriod_b.toNumber() - currentTimeStamp;
                    break;
                case "CLAIM_GRACE_PERIOD":
                    waitTimeInSec = endPeriod_b.toNumber() - requestWithdrawStartPeriod_b.toNumber();
                default:
                    break;
            }

            return waitTimeInSec>0?waitTimeInSec+2:0;
            
        }

        const getRandomNumber = (max) => {
            const min = 10; // To avoid zero rand number
            return Math.floor(Math.random() * (max - min) + min);
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
/*
    it("1. Administrative Operations - Update Owner", async function() 
    {

        // Change the Owner to Accounts[1]
        await updateOwnerAndVerify(accounts[1], accounts[0]);
        // Revert to back the ownership to accounts[0]
        await updateOwnerAndVerify(accounts[0], accounts[1]);

        // Owner Cannot be updated by any other user
        await testErrorRevert(tokenStake.transferOwnership(accounts[1], {from:accounts[2]}));

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
        const baseTime = Math.round(Date.now() / 1000);
        const startPeriod = baseTime + 10;
        const endSubmission = baseTime + 40;
        const endApproval = baseTime + 50;
        const requestWithdrawStartPeriod = baseTime + 60 
        const endPeriod = baseTime + 70;
        const minStake          = 1     * 100000000; // Min = 1 AGI
        const maxStake          = 120   * 100000000; // Max = 120 AGI
        const rewardAmount      = 30    * 100000000; // Reward = 30 AGI       
        const maxCap            = 500   * 100000000; // Max Cap = 500 AGI
        const openForExternal = true;

        // Non Token Operator should allow to open for staking
        await testErrorRevert(tokenStake.openForStake(startPeriod, endSubmission, endApproval, requestWithdrawStartPeriod, endPeriod, rewardAmount, maxCap, minStake, maxStake, openForExternal, {from:accounts[1]}));
        
        // Improper Staking Period - Should Fail
        await testErrorRevert(tokenStake.openForStake(startPeriod, endSubmission, endApproval, requestWithdrawStartPeriod, endPeriod - 40, rewardAmount, maxCap, minStake, maxStake, openForExternal, {from:accounts[9]}));

        // Non Operator try to update the Max Days to Open to open - Should Fail
        await testErrorRevert(tokenStake.updateMaxDaysToOpen(60, {from:accounts[1]}));

        // Update the Max Days to Open to 60 Days
        await updateMaxDaysToOpenAndVeryfy(60, accounts[9]);

        // Try to Open Stake after 60 days - should fail
        const maxDaysToOpenInSecs = 90 * 24 * 60 * 60;
        await testErrorRevert(tokenStake.openForStake(parseInt(startPeriod) + maxDaysToOpenInSecs, parseInt(endSubmission) + maxDaysToOpenInSecs, parseInt(endApproval) + maxDaysToOpenInSecs, parseInt(requestWithdrawStartPeriod) + maxDaysToOpenInSecs, parseInt(endPeriod) + maxDaysToOpenInSecs, rewardAmount, maxCap, minStake, maxStake, openForExternal, {from:accounts[9]}));

        // acocunts[9] is a Token Operator
        await openStakeAndVerify(startPeriod, endSubmission, endApproval, requestWithdrawStartPeriod, endPeriod, rewardAmount, maxCap, minStake, maxStake, openForExternal, accounts[9]);
        
        // While Staking is in progress no addition open stake request should allow
        await testErrorRevert(tokenStake.openForStake(startPeriod + 86400, endSubmission + 86400, endApproval + 86400, requestWithdrawStartPeriod + 86400, endPeriod + 86400, rewardAmount, maxCap, minStake, maxStake, openForExternal, {from:accounts[9]}));

    });

    it("4. Stake Operations - Submit Stake", async function() 
    {

        // Get the Current Staking Period Index - Should be the first one
        const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

        const max = 100;
        const stakeAmount_a1 =  getRandomNumber(max) * 100000000;
        const stakeAmount_a2 =  getRandomNumber(max) * 100000000;
        const stakeAmount_a3 =  getRandomNumber(max) * 100000000;
        const stakeAmount_a4 =  getRandomNumber(max) * 100000000;
        const stakeAmount_a5 =  getRandomNumber(max) * 100000000;
        const autoRenewalYes = true;
        const autoRenewalNo = false;

        await sleep(await waitTimeInSlot("OPEN_FOR_SUBMISSION")); // Sleep to start the submissions

        // Submit Stake
        await submitStakeAndVerify(stakeAmount_a1, autoRenewalNo, accounts[1]);
        await submitStakeAndVerify(stakeAmount_a2, autoRenewalYes, accounts[2]);
        await submitStakeAndVerify(stakeAmount_a3, autoRenewalYes, accounts[3]);
        await submitStakeAndVerify(stakeAmount_a4, autoRenewalYes, accounts[4]);
        await submitStakeAndVerify(stakeAmount_a5, autoRenewalNo, accounts[5]);

        // Should be able to Change the Auto Renewal Flag
        await updateAutoRenewalAndVerify(currentStakeMapIndex, autoRenewalYes, accounts[5]);
        await updateAutoRenewalAndVerify(currentStakeMapIndex, autoRenewalNo, accounts[5]);

        // 2nd Submit Stake in the same period
        await submitStakeAndVerify(10 * 100000000, autoRenewalYes, accounts[3]);

        // Withdraw Stake Before Approval
        await withdrawStakeAndVerify(currentStakeMapIndex, 5 * 100000000, accounts[3]);

        // Withdraw the Stake vilating minStake Criteria - Should Fail
        await testErrorRevert(tokenStake.withdrawStake(currentStakeMapIndex, stakeAmount_a5 - 10000000, {from:accounts[5]}));

        // Withdraw Full Stake Before Approval
        await withdrawStakeAndVerify(currentStakeMapIndex, stakeAmount_a5, accounts[5]);

        // Re-Submit the Stake
        await submitStakeAndVerify(stakeAmount_a5, autoRenewalNo, accounts[5]);
        
        // Try approve during submission phase - Should Fail
        await testErrorRevert(tokenStake.approveStake(accounts[1], stakeAmount_a1, {from:accounts[9]}));
        
        await sleep(await waitTimeInSlot("OPEN_FOR_APPROVAL")); // Sleep to elapse the Submission time
        
        // Check for Staking after staking period - Should Fail
        await testErrorRevert(tokenStake.submitStake( stakeAmount_a5, autoRenewalYes, {from:accounts[5]}));
        
        // Approve Stake where accounts[9] is token Operator
        await approveStakeAndVerify(accounts[1], stakeAmount_a1, accounts[9]);
        await approveStakeAndVerify(accounts[5], stakeAmount_a5, accounts[9]);
        
        // Approve Stake with Approved Amount lesser than the stacked amount
        await approveStakeAndVerify(accounts[3], stakeAmount_a3-50000000, accounts[9]);
        
        // Rejest Stake
        await rejectStakeAndVerify(currentStakeMapIndex, accounts[2], accounts[9]);
        await rejectStakeAndVerify(currentStakeMapIndex, accounts[4], accounts[9]);
        
        await sleep(await waitTimeInSlot("OPEN_OPT_UPDATE")); // Sleep to get request for Withdrawal
        
        // request For Claim
        const autoRenew = false;
        await updateAutoRenewalAndVerify(currentStakeMapIndex, autoRenew, accounts[3]);

        // End Stake Period
        await sleep(await waitTimeInSlot("END_STAKE")); // Sleep to elapse the Stake Period

        // Check for Staking after staking period - Should Fail
        await testErrorRevert(tokenStake.submitStake( stakeAmount_a5, autoRenewalYes, {from:accounts[5]}));

    });

    it("5. Stake Operations - Claim Stake", async function() 
    {

        // Get the Current Staking Period Index - Should be the first one
        const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();


        // Deposit Reward Amount for the stakers withdrawals to work
        const rewardAmount      = 100000000000; // Reward = 1000 AGI
        // Deposit the tokens to pool
        await depositTokenAndVerify(rewardAmount , accounts[9]);

        // Accounts 1,3,5 are approved - Anyone of them are eligible for withdrawing stake
        // Account - 5 will be used for testing Renewal Operation

        await claimStakeAndVerify(currentStakeMapIndex, accounts[3]);

        await claimStakeAndVerify(currentStakeMapIndex, accounts[1]);
        
        // Try withdraw the token again - Should Fail
        await testErrorRevert(tokenStake.claimStake(currentStakeMapIndex, {from:accounts[3]}));

    });

    it("6. Stake Pool Operations - Deposit & Withdraw Token from pool by Token Operator", async function() 
    {

        const totalPendingApprovalStake = (await tokenStake.totalPendingApprovalStake.call()).toNumber();
        const contractTokenBalance = (await token.balanceOf(tokenStake.address)).toNumber();

        const withdrawAmount = (contractTokenBalance - totalPendingApprovalStake - 10000000);
        const depositAmount = withdrawAmount + 1000000000;

        // Withdrawing more than available tokens from pool - Should Fail
        //await testErrorRevert(withdrawTokenAndVerify(contractTokenBalance - totalPendingApprovalStake + 10, accounts[9]));
        await testErrorRevert(tokenStake.withdrawToken(contractTokenBalance - totalPendingApprovalStake + 10, {from:accounts[9]}));

        // Withdraw the tokens from pool
        await withdrawTokenAndVerify(withdrawAmount, accounts[9]);

        // Deposit the tokens to pool
        await depositTokenAndVerify(depositAmount , accounts[9]);

        // Withdrawing tokens from pool with Owner Account - Should Fail
        //await testErrorRevert(withdrawTokenAndVerify(withdrawAmount, accounts[0]));
        await testErrorRevert(tokenStake.withdrawToken(withdrawAmount, {from:accounts[0]}));

        // Depositing tokens to pool with Owner Account - Should Fail
        //await testErrorRevert(depositTokenAndVerify(depositAmount , accounts[0]));
        await testErrorRevert(tokenStake.depositToken(depositAmount, {from:accounts[0]}));
        
    });

    it("7. Stake Operations - New Staking Period & Renewal Stake", async function() 
    {

        // Always the stake window starts with 1 not with Zero
        const existingStakeMapIndex = 1;

        // Renew when there is no staking period in place - Should fail
        await testErrorRevert(tokenStake.renewStake(existingStakeMapIndex, 10000000,false, {from:accounts[5]}));

        // Get the start Period in Epoc Timestamp (In Secs)
        const baseTime = Math.round(Date.now() / 1000);
        const startPeriod = baseTime + 10;
        const endSubmission = baseTime + 20;
        const endApproval = baseTime + 30;
        const requestWithdrawStartPeriod = baseTime + 40 
        const endPeriod = baseTime + 50;
        const minStake          = 1     * 100000000; // Min = 1 AGI
        const maxStake          = 500   * 100000000; // Max = 500 AGI
        const rewardAmount      = 120   * 100000000; // Reward = 120 AGI       
        const maxCap            = 1000  * 100000000; // Max Cap = 1000 AGI
        const openForExternal = true;
        
        // acocunts[9] is a Token Operator
        await openStakeAndVerify(startPeriod, endSubmission, endApproval, requestWithdrawStartPeriod, endPeriod, rewardAmount, maxCap, minStake, maxStake, openForExternal, accounts[9]);

        const max = 300;
        const stakeAmount_a6 =  getRandomNumber(max) * 100000000;
        const stakeAmount_a7 =  getRandomNumber(max) * 100000000;
        const autoRenewalYes = true;
        const autoRenewalNo = false;

        await sleep(await waitTimeInSlot("OPEN_FOR_SUBMISSION")); // Sleep to start the submissions

        // Submit Stake
        await submitStakeAndVerify(stakeAmount_a6, autoRenewalNo, accounts[6]);
        await submitStakeAndVerify(stakeAmount_a7, autoRenewalYes, accounts[7]);

        // Get the ApprovedAmount for the staker - accounts[5]
        const {found: found_eb, pendingForApprovalAmount: pendingForApprovalAmount_eb, approvedAmount: approvedAmount_eb, autoRenewal: autoRenewal_eb}
        = await tokenStake.getStakeInfo.call(existingStakeMapIndex, accounts[5]);

        // Renew Stake for the existing Approved Amount - So Reward should be returned to user
        await renewStakeAndVerify(existingStakeMapIndex, approvedAmount_eb.toNumber(), autoRenewalYes, accounts[5]);

        await sleep(await waitTimeInSlot("OPEN_FOR_APPROVAL")); // Sleep to elapse the Submission time
        // Approve Stake where accounts[9] is token Operator
        await approveStakeAndVerify(accounts[6], stakeAmount_a6, accounts[9]);
        await approveStakeAndVerify(accounts[7], stakeAmount_a7, accounts[9]);

        // Get the StakeAmount for the staker - accounts[5]
        const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();
        const {found: found_b, pendingForApprovalAmount: pendingForApprovalAmount_b, approvedAmount: approvedAmount_b, autoRenewal: autoRenewal_b}
        = await tokenStake.getStakeInfo.call(currentStakeMapIndex, accounts[5]);

        await approveStakeAndVerify(accounts[5], pendingForApprovalAmount_b.toNumber(), accounts[9]);

        // End Stake Period
        await sleep(await waitTimeInSlot("END_STAKE")); // Sleep to elapse the Stake Period

        // Deposit the tokens to pool - to make sure enough token are there for withdrawal
        await depositTokenAndVerify(rewardAmount , accounts[9]);

        // Accounts 6,7, 5 are approved - Account 6, 7 are eligible for withdrawing stake
        // Account - 5 is from Renewal Operation
        await claimStakeAndVerify(currentStakeMapIndex, accounts[6]);

        //await claimStakeAndVerify(currentStakeMapIndex, accounts[5]);
        // Account5 should not be able to Withdraw as it opted for auto renewal
        await testErrorRevert(tokenStake.claimStake(currentStakeMapIndex, {from:accounts[5]}));

    });

    it("8. Stake Operations - New Stake For Auto Renewals", async function() {

        const existingStakeMapIndex = 2;

        // Get the start Period in Epoc Timestamp (In Secs)
        const baseTime = Math.round(Date.now() / 1000);
        const startPeriod = baseTime + 10;
        const endSubmission = baseTime + 20;
        const endApproval = baseTime + 30;
        const requestWithdrawStartPeriod = baseTime + 40 
        const endPeriod = baseTime + 50;
        const minStake          = 1     * 100000000; // Min = 1 AGI
        const maxStake          = 500   * 100000000; // Max = 500 AGI
        const rewardAmount      = 150   * 100000000; // Reward = 150 AGI       
        const maxCap            = 1000  * 100000000; // Max Cap = 1000 AGI
        const openForExternal = true;
        
        // acocunts[9] is a Token Operator
        await openStakeAndVerify(startPeriod, endSubmission, endApproval, requestWithdrawStartPeriod, endPeriod, rewardAmount, maxCap, minStake, maxStake, openForExternal, accounts[9]);

        // Get the StakeAmount for the staker - accounts[5]
        const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();
        
        const {found: found_eb, pendingForApprovalAmount: pendingForApprovalAmount_eb, approvedAmount: approvedAmount_eb, autoRenewal: autoRenewal_eb}
        = await tokenStake.getStakeInfo.call(existingStakeMapIndex, accounts[5]);

        const max = 100;
        const stakeAmount_a5 =  getRandomNumber(max) * 100000000;
        const autoRenewalYes = true;
        const autoRenewalNo = false;

        await sleep(await waitTimeInSlot("OPEN_FOR_SUBMISSION")); // Sleep to start the submissions

        const approvedAmount = approvedAmount_eb.toNumber() + 100000000; // Reward > 1 AGI 

        // Auto Renew Stake 
        // Can be performed only by Token Operator -- Should Fail
        await testErrorRevert(tokenStake.autoRenewStake(existingStakeMapIndex, accounts[5], approvedAmount, {from:accounts[5]}));

        // Can be performed only by Token Operator -- Account - 9
        await autoRenewStakeAndVerify(existingStakeMapIndex, accounts[5], approvedAmount, accounts[9]);

        // Additional Staking from the Same Staker
        await submitStakeAndVerify(stakeAmount_a5, autoRenewalYes, accounts[5]);

        await sleep(await waitTimeInSlot("OPEN_FOR_APPROVAL")); // Sleep to elapse the Submission time

        await approveStakeAndVerify(accounts[5], stakeAmount_a5, accounts[9]);

        // End Stake Period
        await sleep(await waitTimeInSlot("END_STAKE")); // Sleep to elapse the Stake Period

    });

    it("9. Stake Operations - Validation of Supporting Fields", async function()
    {

        // Check the Stakers are properly added in the Lookup fields
        // stakeMapIndex starts with 1 not Zero
        const stakeHolders_1 = await tokenStake.getStakeHolders(1); // Returns an array of stakeHolders
        assert.equal(stakeHolders_1.length, 5);

        // The order of the test cases should be as per the order of submits
        assert.equal(stakeHolders_1[0], accounts[1]);
        assert.equal(stakeHolders_1[1], accounts[2]);
        assert.equal(stakeHolders_1[2], accounts[3]);
        assert.equal(stakeHolders_1[3], accounts[4]);
        assert.equal(stakeHolders_1[4], accounts[5]);

        const stakeHolders_2 = await tokenStake.getStakeHolders(2); // Returns an array of stakeHolders

        assert.equal(stakeHolders_2.length, 3);
        // The order of the test cases should be as per the order of submits
        assert.equal(stakeHolders_2[0], accounts[6]);
        assert.equal(stakeHolders_2[1], accounts[7]);
        assert.equal(stakeHolders_2[2], accounts[5]);

        // Check for the Staker staking periods
        const stakeHolders_A1 = await tokenStake.getStakeHolderStakingPeriods(accounts[1]); // Returns an array of staking periods
        const stakeHolders_A5 = await tokenStake.getStakeHolderStakingPeriods(accounts[5]); // Returns an array of staking periods
        const stakeHolders_A6 = await tokenStake.getStakeHolderStakingPeriods(accounts[6]); // Returns an array of staking periods

        assert.equal(stakeHolders_A1.length, 1);
        assert.equal(stakeHolders_A5.length, 3);
        assert.equal(stakeHolders_A5[0],1);         // 1st Staking Period
        assert.equal(stakeHolders_A5[1],2);         // 2nd Staking Period after Renewal
        assert.equal(stakeHolders_A5[2],3);         // 3rd Staking Period after Renewal

        assert.equal(stakeHolders_A6.length, 1);

    });

    it("10. Stake Operations - No more active Stakes Withdrawals", async function() 
    {

        // Staker should be able to withdraw the tokens when there is no active stake - means passing the grace period
        const currentStakeMapIndex = (await tokenStake.currentStakeMapIndex.call()).toNumber();

        await sleep(await waitTimeInSlot("CLAIM_GRACE_PERIOD")); // Sleep to elapse the Grace time

        // Account 5 is enabled for AutoRenew
        await claimStakeAndVerify(currentStakeMapIndex, accounts[5]);

    });
*/
});
