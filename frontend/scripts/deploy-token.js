const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying WordleToken (WRDL) with:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "AVAX");

  console.log("\n--- Deploying Wordlanche Token ---");

  const WordleToken = await hre.ethers.getContractFactory("WordleToken");
  const token = await WordleToken.deploy();
  await token.waitForDeployment();

  const tokenAddress = await token.getAddress();
  console.log("\n===============================================");
  console.log("  Wordlanche Token (WRDL) deployed to:", tokenAddress);
  console.log("  Owner:", deployer.address);
  console.log("  Initial supply: 10,000,000 WRDL");
  console.log("===============================================");
  console.log("\nNext step: Deploy WordleRoyaleFree with:");
  console.log(`  WRDL_TOKEN_ADDRESS=${tokenAddress} npx hardhat run scripts/deploy-free.js --network avalancheFuji`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
