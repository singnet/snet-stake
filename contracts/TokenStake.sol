pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";

contract TokenStake {
    
    using SafeMath for uint256;

    address public owner;
    ERC20 public token; // Address of token contract
    address public tokenOperator; // Address to manage the Stake 
    uint256 public totalPendingApprovalStake; // Stake which should not be part of the Liquid Pool
    mapping (address => uint256) public balances; // Useer Token balance in the contract

    uint256 public currentStakeMapIndex; // Current Stake Index to avoid math calc in all methods

    struct StakeInfo {
        bool exist;
        uint256 pendingForApprovalAmount;
        uint256 approvedAmount;
        bool autoRenewal;
    }

    // Staking period timestamp (Debatable on timestamp vs blocknumber - went with timestamp)
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

    mapping (uint256 => StakePeriod) public stakeMap;

    mapping (address => uint256[]) public stakerPeriodMap;

    // Events
    event NewOwner(address owner);
    event NewOperator(address tokenOperator);

    event WithdrawToken(address indexed tokenOperator, uint256 amount);
    event DepositToken(address indexed tokenOperator, uint256 amount);

    event OpenForStake(uint256 indexed stakeIndex, address indexed tokenOperator, uint256 startPeriod, uint256 endPeriod, uint256 approvalEndPeriod, uint256 rewardAmount);
    event SubmitStake(uint256 indexed stakeIndex, address indexed staker, uint256 stakeAmount, bool autoRenewal);
    event UpdateAutoRenewal(uint256 indexed stakeIndex, address indexed staker, bool autoRenewal);
    event ClaimStake(uint256 indexed stakeIndex, address indexed staker, uint256 rewardAmount, uint256 totalAmount);

    event ApproveStake(uint256 indexed stakeIndex, address indexed staker, address indexed tokenOperator, uint256 approvedStakeAmount, uint256 returnAmount);
    event RejectStake(uint256 indexed stakeIndex, address indexed staker, address indexed tokenOperator, uint256 returnAmount);

    event AutoRenewStake(uint256 indexed newStakeIndex, address indexed staker, uint256 oldStakeIndex, address tokenOperator, uint256 stakeAmount, uint256 approvedAmount, uint256 returnAmount);
    event RenewStake(uint256 indexed newStakeIndex, address indexed staker, uint256 oldStakeIndex, uint256 totalAmount, uint256 stakeAmount, uint256 returnAmount);

    event WithdrawStake(uint256 indexed stakeIndex, address indexed staker, uint256 stakeAmount);

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

    // Token Operator should be able to do auto renewal
    modifier allowSubmission() {        
        require(
            now >= stakeMap[currentStakeMapIndex].startPeriod && 
            now <= stakeMap[currentStakeMapIndex].submissionEndPeriod && 
            (stakeMap[currentStakeMapIndex].openForExternal == true || msg.sender == tokenOperator), 
            "Staking at this point not allowed"
        );
        _;
    }

    modifier validStakeLimit(address staker, uint256 stakeAmount) {

        uint256 stakerTotalStake;
        stakerTotalStake = stakeAmount.add(stakeMap[currentStakeMapIndex].stakeHolderInfo[staker].pendingForApprovalAmount);
        stakerTotalStake = stakerTotalStake.add(stakeMap[currentStakeMapIndex].stakeHolderInfo[staker].approvedAmount);

        // Check for Min Stake
        require(
            stakeAmount > 0 && 
            stakerTotalStake >= stakeMap[currentStakeMapIndex].minStake &&
            stakerTotalStake <= stakeMap[currentStakeMapIndex].maxStake, 
            "Invalid stake amount"
        );
        _;

    }

    modifier canUpdateAutoRenewal(uint256 stakeMapIndex) {
        // Check to see request for withdraw stake is allowed
        require(
            stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender].approvedAmount > 0 && 
            now >= stakeMap[currentStakeMapIndex].requestWithdrawStartPeriod &&
            now <= stakeMap[currentStakeMapIndex].endPeriod, 
            "Request for withdrawal at this point not allowed"
        );
        _;
    }

    modifier allowClaimStake(uint256 stakeMapIndex) {
        // Check to see withdraw stake is allowed

        uint256 graceTime;
        graceTime = stakeMap[stakeMapIndex].endPeriod.sub(stakeMap[stakeMapIndex].requestWithdrawStartPeriod);

        require(
            now > stakeMap[stakeMapIndex].endPeriod && 
            stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender].approvedAmount > 0 && 
            (stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender].autoRenewal == false || now > stakeMap[stakeMapIndex].endPeriod.add(graceTime)) , 
            "Invalid claim request"
        );
        _;
    }


    modifier allowAutoRenewStake(uint256 stakeMapIndex, address staker) {
        // Check to see withdraw stake is allowed
        require(
            now > stakeMap[stakeMapIndex].endPeriod && 
            stakeMap[stakeMapIndex].stakeHolderInfo[staker].approvedAmount > 0 && 
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

        emit DepositToken(tokenOperator, value);

    }
    
    function withdrawToken(uint256 value) public onlyOperator
    {

        // Contract Token balance should maintain min of totalPendingApprovalStake 
        require(token.balanceOf(this) >= totalPendingApprovalStake.add(value), "Not enough balance in the contract");
        require(token.transfer(msg.sender, value), "Unable to transfer token to the operator account");

        emit WithdrawToken(tokenOperator, value);
        
    }


    function openForStake(uint256 _startPeriod, uint256 _submissionEndPeriod,  uint256 _approvalEndPeriod, uint256 _requestWithdrawStartPeriod, uint256 _endPeriod, uint256 _windowRewardAmount, uint256 _windowMaxCap, uint256 _minStake, uint256 _maxStake, bool _openForExternal) public onlyOperator {

        // Check Input Parameters
        require(_startPeriod >= now && _startPeriod < _submissionEndPeriod && _submissionEndPeriod < _approvalEndPeriod && _approvalEndPeriod < _requestWithdrawStartPeriod && _requestWithdrawStartPeriod < _endPeriod, "Invalid stake period");
        require(_windowRewardAmount > 0 && _windowMaxCap > 0 && _minStake > 0 && _maxStake > 0 , "Invalid min stake or interest rate" );

        // Check Stake in Progress
        require(currentStakeMapIndex == 0 || now > stakeMap[currentStakeMapIndex].approvalEndPeriod, "Cannot have more than one stake request at a time");

        // Move the staking period to next one
        currentStakeMapIndex = currentStakeMapIndex + 1;
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

        emit OpenForStake(currentStakeMapIndex, msg.sender, _startPeriod, _endPeriod, _approvalEndPeriod, _windowRewardAmount);

    }

    function createStake(address staker, uint256 stakeAmount, bool autoRenewal, bool isAutoRenewal) internal returns(bool) {

        StakeInfo storage stakeInfo = stakeMap[currentStakeMapIndex].stakeHolderInfo[staker];

        // Check if the user already staked in the current staking period
        if(stakeInfo.exist) {

            if(isAutoRenewal) {
                stakeInfo.approvedAmount = stakeInfo.approvedAmount.add(stakeAmount);
            } else {
                stakeInfo.pendingForApprovalAmount = stakeInfo.pendingForApprovalAmount.add(stakeAmount);
            }
            stakeInfo.autoRenewal = autoRenewal;

        } else {

            StakeInfo memory req;

            // Create a new stake request
            req.exist = true;
            req.autoRenewal = autoRenewal;
            req.approvedAmount = 0;

            if(isAutoRenewal) {
                req.approvedAmount = stakeAmount;
            } else {
                req.pendingForApprovalAmount = stakeAmount;
            }

            stakeMap[currentStakeMapIndex].stakeHolderInfo[staker] = req;

            // Add to the Stake Holders List
            stakeMap[currentStakeMapIndex].stakeHolders.push(staker);

            // Add the currentStakeMapIndex to Address
            stakerPeriodMap[staker].push(currentStakeMapIndex);
        }

        return true;
    }

    function submitStake(uint256 stakeAmount, bool autoRenewal) public allowSubmission validStakeLimit(msg.sender, stakeAmount) {

        // Transfer the Tokens to Contract
        require(token.transferFrom(msg.sender, this, stakeAmount), "Unable to transfer token to the contract");

        require(createStake(msg.sender, stakeAmount, autoRenewal, false));

        // Update the User balance
        balances[msg.sender] = balances[msg.sender].add(stakeAmount);

        // Update the total pending for Approval
        totalPendingApprovalStake = totalPendingApprovalStake.add(stakeAmount);
        
        emit SubmitStake(currentStakeMapIndex, msg.sender, stakeAmount, autoRenewal);

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

    function autoRenewStake(uint256 stakeMapIndex, address staker, uint256 approvedAmount) public onlyOperator allowSubmission allowAutoRenewStake(stakeMapIndex, staker) {

        StakeInfo storage oldStakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[staker];

        // Calculate the totalAmount
        uint256 totalAmount;
        uint256 rewardAmount;
        uint256 returnAmount;

        rewardAmount = calculateRewardAmount(stakeMapIndex, oldStakeInfo.approvedAmount);
        totalAmount = oldStakeInfo.approvedAmount.add(rewardAmount);

        require(approvedAmount <= totalAmount, "Invalid approved amount");

        // Create a new stake in current staking period
        require(createStake(staker, approvedAmount, oldStakeInfo.autoRenewal, true));

        if(approvedAmount < totalAmount) {

            returnAmount = totalAmount.sub(approvedAmount);

            // transfer back the remaining amount
            require(token.transfer(staker, returnAmount), "Unable to transfer token back to the account");

        }

        // Update current stake period total stake
        stakeMap[currentStakeMapIndex].windowTotalStake = stakeMap[currentStakeMapIndex].windowTotalStake.add(approvedAmount);

        // Update the User Balance
        balances[staker] = balances[staker].add(rewardAmount).sub(returnAmount);

        // Update the existsing Approved Amount
        oldStakeInfo.approvedAmount = 0;

        emit AutoRenewStake(currentStakeMapIndex, staker, stakeMapIndex, tokenOperator, totalAmount, approvedAmount, returnAmount);

    }


    // Renew stake along with reward
    function renewStake(uint256 stakeMapIndex, uint256 stakeAmount, bool autoRenewal) public allowSubmission allowClaimStake(stakeMapIndex) {

        StakeInfo storage oldStakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender];

        // Calculate the totalAmount
        uint256 totalAmount;
        uint256 rewardAmount;

        rewardAmount = calculateRewardAmount(stakeMapIndex, oldStakeInfo.approvedAmount);
        totalAmount = oldStakeInfo.approvedAmount.add(rewardAmount);

        uint256 stakerTotalStake;
        stakerTotalStake = stakeAmount.add(stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].pendingForApprovalAmount);
        stakerTotalStake = stakerTotalStake.add(stakeMap[currentStakeMapIndex].stakeHolderInfo[msg.sender].approvedAmount);

        // Not able to use modifier
        require(
            stakeAmount > 0 && stakeAmount <= totalAmount && 
            stakerTotalStake >= stakeMap[currentStakeMapIndex].minStake &&
            stakerTotalStake <= stakeMap[currentStakeMapIndex].maxStake , 
            "Invalid stake amount"
        );

        require(createStake(msg.sender, stakeAmount, autoRenewal, false));

        uint256 returnAmount;
        if(stakeAmount < totalAmount) {
            returnAmount = totalAmount.sub(stakeAmount);
            // transfer back the remaining amount
            require(token.transfer(msg.sender, returnAmount), "Unable to transfer token back to the account");
        }

        // Update the User Balance
        balances[msg.sender] = balances[msg.sender].add(rewardAmount).sub(returnAmount);

        // Update the total pending for Approval
        totalPendingApprovalStake = totalPendingApprovalStake.add(stakeAmount);

        // Update the existing Stake Approved Amount
        oldStakeInfo.approvedAmount = 0;

        emit RenewStake(currentStakeMapIndex, msg.sender, stakeMapIndex, totalAmount, stakeAmount, returnAmount);

    }

    function updateAutoRenewal(uint256 stakeMapIndex, bool autoRenewal) public canUpdateAutoRenewal(stakeMapIndex) {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender];
        stakeInfo.autoRenewal = autoRenewal;

        emit UpdateAutoRenewal(stakeMapIndex, msg.sender, autoRenewal);

    }

    function claimStake(uint256 stakeMapIndex) public allowClaimStake(stakeMapIndex) {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender];

        // Calculate the totalAmount
        uint256 totalAmount;
        uint256 rewardAmount;

        rewardAmount = calculateRewardAmount(stakeMapIndex, stakeInfo.approvedAmount);

        totalAmount = stakeInfo.approvedAmount.add(rewardAmount);

        // Update the User Balance
        balances[msg.sender] = balances[msg.sender].sub(stakeInfo.approvedAmount);

        // Update the existing Stake Approved Amount
        stakeInfo.approvedAmount = 0;

        // Call the transfer function - Already handles balance check
        require(token.transfer(msg.sender, totalAmount), "Unable to transfer token back to the account");

        emit ClaimStake(stakeMapIndex, msg.sender, rewardAmount, totalAmount);

    }

    function approveStake(address staker, uint256 approvedAmount) public onlyOperator {

        // Request for Stake should be in Approval phase
        require(now > stakeMap[currentStakeMapIndex].submissionEndPeriod && now <= stakeMap[currentStakeMapIndex].approvalEndPeriod, "Approval at this point not allowed");

        // Input Validation
        require(approvedAmount > 0, "Invalid approved amount");

        StakeInfo storage stakeInfo = stakeMap[currentStakeMapIndex].stakeHolderInfo[staker];

        require(stakeInfo.pendingForApprovalAmount > 0 && stakeInfo.pendingForApprovalAmount >= approvedAmount, "Cannot approve beyond stake amount");

        uint256 returnAmount;

        if(approvedAmount < stakeInfo.pendingForApprovalAmount) {
            returnAmount = stakeInfo.pendingForApprovalAmount.sub(approvedAmount);

            // transfer back the remaining amount
            require(token.transfer(staker, returnAmount), "Unable to transfer token back to the account");
        }

        // Update current stake period total stake
        stakeMap[currentStakeMapIndex].windowTotalStake = stakeMap[currentStakeMapIndex].windowTotalStake.add(approvedAmount);

        // Update the User Balance
        balances[staker] = balances[staker].sub(returnAmount);

        // Update the total pending for Approval
        totalPendingApprovalStake = totalPendingApprovalStake.sub(stakeInfo.pendingForApprovalAmount);

        // Update the Stake Request
        stakeInfo.pendingForApprovalAmount = 0;
        stakeInfo.approvedAmount = stakeInfo.approvedAmount.add(approvedAmount);

        emit ApproveStake(currentStakeMapIndex, staker, msg.sender, approvedAmount, returnAmount);

    }

    function rejectStake(uint256 stakeMapIndex, address staker) public onlyOperator {

        // Allow for rejection after approval period as well
        require(now > stakeMap[stakeMapIndex].submissionEndPeriod, "Rejection at this point is not allowed");

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[staker];

        // In case of if there are auto renewals reject should not be allowed
        require(stakeInfo.pendingForApprovalAmount > 0, "No staking request found");

        uint256 returnAmount;
        returnAmount = stakeInfo.pendingForApprovalAmount;

        // transfer back the stake to user account
        require(token.transfer(staker, stakeInfo.pendingForApprovalAmount), "Unable to transfer token back to the account");

        // Update the User Balance
        balances[staker] = balances[staker].sub(stakeInfo.pendingForApprovalAmount);

        // Update the total pending for Approval
        totalPendingApprovalStake = totalPendingApprovalStake.sub(stakeInfo.pendingForApprovalAmount);

        // Update the Pending Amount
        stakeInfo.pendingForApprovalAmount = 0;

        emit RejectStake(stakeMapIndex, staker, msg.sender, returnAmount);

    }

    // To withdraw stake during submission phase or after approval end period when no action from token Operator
    function withdrawStake(uint256 stakeMapIndex, uint256 stakeAmount) public {

        require(
            (now >= stakeMap[stakeMapIndex].startPeriod && now <= stakeMap[stakeMapIndex].submissionEndPeriod) ||
            now > stakeMap[stakeMapIndex].approvalEndPeriod,
            "Stake withdraw at this point is not allowed"
        );

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[msg.sender];

        // In Any State User can withdraw - based on time slots as above
        require(stakeAmount > 0 && stakeInfo.pendingForApprovalAmount > 0 &&
        stakeInfo.pendingForApprovalAmount >= stakeAmount,
        "Cannot withdraw beyond stake amount");

        // Allow withdaw not less than minStake or Full Amount
        require(
            stakeInfo.pendingForApprovalAmount.sub(stakeAmount) >= stakeMap[stakeMapIndex].minStake || 
            stakeInfo.pendingForApprovalAmount == stakeAmount,
            "Can withdraw full amount or partial amount maintaining min stake"
        );

        // Update the staker balance in the staking window
        stakeInfo.pendingForApprovalAmount = stakeInfo.pendingForApprovalAmount.sub(stakeAmount);

        // Update the User balance
        balances[msg.sender] = balances[msg.sender].sub(stakeAmount);

        // Update the total pending for Approval
        totalPendingApprovalStake = totalPendingApprovalStake.sub(stakeAmount);

        // Return to User Wallet
        require(token.transfer(msg.sender, stakeAmount), "Unable to transfer token to the account");

        emit WithdrawStake(stakeMapIndex, msg.sender, stakeAmount);
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
    returns (bool found, uint256 pendingForApprovalAmount, uint256 approvedAmount, bool autoRenewal) 
    {

        StakeInfo storage stakeInfo = stakeMap[stakeMapIndex].stakeHolderInfo[staker];
        
        found = false;
        if(stakeInfo.exist) {
            found = true;
        }

        pendingForApprovalAmount = stakeInfo.pendingForApprovalAmount;
        approvedAmount = stakeInfo.approvedAmount;
        autoRenewal = stakeInfo.autoRenewal;
    }

}