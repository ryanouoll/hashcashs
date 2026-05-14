// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EmailVault {
    // 記錄 Email Hash 對應的 ETH 餘額
    mapping(bytes32 => uint256) public balances;

    // 事件記錄 (Event)，方便前端監聽狀態變化
    event Deposited(bytes32 indexed emailHash, address indexed sender, uint256 amount);
    event Claimed(bytes32 indexed emailHash, address indexed receiver, uint256 amount);
    event Transferred(bytes32 indexed fromHash, bytes32 indexed toHash, address indexed caller, uint256 amount);

    /**
     * @dev 存入 ETH 到指定的 Email Hash
     * @param emailHash 接收者的 Email Hash (例如透過 keccak256 加密)
     */
    function deposit(bytes32 emailHash) public payable {
        require(msg.value > 0, "Deposit amount must be greater than 0");
        
        balances[emailHash] += msg.value;
        
        emit Deposited(emailHash, msg.sender, msg.value);
    }

    /**
     * @dev 提款函數 (警告：目前為期末專案測試版 缺乏權限驗證)
     * 實務上，這裡必須驗證 msg.sender 確實是該 Email 的擁有者 (例如透過 ZK-Email 證明或後端預言機簽章)。
     * 目前任何人只要知道 emailHash 就可以把錢領走。
     *
     * @param emailHash 要提款的 Email Hash
     * @param amount 提款金額 (Wei)
     */
    function claim(bytes32 emailHash, uint256 amount) public {
        require(balances[emailHash] >= amount, "Insufficient balance");

        // 遵循 Checks-Effects-Interactions 模式，先扣除餘額，再轉帳，防止重入攻擊 (Reentrancy)
        balances[emailHash] -= amount;

        // 執行轉帳給呼叫者 (msg.sender)
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit Claimed(emailHash, msg.sender, amount);
    }

    /**
     * @dev EmailHash -> EmailHash 轉帳（⚠️ 非安全版：沒有驗證 fromHash 擁有權）
     * 期末專案求先跑通：任何人只要知道 fromHash 就能轉走該餘額。
     */
    function transfer(bytes32 fromHash, bytes32 toHash, uint256 amount) public {
        require(amount > 0, "Amount must be greater than 0");
        require(balances[fromHash] >= amount, "Insufficient balance");

        balances[fromHash] -= amount;
        balances[toHash] += amount;

        emit Transferred(fromHash, toHash, msg.sender, amount);
    }
}