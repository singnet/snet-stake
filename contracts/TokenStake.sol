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

    
    uint256 public currentStakeMapIndex;
    bool public isStakingClosed;

    // 0-Open, 1-Approved, 2-Rejected, 3-Claimed
    enum StakeStatus { Open, Approved, Rejected, Claimed, Renewed }

    struct StakeInfo {
        uint256 amount;
        uint256 stakedAmount;
        uint256 pendingForApprovalAmount;
        uint256 approvedAmount;
        bool autoRenewal;
        StakeStatus status;
        uint256 stakeIndex;
    }

    // Staking period timestamp (TODO: debatable on timestamp vs blocknumber - went with timestamp)
    struct StakePeriod {
        uint256 startPeriod;
        uint256 submissionEndPeriod;
        uint256 approvalEndPeriod;
        uint256 requestWithdrawStartPeriod;
        uint256 endPeriod;

        uint256 minStake;
        uint256 maxStake;

        uint256 windowMaxCap;

        bool openForExternal;

        uint256 windowTotalStake;
        uint256 windowRewardAmount;

        address[] stakeHolders;
        mapping(address => StakeInfo) stakeHolderInfo; 
    }

    uint256 public nextStakeMapIndex;
    mapping (uint256 => StakePeriod) public stakeMap;

    mapping (address => uint256[]) public stakerPeriodMap;

    // Events
    event NewOwner(address owner);
    event NewOperator(address tokenOperator);

    event OpenForStake(uint256 indexed stakeIndex, address indexed tokenOperator, uint256 startPeriod, uint256 endPeriod, uint256 approvalEndPeriod, uint256 minStake);
    event SubmitStake(uint256 indexed stakeIndex, address indexed staker, uint256 stakeAmount);
    event RequestForWithdrawal(uint256 indexed stakeIndex, address indexed staker);
    event WithdrawStake(uint256 indexed stakeIndex, address indexed staker, uint256 rewardAmount, uint256 totalAmount);

    event ApproveStake(uint256 indexed stakeIndex, address indexed staker, address indexed tokenOperator, uint256 approvedStakeAmount);
    event RejectStake(uint256 indexed stakeIndex, address indexed staker, address indexed tokenOperator);

    event RenewStake(uint256 indexed newStakeIndex, address indexed staker, uint256 oldStakeIndex, uint256 stakeAmount);

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
            now <= stakeMap[currentStakeMapIndex].submissionEndPeriod && 
            (stakeMap[currentStakeMapIndex].openForExternal == true || msg.sender == tokenOperator), 
            "Staking at this point not allowed"
        );
        _;
    }

    // TODO - Check if we need minStake Validation for Auto Renewal
    modifier validStakeLimit(address staker, uint256 stakeAmount) {
        // Check for Min Stake
        require(
            stakeAmount > 0 && 
            stakeMap[currentStakeMapIndex].stakeHolderInfo[staker].amount.add(stakeAmount) >= stakeMap[currentStakeMapIndex].minStake &&
            stakeMap[currentStakeMapIndex].stakeHolderInfo[staker].amount.add(stakeAmount) <= stakeMap[currentStakeMapIndex].maxStake , 
            "Invalid stake amount"
        );
        _;
    }

    // TODO - OptOut Logic
    modifier allowRequestForWithdraw(uint256 stakeMapIndex) {
        // Check to see request for withdraw stake is allowed
        require(
            stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender].amount > 0 && 
            stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender].status == StakeStatus.Approved && 
            now >= stakeMap[currentStakeMapIndex].requestWithdrawStartPeriod &&
            now <= stakeMap[currentStakeMapIndex].endPeriod, 
            "Request for withdrawal at this point not allowed"
        );
        _;
    }

    modifier allowWithdrawStake(uint256 stakeMapIndex) {
        // Check to see withdraw stake is allowed
        require(
            now > stakeMap[stakeMapIndex].endPeriod && 
            stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender].amount > 0 && 
            stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender].status == StakeStatus.Approved &&
            (stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender].autoRenewal == false || isStakingClosed == true) , 
            "Invalid withdraw request"
        );
        _;
    }


    modifier allowAutoRenewStake(uint256 stakeMapIndex, address staker) {
        // Check to see withdraw stake is allowed
        require(
            now > stakeMap[stakeMapIndex].endPeriod && 
            stakeMap[stakeMapIndex].stakeHolderInfo[staker].amount > 0 && 
            stakeMap[stakeMapIndex].stakeHolderInfo[staker].status == StakeStatus.Approved &&
            stakeMap[stakeMapIndex].stakeHolderInfo[staker].autoRenewal == true, 
            "Invalid renewal request"
        );
        _;
    }


    constructor(address _token)
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
        require(isStakingClosed == false, "Withdrawal not allowed when staking is closed");

        // Update the token balance
        tokenBalance = tokenBalance.sub(value);

    }


    // TODO - Write a function to update the isStakingClosed 



    // TODO: Check if we need additional function to Update the Current Stake Period
    // TODO: Do we need to allow New Staking Window if Staking Closed Flag is True 
    function openForStake(uint256 _startPeriod, uint256 _submissionEndPeriod,  uint256 _approvalEndPeriod, uint256 _requestWithdrawStartPeriod, uint256 _endPeriod, uint256 _windowRewardAmount, uint256 _windowMaxCap, uint256 _minStake, uint256 _maxStake, bool _openForExternal) public onlyOperator {

        // Check Input Parameters
        require(_startPeriod >= now && _startPeriod < _submissionEndPeriod && _submissionEndPeriod < _approvalEndPeriod && _approvalEndPeriod < _requestWithdrawStartPeriod && _requestWithdrawStartPeriod < _endPeriod, "Invalid stake period");
        require(_windowRewardAmount > 0 && _windowMaxCap > 0 && _minStake > 0 && _maxStake > 0 , "Invalid min stake or interest rate" );

        // Check Stake in Progress
        require(nextStakeMapIndex == 0 || now > stakeMap[currentStakeMapIndex].approvalEndPeriod, "Cannot have more than one stake request at a time");

        // Move the staking period to next one
        currentStakeMapIndex = nextStakeMapIndex;
        StakePeriod memory stakePeriod;

        // Set Staking attributes
        stakePeriod.startPeriod = _startPeriod;
        stakePeriod.submissionEndPeriod = _submissionEndPeriod;
        stakePeriod.approvalEndPeriod = _approvalEndPeriod;
        stakePeriod.requestWithdrawStartPeriod = _requestWithdrawStartPeriod;
        stakePeriod.endPeriod = _endPeriod;
        stakePeriod.windowRewardAmount = _windowRewardAmount;
        stakePeriod.windowMaxCap = _windowMaxCap;
        stakePeriod.minStake = _minStake;
        stakePeriod.maxStake = _maxStake;        
        stakePeriod.openForExternal = _openForExternal;

        stakeMap[currentStakeMapIndex] = stakePeriod;

        emit OpenForStake(nextStakeMapIndex++, msg.sender, _startPeriod, _endPeriod, _approvalEndPeriod, _minStake);

        // TODO: Do we need to allow next staking period in case if any existsing stakes waiting for approval
        // Rejection is enabled even after the Approval Period, Works even after the pending items

    }

    // TODO - Need to check if there is already Auto Renewed Stake? 
    function createStake(uint256 stakeAmount, bool autoRenewal, StakeStatus stakeStatus) internal returns(bool) {

        StakeInfo memory req;

        // Check if the user already staked in the current staking period
        if(stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].amount > 0) {

            stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].amount = stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].amount.add(stakeAmount);
            stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].stakedAmount = stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].stakedAmount.add(stakeAmount);

            if(stakeStatus == StakeStatus.Open) {
                stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].pendingForApprovalAmount = stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].pendingForApprovalAmount.add(stakeAmount);
            } else if (stakeStatus == StakeStatus.Approved) {
                stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].approvedAmount = stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].approvedAmount.add(stakeAmount);
            }

            stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].autoRenewal = autoRenewal;

        } else {

            // Create a new stake request
            req.amount = stakeAmount;
            req.stakedAmount = stakeAmount;
            req.autoRenewal = autoRenewal;
            req.approvedAmount = 0;
            req.stakeIndex = stakeMap[currentStakeMapIndex].stakeHolders.length;
            req.status = stakeStatus;

            if(stakeStatus == StakeStatus.Open) {
                req.pendingForApprovalAmount = stakeAmount;
            } else if (stakeStatus == StakeStatus.Approved) {
                req.approvedAmount = stakeAmount;
            }

            stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender] = req;

            // Add to the Stake Holders List
            stakeMap[currentStakeMapIndex].stakeHolders.push(msg.sender);

            // Add the currentStakeMapIndex to Address
            stakerPeriodMap[msg.sender].push(currentStakeMapIndex);
        }

        // TODO - Old Code
        // Update the User balance
        //balances[msg.sender] = balances[msg.sender].add(stakeAmount);
        
        // Update the Total Stake
        //totalStake = totalStake.add(stakeAmount);

        return true;
    }

    function submitStake(uint256 stakeAmount, bool autoRenewal) public allowSubmission validStakeLimit(msg.sender, stakeAmount) {

        // Transfer the Tokens to Contract
        require(token.transferFrom(msg.sender, this, stakeAmount), "Unable to transfer token to the contract");

        require(createStake(stakeAmount, autoRenewal, StakeStatus.Open));

        // Update the User balance
        balances[msg.sender] = balances[msg.sender].add(stakeAmount);
        
        // Update the Total Stake
        totalStake = totalStake.add(stakeAmount);

        emit SubmitStake(currentStakeMapIndex, msg.sender, stakeAmount);

    }

    function calculateRewardAmount(uint256 stakeMapIndex, uint256 stakeAmount) internal view returns(uint256) {

        uint256 calcRewardAmount;

        if(stakeMap[stakeMapIndex].windowTotalStake < stakeMap[stakeMapIndex].windowMaxCap) {
            calcRewardAmount = stakeAmount.mul(stakeMap[stakeMapIndex].windowRewardAmount).div(stakeMap[stakeMapIndex].windowTotalStake);
        } else {
            calcRewardAmount = stakeAmount.mul(stakeMap[stakeMapIndex].windowRewardAmount).div(stakeMap[stakeMapIndex].windowMaxCap);
        }

        return calcRewardAmount;
    }

    // TODO - Need to Update the Functionality
    function autoRenewStake(uint256 stakeMapIndex, address staker, uint256 approvedAmount) public onlyOperator validStakeLimit(staker, approvedAmount) allowSubmission allowAutoRenewStake(stakeMapIndex, staker) {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[staker];

        // Calculate the totalAmount
        uint256 totalAmount;
        uint256 rewardAmount;

        rewardAmount = calculateRewardAmount(stakeMapIndex, stakeInfo.amount);
        totalAmount = stakeInfo.amount.add(rewardAmount);

        require(approvedAmount <= totalAmount, "Invalid approved amount");

        // Create a new stake in current staking period
        // TODO - Call Create Stake Functionality


        // Update the User Balance
        balances[staker] = balances[staker].add(approvedAmount).sub(stakeInfo.amount);

        // Update the Total Stake
        totalStake = totalStake.add(approvedAmount).sub(stakeInfo.amount);

        // Update the token balance
        tokenBalance = tokenBalance.add(approvedAmount).sub(totalAmount);

        // Update the Stake Status
        stakeInfo.amount = 0;
        stakeInfo.status = StakeStatus.Renewed;


        // TODO - Return the amount in case of smaller amount approved
        
        // TODO - Update the balance in the respective variables - Only Reward we need to add

        //emit AutoRenewStake(currentStakeMapIndex, staker, stakeMapIndex, tokenOperator, totalAmount, approvedAmount);


    }


    // TODO - Need to Update the Functionality
    // Renew stake along with reward
    function renewStake(uint256 stakeMapIndex, bool autoRenewal) public allowSubmission allowWithdrawStake(stakeMapIndex) {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender];

        // Calculate the totalAmount
        uint256 totalAmount;
        uint256 rewardAmount;

        rewardAmount = calculateRewardAmount(stakeMapIndex, stakeInfo.amount);

        totalAmount = stakeInfo.amount.add(rewardAmount);

        // Check for minStake
        require(stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].amount.add(totalAmount) >= stakeMap[currentStakeMapIndex].minStake, "Invalid stake amount");

        // Update the User Balance
        balances[msg.sender] = balances[msg.sender].sub(stakeInfo.amount);

        // Update the Total Stake
        totalStake = totalStake.sub(stakeInfo.amount);

        // Update the token balance
        tokenBalance = tokenBalance.sub(totalAmount);

        // Update the Stake Status
        stakeInfo.amount = 0;
        stakeInfo.status = StakeStatus.Renewed;

        require(createStake(totalAmount, autoRenewal, StakeStatus.Open));

        emit RenewStake(currentStakeMapIndex, msg.sender, stakeMapIndex, totalAmount);

    }

    function requestForWithdrawal(uint256 stakeMapIndex) public allowRequestForWithdraw(stakeMapIndex) {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender];
        stakeInfo.autoRenewal = false;

        emit RequestForWithdrawal(stakeMapIndex, msg.sender);

    }

    function withdrawStake(uint256 stakeMapIndex) public allowWithdrawStake(stakeMapIndex) {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender];

        // Calculate the totalAmount
        uint256 totalAmount;
        uint256 rewardAmount;

        rewardAmount = calculateRewardAmount(stakeMapIndex, stakeInfo.amount);

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

        emit WithdrawStake(stakeMapIndex, msg.sender, rewardAmount, totalAmount);

    }

    function approveStake(address staker, uint256 approvedStakeAmount) public onlyOperator {

        // Request for Stake should be Open
        require(now > stakeMap[currentStakeMapIndex].submissionEndPeriod && now <= stakeMap[currentStakeMapIndex].approvalEndPeriod, "Approval at this point not allowed");

        // Input Validation
        require(approvedStakeAmount > 0, "Invalid approved amount");

        StakeInfo storage stakeInfo = stakeMap[currentStakeMapIndex].stakeHolderInfo[staker];

        // Stake Request Status Should be Open
        // TODO - Add to code to handle Status Approved for Auto Renewal 
        require(stakeInfo.status == StakeStatus.Open && stakeInfo.pendingForApprovalAmount > 0 && stakeInfo.pendingForApprovalAmount >= approvedStakeAmount, "Cannot approve beyond stake amount");
        

        uint256 returnAmount;
        // Add to stakeMap
        if(approvedStakeAmount < stakeInfo.pendingForApprovalAmount) {
            returnAmount = stakeInfo.pendingForApprovalAmount.sub(approvedStakeAmount);

            // transfer back the remaining amount
            require(token.transfer(staker, returnAmount), "Unable to transfer token back to the account");
        }

        // Update current stake period total stake
        stakeMap[currentStakeMapIndex].windowTotalStake = stakeMap[currentStakeMapIndex].windowTotalStake.add(approvedStakeAmount);

        // Update the User Balance
        balances[staker] = balances[staker].sub(returnAmount);
        

        // Update the Total Stake
        totalStake = totalStake.sub(returnAmount);
        

        // Update the token balance
        tokenBalance = tokenBalance.add(approvedStakeAmount);

        // Update the Stake Request
        stakeInfo.status = StakeStatus.Approved;
        stakeInfo.amount = stakeInfo.amount.sub(returnAmount);
        stakeInfo.pendingForApprovalAmount = 0;
        stakeInfo.approvedAmount = stakeInfo.approvedAmount.add(approvedStakeAmount);

        emit ApproveStake(currentStakeMapIndex, staker, msg.sender, approvedStakeAmount);

    }

    function rejectStake(uint256 stakeMapIndex,address staker) public onlyOperator {

        // Request for Stake should be Open - Allow for rejection after approval period as well
        require(now > stakeMap[stakeMapIndex].submissionEndPeriod, "Rejection at this point not allowed");

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[staker];

        require(stakeInfo.pendingForApprovalAmount > 0 && stakeInfo.status == StakeStatus.Open , "No staking request found");

        // transfer back the stake to user account
        require(token.transfer(staker, stakeInfo.pendingForApprovalAmount), "Unable to transfer token back to the account");

        // Update the User Balance
        balances[staker] = balances[staker].sub(stakeInfo.pendingForApprovalAmount);

        // Update the Total Stake
        totalStake = totalStake.sub(stakeInfo.pendingForApprovalAmount);

        // Update the Status & Amount
        stakeInfo.amount = 0;
        stakeInfo.pendingForApprovalAmount = 0;
        stakeInfo.approvedAmount = 0;
        stakeInfo.status = StakeStatus.Rejected;

        emit RejectStake(stakeMapIndex, staker, msg.sender);

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
    returns (bool found, uint256 amount, uint256 stakedAmount, uint256 pendingForApprovalAmount, uint256 approvedAmount, bool autoRenewal, StakeStatus status, uint256 stakeIndex) 
    {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[staker];
        
        found = false;
        if(stakeInfo.stakedAmount > 0 ) {
            found = true;
        }

        amount = stakeInfo.amount;
        stakedAmount = stakeInfo.stakedAmount;
        pendingForApprovalAmount = stakeInfo.pendingForApprovalAmount;
        approvedAmount = stakeInfo.approvedAmount;
        autoRenewal = stakeInfo.autoRenewal;
        status = stakeInfo.status;
        stakeIndex = stakeInfo.stakeIndex;

    }

}