const hre = require("hardhat");

async function main() {
  const signers = await hre.ethers.getSigners();
  if (!signers || signers.length === 0) {
    throw new Error(
      [
        "找不到可用的部署者帳號（Hardhat 沒有拿到私鑰，所以無法送交易）。",
        "請檢查 c:\\cfoingio\\.env 的 DEPLOYER_PRIVATE_KEY 是否已填入，且格式為 0x 開頭。",
        "例如：DEPLOYER_PRIVATE_KEY=0xabc123...",
      ].join("\n")
    );
  }

  const deployer = signers[0];
  console.log("Deployer:", await deployer.getAddress());

  const EmailVault = await hre.ethers.getContractFactory("EmailVault");
  const emailVault = await EmailVault.deploy();

  await emailVault.waitForDeployment();
  const address = await emailVault.getAddress();

  console.log("EmailVault deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

