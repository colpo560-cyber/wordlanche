const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "AVAX");

  // WRDL token address - set after deploying WordleToken
  const WRDLE_TOKEN = process.env.WRDL_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000";

  // Owner address (who can update prizes and emergency withdraw)
  const OWNER = deployer.address;

  console.log("\n--- Deploying WordleRoyaleFree ---");
  console.log("WRDL Token:", WRDLE_TOKEN);
  console.log("Owner:", OWNER);

  const WordleRoyaleFree = await hre.ethers.getContractFactory("WordleRoyaleFree");
  const game = await WordleRoyaleFree.deploy(WRDLE_TOKEN, OWNER);
  await game.waitForDeployment();

  const gameAddress = await game.getAddress();
  console.log("WordleRoyaleFree deployed to:", gameAddress);

  // Check if we need to fund the prize pool
  console.log("\n--- Prize Pool Info ---");
  const prizePool = await game.getPrizePool();
  console.log("Current prize pool:", hre.ethers.formatEther(prizePool), "WRDL");

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                    DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("WordleRoyaleFree:", gameAddress);
  console.log("WRDL Token:   ", WRDLE_TOKEN);
  console.log("Owner:           ", OWNER);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\nFree-to-Play Model:");
  console.log("- Players join for FREE (no entry fee)");
  console.log("- Winners receive WRDLE tokens from prize pool");
  console.log("- Base prize: 10 WRDL per win");
  console.log("- Perfect game (1 guess): +100 WRDL bonus");
  console.log("- First win ever: +50 WRDL bonus");
  console.log("- Milestone bonuses: 10/50/100 wins");
  console.log("- Streak multipliers: up to 3x");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\n⚠️  IMPORTANT: Fund the prize pool!");
  console.log("Call fundPrizePool(amount) or transfer WRDL tokens to:", gameAddress);
  console.log("\nExample with 10,000 WRDL:");
  console.log(`npx hardhat run --network avalancheFuji scripts/fund-prize-pool.js`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
