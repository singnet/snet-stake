pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract TokenStake {
    
    using SafeMath for uint256;

    address public owner;
    ERC20 public token; // Address of token contract
    address public tokenOperator; // Address to manage the Stake 
    uint256 public totalStake; // Total Stake deposited in the contract - Doesnt contain reward
    uint256 public tokenBalance; // Token balance in the contract - Only approved stake will be part of it
    mapping (address => uint256) public balances; // Useer Token balance in the contract

    uint256 public minStake;
    uint256 public currentStakeMapIndex;

    // 0-Open, 1-Approved, 2-Rejected, 3-Claimed
    enum StakeStatus { Open, Approved, Rejected, Claimed, Renewed }

    struct StakeInfo {
        uint256 amount;
        uint256 stakedAmount;
        uint256 approvedAmount;
        StakeStatus status;
        uint256 stakeIndex;
    }

    // Staking period timestamp (TODO: debatable on timestamp vs blocknumber - went with timestamp)
    struct StakePeriod {
        uint256 startPeriod;
        uint256 endPeriod;
        uint256 approvalEndPeriod;
        uint256 interestRate;
        uint256 interestRateDecimals;   // Number of decimals to support decimal points

        address[] stakeHolders;
        mapping(address => StakeInfo) stakeHolderInfo; 
    }

    uint256 public nextStakeMapIndex;
    mapping (uint256 => StakePeriod) public stakeMap;

    mapping (address => uint256[]) public stakerPeriodMap;

    // Events
    event NewOwner(address owner);
    event NewOperator(address tokenOperator);

    event OpenForStake(uint256 indexed stakeIndex, address indexed tokenOperator, uint256 startPeriod, uint256 endPeriod, uint256 approvalEndPeriod, uint256 minStake, uint256 interestRate, uint256 interestRateDecimals);
    event SubmitStake(address indexed staker, uint256 indexed stakeIndex, uint256 stakeAmount);
    event WithdrawStake(address indexed staker, uint256 indexed stakeIndex, uint256 rewardAmount, uint256 totalAmount);

    event ApproveStake(address indexed staker, uint256 indexed stakeIndex, address indexed tokenOperator, uint256 approvedStakeAmount);
    event RejectStake(address indexed staker, uint256 indexed stakeIndex, address indexed tokenOperator);

    event RenewStake(address indexed staker, uint256 indexed newStakeIndex, uint256 oldStakeIndex, uint256 stakeAmount);

    // Modifiers
    modifier onlyOwner() {
        require(
            msg.sender == owner,
            "Only owner can call this function."
        );
        _;
    }
    modifier onlyOperator() {
        require(
            msg.sender == tokenOperator,
            "Only operator can call this function."
        );
        _;
    }
    modifier allowSubmission() {
        // Request for Stake should be Open
        require(
            now >= stakeMap[currentStakeMapIndex].startPeriod && 
            now <= stakeMap[currentStakeMapIndex].endPeriod, 
            "Staking at this point not allowed"
        );
        _;
    }
    modifier validMinStake(uint256 stakeAmount) {
        // Check for Min Stake
        require(
            stakeAmount > 0 && 
            stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].amount.add(stakeAmount) >= minStake, 
            "Invalid stake amount"
        );
        _;
    }
    modifier allowWithdrawStake(uint256 stakeMapIndex) {
        // Check to see withdraw stake is allowed
        require(
            now > stakeMap[stakeMapIndex].endPeriod && 
            stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender].amount > 0 && 
            stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender].status == StakeStatus.Approved, 
            "Invalid withdraw request"
        );
        _;
    }

    constructor (address _token)
    public
    {
        token = ERC20(_token);
        owner = msg.sender;
        tokenOperator = msg.sender;
        nextStakeMapIndex = 0;
        currentStakeMapIndex = 0;
    }

    function updateOwner(address newOwner) public onlyOwner {

        require(newOwner != address(0), "Invalid owner address");
        
        owner = newOwner;

        emit NewOwner(newOwner);
    }

    function updateOperator(address newOperator) public onlyOwner {

        require(newOperator != address(0), "Invalid operator address");
        
        tokenOperator = newOperator;

        emit NewOperator(newOperator);
    }

    function depositToken(uint256 value) public onlyOperator {

        // Input validation are in place in token contract
        require(token.transferFrom(msg.sender, this, value), "Unable to transfer token to the contract"); 

        // Update the Token Balance
        tokenBalance = tokenBalance.add(value);

    }
    
    function withdrawToken(uint256 value) public onlyOperator
    {
        // Token Balance is sum of all Approved Amounts, Restricts withdrawal of stake which are in approval process
        
        require(value <= tokenBalance, "Not enough balance in the contract");
        require(token.transfer(msg.sender, value), "Unable to transfer token to the operator account");

        // Update the token balance
        tokenBalance = tokenBalance.sub(value);

    }

    // TODO: Check if we need additional function to Update the Current Stake Period
    function openForStake(uint256 _startPeriod, uint256 _endPeriod, uint256 _approvalEndPeriod, uint256 _minStake, uint256 _interestRate, uint256 _interestRateDecimals) public onlyOperator {

        // Check Input Parameters
        require(_startPeriod >= now && _startPeriod < _endPeriod &&  _endPeriod < _approvalEndPeriod, "Invalid stake period");
        require(_minStake > 0 && _interestRate > 0 && _interestRateDecimals >=0, "Invalid min stake or interest rate" );

        // Check Stake in Progress
        // !(now >= stakeMap[currentStakeMapIndex].startPeriod && now <= stakeMap[currentStakeMapIndex].approvalEndPeriod)
        require(nextStakeMapIndex == 0 || now > stakeMap[currentStakeMapIndex].approvalEndPeriod, "Cannot have more than one stake request at a time");

        // Move the staking period to next one
        currentStakeMapIndex = nextStakeMapIndex;
        StakePeriod memory stakePeriod;

        stakePeriod.startPeriod = _startPeriod;
        stakePeriod.endPeriod = _endPeriod;
        stakePeriod.approvalEndPeriod = _approvalEndPeriod;
        stakePeriod.interestRate = _interestRate;
        stakePeriod.interestRateDecimals = _interestRateDecimals;
        stakeMap[currentStakeMapIndex] = stakePeriod;

        minStake = _minStake;
         
        emit OpenForStake(nextStakeMapIndex++, msg.sender, _startPeriod, _endPeriod, _approvalEndPeriod, _minStake, _interestRate, _interestRateDecimals);

        // TODO: Do we need to allow next staking period in case if any existsing stakes waiting for approval

    }

    function submitStake(uint256 stakeAmount) public allowSubmission validMinStake(stakeAmount) {

        // Transfer the Tokens to Contract
        require(token.transferFrom(msg.sender, this, stakeAmount), "Unable to transfer token to the contract");

        require(createStake(stakeAmount));

        emit SubmitStake(msg.sender, currentStakeMapIndex, stakeAmount);

    }

    // Renew stake along with reward
    // TODO: Is it worth to ask amount to renew rather than considering amount with reward as renewal amount
    function renewStake(uint256 stakeMapIndex) public allowSubmission allowWithdrawStake(stakeMapIndex) {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender];

        // Calculate the totalAmount
        uint256 totalAmount;
        uint256 rewardAmount;

        rewardAmount = stakeInfo.amount.mul(stakeMap[stakeMapIndex].interestRate).div(10 ** stakeMap[stakeMapIndex].interestRateDecimals);
        totalAmount = stakeInfo.amount.add(rewardAmount);

        // Check for minStake
        require(stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].amount.add(totalAmount) >= minStake, "Invalid stake amount");

        // Update the User Balance
        balances[msg.sender] = balances[msg.sender].sub(stakeInfo.amount);

        // Update the Total Stake
        totalStake = totalStake.sub(stakeInfo.amount);

        // Update the token balance
        tokenBalance = tokenBalance.sub(totalAmount);

        // Update the Stake Status
        stakeInfo.amount = 0;
        stakeInfo.status = StakeStatus.Renewed;

        require(createStake(totalAmount));

        emit RenewStake(msg.sender, currentStakeMapIndex, stakeMapIndex, totalAmount);

    }

    function createStake(uint256 stakeAmount) internal returns(bool) {

        StakeInfo memory req;

        // Check if the user already staked in the current staking period
        if(stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].amount > 0) {

            stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].amount = stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].amount.add(stakeAmount);
            stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].stakedAmount = stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].stakedAmount.add(stakeAmount);

        } else {

            // Create a new stake request
            req.amount = stakeAmount;
            req.stakedAmount = stakeAmount;
            req.approvedAmount = 0;
            req.stakeIndex = stakeMap[currentStakeMapIndex].stakeHolders.length;
            req.status = StakeStatus.Open;
            stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender] = req;

            // Add to the Stake Holders List
            stakeMap[currentStakeMapIndex].stakeHolders.push(msg.sender);

            // Add the currentStakeMapIndex to Address
            stakerPeriodMap[msg.sender].push(currentStakeMapIndex);
        }

        // Update the User balance
        balances[msg.sender] = balances[msg.sender].add(stakeAmount);
        
        // Update the Total Stake
        totalStake = totalStake.add(stakeAmount);

        return true;
    }

    function withdrawStake(uint256 stakeMapIndex) public allowWithdrawStake(stakeMapIndex) {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender];

        // Calculate the totalAmount
        uint256 totalAmount;
        uint256 rewardAmount;

        rewardAmount = stakeInfo.amount.mul(stakeMap[stakeMapIndex].interestRate).div(10 ** stakeMap[stakeMapIndex].interestRateDecimals);
        totalAmount = stakeInfo.amount.add(rewardAmount);

        // Update the User Balance
        balances[msg.sender] = balances[msg.sender].sub(stakeInfo.amount);

        // Update the Total Stake
        totalStake = totalStake.sub(stakeInfo.amount);

        // Update the token balance
        tokenBalance = tokenBalance.sub(totalAmount);

        // Update the Stake Status
        stakeInfo.amount = 0;
        stakeInfo.status = StakeStatus.Claimed;

        // Call the transfer function - Already handles balance check
        require(token.transfer(msg.sender, totalAmount), "Unable to transfer token back to the account");

        emit WithdrawStake(msg.sender, stakeMapIndex, rewardAmount, totalAmount);

    }

    function approveStake(address staker, uint256 approvedStakeAmount) public onlyOperator {

        // Request for Stake should be Open
        require(now > stakeMap[currentStakeMapIndex].endPeriod && now <= stakeMap[currentStakeMapIndex].approvalEndPeriod, "Approval at this point not allowed");

        // Input Validation
        require(approvedStakeAmount > 0, "Invalid approved amount");

        StakeInfo storage stakeInfo = stakeMap[currentStakeMapIndex].stakeHolderInfo[staker];

        // Stake Request Status Should be Open 
        require(stakeInfo.status == StakeStatus.Open && stakeInfo.amount > 0 && stakeInfo.amount >= approvedStakeAmount, "Cannot approve beyond stake amount");
        
        // Add to stakeMap
        if(approvedStakeAmount < stakeInfo.amount) {
            uint256 returnAmount = stakeInfo.amount.sub(approvedStakeAmount);

            // transfer back the remaining amount
            require(token.transfer(staker, returnAmount), "Unable to transfer token back to the account");
        }

        // Update the User Balance
        balances[staker] = balances[staker].sub(stakeInfo.amount);
        balances[staker] = balances[staker].add(approvedStakeAmount);

        // Update the Total Stake
        totalStake = totalStake.sub(stakeInfo.amount);
        totalStake = totalStake.add(approvedStakeAmount);

        // Update the token balance
        tokenBalance = tokenBalance.add(approvedStakeAmount);

        // Update the Stake Request
        stakeInfo.status = StakeStatus.Approved;
        stakeInfo.amount = approvedStakeAmount;
        stakeInfo.approvedAmount = approvedStakeAmount;

        emit ApproveStake(staker, currentStakeMapIndex, msg.sender, approvedStakeAmount);

    }

    function rejectStake(address staker) public onlyOperator {

        // Request for Stake should be Open - Allow for rejection after approval date as well
        require(now > stakeMap[currentStakeMapIndex].endPeriod, "Rejection at this point not allowed");

        StakeInfo storage stakeInfo = stakeMap[currentStakeMapIndex].stakeHolderInfo[staker];

        require(stakeInfo.amount > 0 && stakeInfo.status == StakeStatus.Open, "No staking request found");

        // transfer back the stake to user account
        require(token.transfer(staker, stakeInfo.amount), "Unable to transfer token back to the account");

        // Update the User Balance
        balances[staker] = balances[staker].sub(stakeInfo.amount);

        // Update the Total Stake
        totalStake = totalStake.sub(stakeInfo.amount);

        // Update the Status & Amount
        stakeInfo.amount = 0;
        stakeInfo.approvedAmount = 0;
        stakeInfo.status = StakeStatus.Rejected;

        emit RejectStake(staker, currentStakeMapIndex, msg.sender);

    }

    // Getter Functions
    function getStakeHolders(uint256 stakeMapIndex) public view returns(address[]) {
        return stakeMap[stakeMapIndex].stakeHolders;
    }

    function getStakeHolderStakingPeriods(address staker) public view returns(uint256[]) {
        return stakerPeriodMap[staker];
    }

    function getStakeInfo(uint256 stakeMapIndex, address staker) 
    public 
    view
    returns (bool found, uint256 startPeriod, uint256 endPeriod, uint256 approvalEndPeriod, uint256 interestRate, uint256 interestRateDecimals, uint256 amount, uint256 stakedAmount, uint256 approvedAmount, StakeStatus status, uint256 stakeIndex) 
    {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[staker];
        
        found = false;
        if(stakeInfo.stakedAmount > 0 ) {
            found = true;
        }

        startPeriod = stakeMap[stakeMapIndex].startPeriod;
        endPeriod = stakeMap[stakeMapIndex].endPeriod;
        approvalEndPeriod = stakeMap[stakeMapIndex].approvalEndPeriod;
        interestRate =  stakeMap[stakeMapIndex].interestRate;
        interestRateDecimals = stakeMap[stakeMapIndex].interestRateDecimals;

        amount = stakeInfo.amount;
        stakedAmount = stakeInfo.stakedAmount;
        approvedAmount = stakeInfo.approvedAmount;
        status = stakeInfo.status;
        stakeIndex = stakeInfo.stakeIndex;

    }

}