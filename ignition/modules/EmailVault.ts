import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const EmailVaultModule = buildModule("EmailVaultModule", (m) => {
  // 告訴 Hardhat 我們要部署 EmailVault 這個合約
  const emailVault = m.contract("EmailVault");

  return { emailVault };
});

export default EmailVaultModule;