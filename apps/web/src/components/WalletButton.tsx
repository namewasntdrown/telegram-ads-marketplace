import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { motion } from 'framer-motion';
import {
  Wallet,
  Zap,
  Link2,
  CheckCircle,
  LogOut,
} from 'lucide-react';
import { Button } from './ui';
import { useWalletStore } from '../store/wallet.store';
import { useWalletConnect } from '../hooks/useWalletConnect';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

interface WalletButtonProps {
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

export function WalletButton({ onDeposit, onWithdraw }: WalletButtonProps) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const { walletAddress, isConnected } = useWalletStore();
  const { disconnect } = useWalletConnect();
  const { hapticFeedback } = useTelegram();
  const { t } = useTranslation();

  const handleConnect = () => {
    hapticFeedback?.('medium');
    tonConnectUI.openModal();
  };

  const handleDisconnect = async () => {
    hapticFeedback?.('medium');
    await disconnect();
  };

  const displayAddress = walletAddress || wallet?.account?.address;
  const shortAddress = displayAddress
    ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-6)}`
    : '';

  if (!wallet || !isConnected) {
    return (
      <div className="tg-card-bordered border-dashed">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-11 h-11 rounded-tg bg-tg-link/10 flex items-center justify-center">
            <Zap size={22} className="text-tg-link" />
          </div>
          <div>
            <h3 className="font-semibold text-tg-text">
              {t.profile.connectWallet}
            </h3>
            <p className="text-sm text-tg-text-secondary">
              {t.profile.linkWallet}
            </p>
          </div>
        </div>
        <Button onClick={handleConnect} variant="primary" fullWidth>
          {t.profile.connectTonWallet}
        </Button>
      </div>
    );
  }

  return (
    <div className="tg-card">
      {/* Connected status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-tg bg-tg-success/10 flex items-center justify-center">
            <Link2 size={18} className="text-tg-success" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-tg-success" />
              <p className="font-medium text-tg-success">
                {t.profile.connected}
              </p>
            </div>
            <p className="text-xs text-tg-text-secondary font-mono">
              {shortAddress}
            </p>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleDisconnect}
          className="p-2 rounded-tg bg-tg-error/10 text-tg-error"
          title={t.profile.disconnectWallet}
        >
          <LogOut size={16} />
        </motion.button>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        {onDeposit && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              hapticFeedback?.('light');
              onDeposit();
            }}
          >
            <Wallet size={16} />
            {t.profile.deposit}
          </Button>
        )}
        {onWithdraw && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              hapticFeedback?.('light');
              onWithdraw();
            }}
          >
            <Wallet size={16} />
            {t.profile.withdraw}
          </Button>
        )}
      </div>
    </div>
  );
}
