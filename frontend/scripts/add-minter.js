const hre = require("hardhat");

async function main() {
  const V3_ADDRESS = "0x17CDc6b6B5348c2D955EbAa60027F8Cf2F2cb1c1";
  const TOKEN_ADDRESS = "0xa1d2c0ea74dc49588078D234B68d5Ca527f91c67";

  const token = await hre.ethers.getContractAt("WordleToken", TOKEN_ADDRESS);

  console.log("Adding minter role to V3...");
  const tx = await token.addMinter(V3_ADDRESS);
  await tx.wait();

  console.log("Minter role granted!");

  const isMinter = await token.minters(V3_ADDRESS);
  console.log("V3 is minter:", isMinter);
}

main().catch(console.error);
