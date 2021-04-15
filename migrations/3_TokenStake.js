let TokenStake = artifacts.require("./TokenStake.sol");
let Contract = require("@truffle/contract");
let TokenAbi = require("singularitynet-token-contracts/abi/SingularityNetToken.json");
let TokenNetworks = require("singularitynet-token-contracts/networks/SingularityNetToken.json");
let TokenBytecode = require("singularitynet-token-contracts/bytecode/SingularityNetToken.json");
let Token = Contract({contractName: "SingularityNetToken", abi: TokenAbi, networks: TokenNetworks, bytecode: TokenBytecode});

// Token Contract Constants
const name = "SingularityNET Token"
const symbol = "AGI"

// Keeping Migration for 7 Days from the day of Contact deployment and 15Sec as Average Block time
const maxMigrationBlocks = (7 * 24 * 60 * 60) / 15;

module.exports = function(deployer, network, accounts) {
    Token.setProvider(web3.currentProvider)
    Token.defaults({from: accounts[0], gas: 4000000});

    // AGI-I Contract deployment -- Will be deleted once AGI-2 is deployed - Kept it for compatibility only
    deployer.deploy(Token, {overwrite: false, gas: 4000000}).then((TokenInstance) => deployer.deploy(TokenStake, TokenInstance.address, maxMigrationBlocks));

    // AGI-II Contract deployment 
    //deployer.deploy(Token, name, symbol, {overwrite: false, gas: 4000000}).then((TokenInstance) => deployer.deploy(TokenStake, TokenInstance.address, maxMigrationBlocks));

};
