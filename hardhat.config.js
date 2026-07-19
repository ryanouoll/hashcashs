require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Base (and Base Sepolia) are post-Dencun; OZ v5 uses the mcopy opcode.
      evmVersion: "cancun",
    },
  },
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: (() => {
        const pk = (process.env.DEPLOYER_PRIVATE_KEY || "").trim();
        if (!pk) return [];
        return [pk.startsWith("0x") ? pk : `0x${pk}`];
      })(),
      chainId: 84532,
    },
  },
  // Etherscan V2:單一 key 吃所有鏈(舊的 per-network 格式會打到已棄用的 V1 端點)
  etherscan: {
    apiKey: process.env.BASESCAN_API_KEY || "",
  },
};