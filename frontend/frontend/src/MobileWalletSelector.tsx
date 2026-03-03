import { MOBILE_WALLETS, type WalletDeepLink } from './walletDeepLinks';

interface MobileWalletSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectWallet: (walletId: string) => void;
  wallets?: WalletDeepLink[];
}

export const MobileWalletSelector = ({
  isOpen,
  onClose,
  onSelectWallet,
  wallets = MOBILE_WALLETS,
}: MobileWalletSelectorProps) => {
  if (!isOpen) return null;

  return (
    <div className="mobile-wallet-overlay" onClick={onClose}>
      <div className="mobile-wallet-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-wallet-header">
          <h3>Choose Your Wallet</h3>
          <button className="mobile-wallet-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <p className="mobile-wallet-subtitle">Select the wallet app installed on your device</p>

        <div className="mobile-wallet-grid">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              className="mobile-wallet-option"
              onClick={() => {
                onSelectWallet(wallet.id);
                onClose();
              }}
            >
              {wallet.logo && (
                <img
                  src={wallet.logo}
                  alt={wallet.name}
                  className="mobile-wallet-logo"
                />
              )}
              <span className="mobile-wallet-name">{wallet.name}</span>
            </button>
          ))}
        </div>

        <p className="mobile-wallet-footer">
          Don't have a wallet?{' '}
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get MetaMask
          </a>
        </p>
      </div>
    </div>
  );
};
