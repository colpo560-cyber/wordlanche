import { http, createConfig } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'

// WalletConnect Project ID - Get yours at https://cloud.walletconnect.com/
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID_HERE'

// Define Avalanche Fuji Testnet chain
export const avalancheFuji = {
  id: 43113,
  name: 'Avalanche Fuji',
  nativeCurrency: {
    decimals: 18,
    name: 'AVAX',
    symbol: 'AVAX',
  },
  rpcUrls: {
    default: { http: ['https://api.avax-test.network/ext/bc/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Snowtrace', url: 'https://testnet.snowtrace.io' },
  },
  testnet: true,
} as const

export const config = createConfig({
  chains: [avalancheFuji],
  connectors: [
    // Injected connector for desktop browser wallets (MetaMask, Rabby, etc.)
    injected({
      shimDisconnect: false,
    }),
    // WalletConnect v2 for mobile wallets
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: 'Wordlanche - Wordle on Avalanche',
        description: 'Play Wordle on Avalanche blockchain',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://wordlanche.app',
        icons: [typeof window !== 'undefined' ? `${window.location.origin}/wordlanche-icon.svg` : 'https://wordlanche.app/wordlanche-icon.svg'],
      },
      showQrModal: false, // We handle deep linking ourselves
    }),
  ],
  transports: {
    [avalancheFuji.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
