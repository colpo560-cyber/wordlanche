const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Funding prize pool with:", deployer.address);

  // Contract addresses (Avalanche Fuji)
  const GAME_ADDRESS = "0xEaA8E77E6C53fec28D60EEb64533a001b8F413b1";
  const WRDL_TOKEN = "0xd58541a8127d6aF892a502E91a38A941B536Ea80";

  // Amount to fund (100,000 WRDL)
  const FUND_AMOUNT = hre.ethers.parseEther("100000");

  // Get token contract
  const token = await hre.ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)",
     "function approve(address, uint256) returns (bool)",
     "function allowance(address, address) view returns (uint256)"],
    WRDL_TOKEN
  );

  // Get game contract
  const game = await hre.ethers.getContractAt(
    ["function fundPrizePool(uint256)", "function getPrizePool() view returns (uint256)"],
    GAME_ADDRESS
  );

  // Check current balance
  const balance = await token.balanceOf(deployer.address);
  console.log("Your WRDL balance:", hre.ethers.formatEther(balance), "WRDL");

  if (balance < FUND_AMOUNT) {
    console.log("Insufficient WRDL balance. Need", hre.ethers.formatEther(FUND_AMOUNT), "WRDL");
    return;
  }

  // Check current prize pool
  const currentPool = await game.getPrizePool();
  console.log("Current prize pool:", hre.ethers.formatEther(currentPool), "WRDL");

  // Approve spending
  console.log("\nApproving WRDL spending...");
  const approveTx = await token.approve(GAME_ADDRESS, FUND_AMOUNT);
  await approveTx.wait();
  console.log("Approved!");

  // Fund prize pool
  console.log("Funding prize pool with", hre.ethers.formatEther(FUND_AMOUNT), "WRDL...");
  const fundTx = await game.fundPrizePool(FUND_AMOUNT);
  await fundTx.wait();
  console.log("Funded!");

  // Check new prize pool
  const newPool = await game.getPrizePool();
  console.log("\nNew prize pool:", hre.ethers.formatEther(newPool), "WRDL");
  console.log("Successfully funded the prize pool!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
