import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpFromLine,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Modal, Button } from '../ui';
import { useWithdraw } from '../../hooks/useWithdraw';
import { useWalletStore } from '../../store/wallet.store';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: string;
}

const NETWORK_FEE = '0.05'; // Estimated network fee in TON

export function WithdrawModal({ isOpen, onClose, balance }: WithdrawModalProps) {
  const [amount, setAmount] = useState('');
  const { createWithdrawal, error, reset } = useWithdraw();
  const { withdrawStatus, walletAddress } = useWalletStore();
  const { hapticFeedback, hapticNotification } = useTelegram();
  const { t } = useTranslation();

  const numBalance = parseFloat(balance) || 0;
  const numAmount = parseFloat(amount) || 0;
  const maxWithdraw = Math.max(0, numBalance - parseFloat(NETWORK_FEE));

  const validationError = (() => {
    if (!amount) return null;
    if (numAmount < 0.5) return t.wallet.minWithdraw + ': 0.5 TON';
    if (numAmount > numBalance) return t.wallet.insufficientBalance;
    if (numAmount + parseFloat(NETWORK_FEE) > numBalance) return t.wallet.insufficientForFee;
    return null;
  })();

  const handleWithdraw = async () => {
    if (!amount || validationError) return;
    hapticFeedback?.('medium');

    try {
      await createWithdrawal(amount);
      hapticNotification?.('success');
    } catch {
      hapticNotification?.('error');
    }
  };

  const handleClose = () => {
    reset();
    setAmount('');
    onClose();
  };

  const handleSetMax = () => {
    if (maxWithdraw > 0) {
      setAmount(maxWithdraw.toFixed(2));
      hapticFeedback?.('light');
    }
  };

  const renderContent = () => {
    // Status screens
    if (withdrawStatus === 'pending' || withdrawStatus === 'processing') {
      return (
        <div className="text-center py-6">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
            className="w-16 h-16 mx-auto mb-4 rounded-full bg-tg-warning/10 flex items-center justify-center"
          >
            <Clock size={32} className="text-tg-warning" />
          </motion.div>
          <h3 className="text-lg font-semibold text-tg-text mb-2">
            {t.wallet.withdrawProcessing}
          </h3>
          <p className="text-sm text-tg-text-secondary mb-4">
            {t.wallet.withdrawWait}
          </p>
          <Loader2 size={20} className="animate-spin mx-auto text-tg-text-secondary" />
        </div>
      );
    }

    if (withdrawStatus === 'completed' || withdrawStatus === 'sent') {
      return (
        <div className="text-center py-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-tg-success/10 flex items-center justify-center">
            <CheckCircle size={32} className="text-tg-success" />
          </div>
          <h3 className="text-lg font-semibold text-tg-text mb-2">
            {t.wallet.withdrawCompleted}
          </h3>
          <p className="text-sm text-tg-text-secondary mb-4">
            {amount} TON {t.wallet.sentToWallet}
          </p>
          <Button variant="primary" fullWidth onClick={handleClose}>
            {t.wallet.done}
          </Button>
        </div>
      );
    }

    if (withdrawStatus === 'failed') {
      return (
        <div className="text-center py-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-tg-error/10 flex items-center justify-center">
            <XCircle size={32} className="text-tg-error" />
          </div>
          <h3 className="text-lg font-semibold text-tg-text mb-2">
            {t.wallet.withdrawFailed}
          </h3>
          <p className="text-sm text-tg-text-secondary mb-4">
            {error || t.wallet.withdrawError}
          </p>
          <Button variant="primary" fullWidth onClick={() => { reset(); setAmount(''); }}>
            {t.common.retry}
          </Button>
        </div>
      );
    }

    // Input screen
    return (
      <div className="space-y-4">
        {/* Wallet address (auto-filled) */}
        {walletAddress && (
          <div className="p-3 rounded-tg bg-tg-bg-secondary">
            <p className="text-xs text-tg-text-secondary mb-1">{t.wallet.withdrawTo}</p>
            <p className="text-sm font-mono text-tg-text break-all">
              {walletAddress.slice(0, 12)}...{walletAddress.slice(-12)}
            </p>
          </div>
        )}

        {/* Balance */}
        <div className="flex items-center justify-between p-3 rounded-tg bg-tg-bg-secondary">
          <span className="text-sm text-tg-text-secondary">{t.wallet.availableBalance}</span>
          <span className="text-sm font-semibold text-tg-text">{balance} TON</span>
        </div>

        {/* Amount input */}
        <div>
          <label className="text-sm font-medium text-tg-text-secondary mb-2 block">
            {t.wallet.withdrawAmount}
          </label>
          <div className="relative">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tg-input text-lg pr-24"
              min="0.5"
              step="0.1"
            />
            <button
              onClick={handleSetMax}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg bg-tg-link/10 text-tg-link text-xs font-medium"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Fee info */}
        <div className="flex items-center gap-2 text-xs text-tg-text-secondary">
          <AlertTriangle size={12} />
          <span>{t.wallet.networkFee}: ~{NETWORK_FEE} TON</span>
        </div>

        {/* Validation error */}
        {validationError && (
          <p className="text-sm text-tg-error bg-tg-error/10 rounded-tg p-3">
            {validationError}
          </p>
        )}

        {/* API error */}
        {error && (
          <p className="text-sm text-tg-error bg-tg-error/10 rounded-tg p-3">
            {error}
          </p>
        )}

        <Button
          variant="primary"
          fullWidth
          disabled={!amount || !!validationError || numAmount <= 0}
          onClick={handleWithdraw}
        >
          <ArrowUpFromLine size={18} />
          {t.wallet.withdrawButton} {amount ? `${amount} TON` : ''}
        </Button>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t.profile.withdraw}>
      {renderContent()}
    </Modal>
  );
}
