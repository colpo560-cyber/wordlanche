# Wordlanche

On-chain Wordle game on Avalanche Fuji. Guess a 5-letter word in 6 tries, earn WRDL tokens.

## Stack

- **Frontend:** React 19 + TypeScript + Vite + wagmi v2
- **Backend:** Node.js + Express + ethers.js v6
- **Contracts:** Solidity 0.8.28 + Hardhat + OpenZeppelin v5
- **Chain:** Avalanche Fuji Testnet (43113)

## Contracts (Fuji)

| Contract | Address |
|----------|---------|
| WRDL Token | `0xd58541a8127d6aF892a502E91a38A941B536Ea80` |
| WordleRoyaleFree | `0xEaA8E77E6C53fec28D60EEb64533a001b8F413b1` |

## Project Structure

```
├── backend/              # Express API server
│   ├── server.js         # Game logic, EIP-712 signing, sessions
│   └── .env.example      # Environment template
├── frontend/
│   ├── contracts/        # Solidity contracts
│   ├── scripts/          # Hardhat deploy & fund scripts
│   ├── hardhat.config.js
│   └── frontend/         # React + Vite app
│       ├── src/
│       │   ├── App.tsx   # Main game component
│       │   ├── wagmi.ts  # Chain & wallet config
│       │   ├── abi.ts    # Contract ABIs & addresses
│       │   └── api.ts    # Backend API client
│       └── public/       # Static assets
```

## Setup

### Prerequisites

- Node.js 18+
- MetaMask (or any EVM wallet)
- Test AVAX from [Avalanche Faucet](https://faucet.avax.network/)

### Install

```bash
cd frontend && npm install
cd frontend && npm install
cd ../backend && npm install
```

### Configure

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your `RESOLVER_PRIVATE_KEY`.

### Run

```bash
# Terminal 1 - Backend
cd backend && node server.js

# Terminal 2 - Frontend
cd frontend/frontend && npx vite --host
```

Open http://localhost:5173

### Deploy Contracts

```bash
cd frontend

# 1. Deploy WRDL token
npx hardhat run scripts/deploy-token.js --network avalancheFuji

# 2. Deploy game contract
WRDL_TOKEN_ADDRESS=0x... npx hardhat run scripts/deploy-free.js --network avalancheFuji

# 3. Fund prize pool
npx hardhat run scripts/fund-prize-pool.js --network avalancheFuji
```

Update addresses in `frontend/frontend/src/abi.ts` and `backend/.env` after deploy.

## License

MIT
