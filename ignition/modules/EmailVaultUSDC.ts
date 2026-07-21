import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Base Sepolia Circle USDC (testnet)
const DEFAULT_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/**
 * Deploy params (override via --parameters):
 *   usdc         : USDC token address
 *   bindSigner   : backend attestor EOA (authorizes email->owner bindings only)
 *   feeVaultHash : emailHash credited with withdrawal fees (operator's email)
 */
export default buildModule("EmailVaultUSDC", (m) => {
  const usdc = m.getParameter("usdc", DEFAULT_USDC);
  const bindSigner = m.getParameter<string>("bindSigner");
  const feeVaultHash = m.getParameter<string>("feeVaultHash");

  const vault = m.contract("EmailVaultUSDC", [usdc, bindSigner, feeVaultHash]);

  return { vault };
});
