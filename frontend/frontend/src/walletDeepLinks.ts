/**
 * Mobile Wallet Deep Links
 *
 * Utility to open mobile wallet apps directly via deep links
 * instead of showing QR codes. Improves UX on mobile.
 */

export interface WalletDeepLink {
  id: string;
  name: string;
  deepLink: (uri: string) => string;
  logo?: string;
  isLikelyInstalled?: () => boolean;
}

/**
 * List of supported mobile wallets with their deep links
 */
export const MOBILE_WALLETS: WalletDeepLink[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/MetaMask_Fox.svg/512px-MetaMask_Fox.svg.png',
    deepLink: (uri: string) => {
      // MetaMask mobile deep link format
      return `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;
    },
  },
  {
    id: 'binance',
    name: 'Binance',
    logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
    deepLink: (uri: string) => {
      // Binance wallet deep link format
      return `https://app.binance.com/wc?uri=${encodeURIComponent(uri)}`;
    },
  },
  {
    id: 'rabby',
    name: 'Rabby',
    logo: 'https://raw.githubusercontent.com/RabbyHub/Rabby/develop/src/ui/assets/dashboard/rabby.svg',
    deepLink: (uri: string) => {
      // Rabby mobile deep link format
      return `https://rabby.io/wc?uri=${encodeURIComponent(uri)}`;
    },
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    logo: 'https://avatars.githubusercontent.com/u/32179889?s=200&v=4',
    deepLink: (uri: string) => {
      // Trust Wallet deep link format
      return `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`;
    },
  },
  {
    id: 'phantom',
    name: 'Phantom',
    logo: 'https://avatars.githubusercontent.com/u/78782331?s=200&v=4',
    deepLink: (uri: string) => {
      // Phantom wallet deep link format (supports multi-chain including EVM)
      return `https://phantom.app/ul/v1/browse/${encodeURIComponent(`wc:${uri}`)}?cluster=mainnet-beta`;
    },
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    logo: 'https://avatars.githubusercontent.com/u/48327834?s=200&v=4',
    deepLink: (uri: string) => {
      // Rainbow wallet deep link format
      return `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`;
    },
  },
  {
    id: 'tokenpocket',
    name: 'TokenPocket',
    logo: '/icons/wallets/token_pocket.svg',
    deepLink: (uri: string) => {
      // TokenPocket deep link format
      return `tpoutside://wc?uri=${encodeURIComponent(uri)}`;
    },
  },
  {
    id: 'safepal',
    name: 'SafePal',
    logo: '/icons/wallets/safepal.svg',
    deepLink: (uri: string) => {
      // SafePal deep link format
      return `safepalwallet://wc?uri=${encodeURIComponent(uri)}`;
    },
  },
];

/**
 * Detect if device is mobile
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Get mobile OS
 */
export function getMobileOS(): 'ios' | 'android' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';

  const userAgent = navigator.userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'ios';
  }

  if (/android/.test(userAgent)) {
    return 'android';
  }

  return 'unknown';
}

/**
 * Open wallet via deep link
 */
export function openWalletDeepLink(walletId: string, wcUri: string): boolean {
  console.log(`🔍 openWalletDeepLink called with walletId: "${walletId}"`);
  console.log(`🔍 WC URI received:`, wcUri);

  const wallet = MOBILE_WALLETS.find(w => w.id === walletId);

  if (!wallet) {
    console.error(`❌ Wallet ${walletId} not found in supported wallets list`);
    console.log(`📋 Available wallets:`, MOBILE_WALLETS.map(w => w.id));
    return false;
  }

  console.log(`✅ Wallet found: ${wallet.name}`);

  try {
    const deepLinkUrl = wallet.deepLink(wcUri);
    console.log(`🔗 Deep link generated for ${wallet.name}:`, deepLinkUrl);
    console.log(`📏 Deep link length: ${deepLinkUrl.length} characters`);

    // Open deep link in new window/tab
    console.log(`🚀 Calling window.open with deep link...`);
    const openedWindow = window.open(deepLinkUrl, '_blank');
    console.log(`📱 window.open returned:`, openedWindow ? 'Window object' : 'null');

    if (!openedWindow) {
      console.warn(`⚠️ window.open returned null - possible popup blocker`);
    }

    return true;
  } catch (error) {
    console.error(`❌ Error opening deep link for ${wallet.name}:`, error);
    return false;
  }
}

/**
 * Get popular mobile wallets list
 */
export function getPopularMobileWallets(): WalletDeepLink[] {
  const popularOrder = ['metamask', 'binance', 'rabby', 'trust', 'phantom', 'rainbow', 'tokenpocket', 'safepal'];

  return popularOrder
    .map(id => MOBILE_WALLETS.find(w => w.id === id))
    .filter((w): w is WalletDeepLink => w !== undefined);
}

/**
 * Get preferred mobile wallet from localStorage
 */
export function getPreferredMobileWallet(): WalletDeepLink | null {
  if (typeof window === 'undefined') return null;

  // 1. Check for saved preference
  const savedPreference = localStorage.getItem('preferredMobileWallet');
  if (savedPreference) {
    const wallet = MOBILE_WALLETS.find(w => w.id === savedPreference);
    if (wallet) {
      console.log(`📱 Preferred wallet found in localStorage: ${wallet.name}`);
      return wallet;
    }
  }

  // 2. Detection based on user agent (some wallets modify the user agent)
  const userAgent = navigator.userAgent.toLowerCase();

  if (userAgent.includes('metamask')) {
    return MOBILE_WALLETS.find(w => w.id === 'metamask') || null;
  }

  if (userAgent.includes('rabby')) {
    return MOBILE_WALLETS.find(w => w.id === 'rabby') || null;
  }

  if (userAgent.includes('phantom')) {
    return MOBILE_WALLETS.find(w => w.id === 'phantom') || null;
  }

  if (userAgent.includes('trustwallet') || userAgent.includes('trust')) {
    return MOBILE_WALLETS.find(w => w.id === 'trust') || null;
  }

  if (userAgent.includes('tokenpocket')) {
    return MOBILE_WALLETS.find(w => w.id === 'tokenpocket') || null;
  }

  // 3. Default: null (show selection list)
  return null;
}

/**
 * Save preferred wallet for future connections
 */
export function savePreferredMobileWallet(walletId: string): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('preferredMobileWallet', walletId);
    console.log(`💾 Preferred wallet saved: ${walletId}`);
  } catch (error) {
    console.warn('⚠️ Could not save wallet preference:', error);
  }
}

/**
 * Clear preferred wallet
 */
export function clearPreferredMobileWallet(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem('preferredMobileWallet');
    console.log(`🗑️ Preferred wallet cleared`);
  } catch (error) {
    console.warn('⚠️ Could not clear wallet preference:', error);
  }
}

/**
 * Helper to format WalletConnect URI if needed
 */
export function formatWalletConnectUri(uri: string): string {
  // Remove any "wc:" prefix if already present
  return uri.replace(/^wc:/, '');
}
