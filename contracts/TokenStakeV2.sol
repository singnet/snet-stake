pragma solidity >=0.4.22 <0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TokenStakeV2 is Ownable{
    
    using SafeMath for uint256;

    ERC20 public token; // Address of token contract
    address public tokenOperator; // Address to manage the Stake 

    mapping (address => uint256) public balances; // Useer Token balance in the contract

    uint256 public currentStakeMapIndex; // Current Stake Index to avoid math calc in all methods
    uint256 public maxDaysToOpenInSecs;       // Max number of days in the future to open a new stake

    struct StakeInfo {
        bool exist;
        bool autoRenewal;
        uint256 approvedAmount;
    }

    // Staking period timestamp (Debatable on timestamp vs blocknumber - went with timestamp)
    struct StakePeriod {
        uint256 startPeriod;
        uint256 submissionEndPeriod;
        uint256 approvalEndPeriod;
        uint256 requestWithdrawStartPeriod;
        uint256 endPeriod;

        uint256 minStake;

        bool openForExternal;

        uint256 windowTotalStake;
        uint256 windowRewardAmount;

        address[] stakeHolders; 
    }

    mapping (uint256 => StakePeriod) public stakeMap;

    // All Stake Holders
    mapping(address => mapping(uint256 => StakeInfo)) stakeHolderInfo;


    // Events
    event NewOperator(address tokenOperator);

    event WithdrawToken(address indexed tokenOperator, uint256 amount);
    event DepositToken(address indexed tokenOperator, uint256 amount);

    event OpenForStake(uint256 indexed stakeIndex, address indexed tokenOperator, uint256 startPeriod, uint256 endPeriod, uint256 approvalEndPeriod, uint256 rewardAmount);
    event SubmitStake(uint256 indexed stakeIndex, address indexed staker, uint256 stakeAmount, bool autoRenewal);
    event UpdateAutoRenewal(uint256 indexed stakeIndex, address indexed staker, bool autoRenewal);
    event ClaimStake(uint256 indexed stakeIndex, address indexed staker, uint256 rewardAmount, uint256 totalAmount);   
    event RejectStake(uint256 indexed stakeIndex, address indexed staker, address indexed tokenOperator, uint256 returnAmount);
    event AutoRenewStake(uint256 indexed newStakeIndex, address indexed staker, uint256 oldStakeIndex, address tokenOperator, uint256 stakeAmount, uint256 rewardAmount);
    event WithdrawStake(uint256 indexed stakeIndex, address indexed staker, uint256 stakeAmount);

    // Modifiers
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
            stakeMap[currentStakeMapIndex].openForExternal == true, 
            "Staking at this point not allowed"
        );
        _;
    }


    // Check for the limits
    modifier validStakeLimit(address staker, uint256 stakeAmount) {

        uint256 stakerTotalStake;

        // Check for Min Stake
        require(
            stakeAmount > 0 && 
            stakeAmount.add(stakeHolderInfo[staker][currentStakeMapIndex].approvedAmount) >= stakeMap[currentStakeMapIndex].minStake, 
            "Need to have min stake"
        );
        _;

    }

    // Check for auto renewal flag update
    modifier canUpdateAutoRenewal(uint256 stakeMapIndex) {
        require(
            stakeHolderInfo[msg.sender][stakeMapIndex].approvedAmount > 0 && 
            ((now >= stakeMap[stakeMapIndex].startPeriod &&
            now <= stakeMap[stakeMapIndex].submissionEndPeriod) || 
            (now >= stakeMap[stakeMapIndex].requestWithdrawStartPeriod &&
            now <= stakeMap[stakeMapIndex].endPeriod)), 
            "Update to auto renewal at this point not allowed"
        );
        _;
    }
    
    modifier allowClaimStake(uint256 stakeMapIndex) {

        uint256 graceTime;
        graceTime = stakeMap[stakeMapIndex].endPeriod.sub(stakeMap[stakeMapIndex].submissionEndPeriod);

        require(
            now > stakeMap[stakeMapIndex].endPeriod && 
            stakeHolderInfo[msg.sender][stakeMapIndex].approvedAmount > 0 && 
            (stakeHolderInfo[msg.sender][stakeMapIndex].autoRenewal == false || now > stakeMap[stakeMapIndex].endPeriod.add(graceTime)) , 
            "Invalid claim request"
        );
        _;
    }

    modifier allowAutoRenewStake(uint256 stakeMapIndex, address staker) {
        // Check to see withdraw stake is allowed
        require(
            now > stakeMap[stakeMapIndex].endPeriod && 
            stakeHolderInfo[staker][stakeMapIndex].approvedAmount > 0 && 
            stakeHolderInfo[staker][stakeMapIndex].autoRenewal == true, 
            "Invalid renewal request"
        );
        _;
    }

    constructor(address _token)
    public
    {
        token = ERC20(_token);
        tokenOperator = msg.sender;
        maxDaysToOpenInSecs = 7776000; // 90d * 24h * 60m * 60s
        currentStakeMapIndex = 0;
    }


    function updateOperator(address newOperator) public onlyOwner {

        require(newOperator != address(0), "Invalid operator address");
        
        tokenOperator = newOperator;

        emit NewOperator(newOperator);
    }

    function updateMaxDaysToOpen(uint256 maxNumOfDaysToOpen) public onlyOperator {

        require(maxNumOfDaysToOpen > 0, "Invalid input value");
        maxDaysToOpenInSecs = maxNumOfDaysToOpen.mul(86400);   // maxNumOfDaysToOpen * 24h * 60m * 60s

    }

    function depositToken(uint256 value) public onlyOperator {

        // Input validation are in place in token contract
        require(token.transferFrom(msg.sender, address(this), value), "Unable to transfer token to the contract"); 

        emit DepositToken(tokenOperator, value);

    }
    
    function withdrawToken(uint256 value) public onlyOperator
    {

        // Check if contract is having required balance 
        require(token.balanceOf(address(this)) >= value, "Not enough balance in the contract");
        require(token.transfer(msg.sender, value), "Unable to transfer token to the operator account");

        emit WithdrawToken(tokenOperator, value);
        
    }


    function openForStake(uint256 _startPeriod, uint256 _submissionEndPeriod,  uint256 _approvalEndPeriod, uint256 _requestWithdrawStartPeriod, uint256 _endPeriod, uint256 _windowRewardAmount, uint256 _minStake, bool _openForExternal) public onlyOperator {

        // Check Input Parameters
        require(_startPeriod >= now && _startPeriod < _submissionEndPeriod && _submissionEndPeriod < _approvalEndPeriod && _approvalEndPeriod < _requestWithdrawStartPeriod && _requestWithdrawStartPeriod < _endPeriod, "Invalid stake period");
        require(_windowRewardAmount > 0 && _minStake > 0, "Invalid inputs" );

        // Check Stake in Progress
        require(currentStakeMapIndex == 0 || (now > stakeMap[currentStakeMapIndex].approvalEndPeriod && _startPeriod >= stakeMap[currentStakeMapIndex].requestWithdrawStartPeriod), "Cannot have more than one stake request at a time");

        // Check for max days to open to avoid the locking to open a new stake
        require(now > _approvalEndPeriod.sub(maxDaysToOpenInSecs), "Too futuristic");

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
        stakePeriod.minStake = _minStake;        
        stakePeriod.openForExternal = _openForExternal;

        stakeMap[currentStakeMapIndex] = stakePeriod;

        emit OpenForStake(currentStakeMapIndex, msg.sender, _startPeriod, _endPeriod, _approvalEndPeriod, _windowRewardAmount);

    }


    // To add the Stake Holder
    function _createStake(address staker, uint256 stakeAmount, bool autoRenewal) internal returns(bool) {

        StakeInfo storage stakeInfo = stakeHolderInfo[staker][currentStakeMapIndex];

        // Check if the user already staked in the past
        if(stakeInfo.exist) {

            stakeInfo.approvedAmount = stakeInfo.approvedAmount.add(stakeAmount);
            stakeInfo.autoRenewal = autoRenewal;

        } else {

            StakeInfo memory req;

            // Create a new stake request
            req.exist = true;
            req.autoRenewal = autoRenewal;
            req.approvedAmount = stakeAmount;

            // Add to the Stake Holders List
            stakeHolderInfo[staker][currentStakeMapIndex] = req;

            // Add to the Stake Holders List
            stakeMap[currentStakeMapIndex].stakeHolders.push(staker);

        }

        return true;

    }


    // To submit a new stake for the current window
    function submitStake(uint256 stakeAmount, bool autoRenewal) public allowSubmission validStakeLimit(msg.sender, stakeAmount) {

        // Transfer the Tokens to Contract
        require(token.transferFrom(msg.sender, address(this), stakeAmount), "Unable to transfer token to the contract");

        _createStake(msg.sender, stakeAmount, autoRenewal);

        // Update the User balance
        balances[msg.sender] = balances[msg.sender].add(stakeAmount);

        // Update current stake period total stake - For Auto Approvals
        stakeMap[currentStakeMapIndex].windowTotalStake = stakeMap[currentStakeMapIndex].windowTotalStake.add(stakeAmount); 
       
        emit SubmitStake(currentStakeMapIndex, msg.sender, stakeAmount, autoRenewal);

    }


    // To withdraw stake during submission phase
    function withdrawStake(uint256 stakeMapIndex, uint256 stakeAmount) public {

        require(
            (now >= stakeMap[stakeMapIndex].startPeriod && now <= stakeMap[stakeMapIndex].submissionEndPeriod),
            "Stake withdraw at this point is not allowed"
        );

        StakeInfo storage stakeInfo = stakeHolderInfo[msg.sender][stakeMapIndex];

        // Validate the input Stake Amount
        require(stakeAmount > 0 &&
        stakeInfo.approvedAmount >= stakeAmount,
        "Cannot withdraw beyond stake amount");

        // Allow withdaw not less than minStake or Full Amount
        require(
            stakeInfo.approvedAmount.sub(stakeAmount) >= stakeMap[stakeMapIndex].minStake || 
            stakeInfo.approvedAmount == stakeAmount,
            "Can withdraw full amount or partial amount maintaining min stake"
        );

        // Update the staker balance in the staking window
        stakeInfo.approvedAmount = stakeInfo.approvedAmount.sub(stakeAmount);

        // Update the User balance
        balances[msg.sender] = balances[msg.sender].sub(stakeAmount);

        // Update current stake period total stake - For Auto Approvals
        stakeMap[stakeMapIndex].windowTotalStake = stakeMap[stakeMapIndex].windowTotalStake.sub(stakeAmount); 

        // Return to User Wallet
        require(token.transfer(msg.sender, stakeAmount), "Unable to transfer token to the account");

        emit WithdrawStake(stakeMapIndex, msg.sender, stakeAmount);
    }


    // Reject the stake in the Current Window
    function rejectStake(uint256 stakeMapIndex, address staker) public onlyOperator {

        // Allow for rejection after approval period as well
        require(now > stakeMap[stakeMapIndex].submissionEndPeriod, "Rejection at this point is not allowed");

        StakeInfo storage stakeInfo = stakeHolderInfo[staker][stakeMapIndex];

        // In case of if there are auto renewals reject should not be allowed
        require(stakeInfo.approvedAmount > 0, "No staking request found");

        uint256 returnAmount;
        returnAmount = stakeInfo.approvedAmount;

        // transfer back the stake to user account
        require(token.transfer(staker, stakeInfo.approvedAmount), "Unable to transfer token back to the account");

        // Update the User Balance
        balances[staker] = balances[staker].sub(stakeInfo.approvedAmount);

        // Update current stake period total stake - For Auto Approvals
        stakeMap[stakeMapIndex].windowTotalStake = stakeMap[stakeMapIndex].windowTotalStake.sub(stakeInfo.approvedAmount);

        // Update the Pending Amount
        stakeInfo.approvedAmount = 0;

        emit RejectStake(stakeMapIndex, staker, msg.sender, returnAmount);

    }

    // To update the Auto Renewal flag
    function updateAutoRenewal(uint256 stakeMapIndex, bool autoRenewal) public canUpdateAutoRenewal(stakeMapIndex) {

        StakeInfo storage stakeInfo = stakeHolderInfo[msg.sender][stakeMapIndex];
        stakeInfo.autoRenewal = autoRenewal;

        emit UpdateAutoRenewal(stakeMapIndex, msg.sender, autoRenewal);

    }

    function _calculateRewardAmount(uint256 stakeMapIndex, uint256 stakeAmount) internal view returns(uint256) {

        uint256 calcRewardAmount;
        calcRewardAmount = stakeAmount.mul(stakeMap[stakeMapIndex].windowRewardAmount).div(stakeMap[stakeMapIndex].windowTotalStake);
        return calcRewardAmount;
    }

    // Update reward and renew the stake to next window
    function autoRenewStake(uint256 stakeMapIndex, address staker) 
    public 
    onlyOperator  
    allowAutoRenewStake(stakeMapIndex, staker) 
    {

        require(
            now > stakeMap[currentStakeMapIndex].approvalEndPeriod && 
            now < stakeMap[currentStakeMapIndex].requestWithdrawStartPeriod, 
            "Staking at this point not allowed"
        );

        StakeInfo storage oldStakeInfo = stakeHolderInfo[staker][stakeMapIndex];

        // Calculate the totalAmount
        uint256 totalAmount;
        uint256 rewardAmount;

        rewardAmount = _calculateRewardAmount(stakeMapIndex, oldStakeInfo.approvedAmount);
        totalAmount = oldStakeInfo.approvedAmount.add(rewardAmount);

        // Create a new stake in current staking period
        _createStake(staker, totalAmount, oldStakeInfo.autoRenewal);

        // Update current stake period total stake
        stakeMap[currentStakeMapIndex].windowTotalStake = stakeMap[currentStakeMapIndex].windowTotalStake.add(totalAmount);

        // Update the User Balance
        balances[staker] = balances[staker].add(rewardAmount);

        // Update the existsing Approved Amount
        oldStakeInfo.approvedAmount = 0;

        emit AutoRenewStake(currentStakeMapIndex, staker, stakeMapIndex, tokenOperator, totalAmount, rewardAmount);

    }    


    // To claim from the stake window
    function claimStake(uint256 stakeMapIndex) public allowClaimStake(stakeMapIndex) {

        StakeInfo storage stakeInfo = stakeHolderInfo[msg.sender][stakeMapIndex];

        // Calculate the totalAmount
        uint256 totalAmount;
        uint256 rewardAmount;

        rewardAmount = _calculateRewardAmount(stakeMapIndex, stakeInfo.approvedAmount);
        totalAmount = stakeInfo.approvedAmount.add(rewardAmount);

        // Check for balance in the contract
        require(token.balanceOf(address(this)) >= totalAmount, "Not enough balance in the contract");

        // Update the User Balance
        balances[msg.sender] = balances[msg.sender].sub(stakeInfo.approvedAmount);

        // Update the existing Stake Approved Amount
        stakeInfo.approvedAmount = 0;

        // Call the transfer function - Already handles balance check
        require(token.transfer(msg.sender, totalAmount), "Unable to transfer token back to the account");

        emit ClaimStake(stakeMapIndex, msg.sender, rewardAmount, totalAmount);

    }



    // Getter Functions    
    function getStakeHolders(uint256 stakeMapIndex) public view returns(address[] memory) {
        return stakeMap[stakeMapIndex].stakeHolders;
    }

    function getStakeInfo(uint256 stakeMapIndex, address staker) 
    public 
    view
    returns (bool found, uint256 approvedAmount, bool autoRenewal) 
    {

        StakeInfo storage stakeInfo = stakeHolderInfo[staker][stakeMapIndex];
        
        found = false;
        if(stakeInfo.exist) {
            found = true;
        }

        approvedAmount = stakeInfo.approvedAmount;
        autoRenewal = stakeInfo.autoRenewal;

    }


}