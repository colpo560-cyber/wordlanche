const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "MON");

  // Existing WRDLE token address
  const WRDLE_TOKEN = "0xa1d2c0ea74dc49588078D234B68d5Ca527f91c67";

  // Treasury address (where MON fees go) - using deployer for now
  const TREASURY = deployer.address;

  console.log("\n--- Deploying WordleRoyaleV3 ---");
  console.log("WRDLE Token:", WRDLE_TOKEN);
  console.log("Treasury:", TREASURY);

  const WordleRoyaleV3 = await hre.ethers.getContractFactory("WordleRoyaleV3");
  const game = await WordleRoyaleV3.deploy(WRDLE_TOKEN, TREASURY);
  await game.waitForDeployment();

  const gameAddress = await game.getAddress();
  console.log("WordleRoyaleV3 deployed to:", gameAddress);

  // Grant minter role to the new game contract on WRDLE token
  console.log("\n--- Granting Minter Role ---");
  const tokenAbi = [
    "function grantMinterRole(address minter) external",
    "function MINTER_ROLE() view returns (bytes32)",
    "function hasRole(bytes32 role, address account) view returns (bool)"
  ];
  const token = new hre.ethers.Contract(WRDLE_TOKEN, tokenAbi, deployer);

  try {
    const tx = await token.grantMinterRole(gameAddress);
    await tx.wait();
    console.log("Minter role granted to:", gameAddress);
  } catch (e) {
    console.log("Note: Could not grant minter role -", e.message);
    console.log("You may need to manually call grantMinterRole on the token contract");
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                    DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("WordleRoyaleV3:", gameAddress);
  console.log("WRDLE Token:   ", WRDLE_TOKEN);
  console.log("Treasury:      ", TREASURY);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("\nNew Model:");
  console.log("- Players pay MON fee to play");
  console.log("- MON fees go to treasury");
  console.log("- Winners receive WRDLE tokens (100x fee multiplier)");
  console.log("- Example: 1 MON fee = 100 WRDLE prize");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
