import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownToLine,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Check,
} from 'lucide-react';
import { Modal, Button } from '../ui';
import { useDeposit } from '../../hooks/useDeposit';
import { useWalletStore } from '../../store/wallet.store';
import { useTelegram } from '../../hooks/useTelegram';
import { useTranslation } from '../../i18n';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_AMOUNTS = ['1', '5', '10', '50', '100'];

export function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const [amount, setAmount] = useState('');
  const [copied, setCopied] = useState(false);
  const { createDeposit, depositInfo, error, reset } = useDeposit();
  const { depositStatus } = useWalletStore();
  const { hapticFeedback, hapticNotification } = useTelegram();
  const { t } = useTranslation();

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) < 1) return;
    hapticFeedback?.('medium');

    try {
      await createDeposit(amount);
      hapticNotification?.('success');
    } catch {
      hapticNotification?.('error');
    }
  };

  const handleClose = () => {
    reset();
    setAmount('');
    setCopied(false);
    onClose();
  };

  const handleCopyMemo = () => {
    if (depositInfo?.memo) {
      navigator.clipboard.writeText(depositInfo.memo);
      setCopied(true);
      hapticFeedback?.('light');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderContent = () => {
    // Show status screen
    if (depositStatus === 'confirming' || depositStatus === 'completed' || depositStatus === 'failed') {
      return (
        <div className="text-center py-6">
          {depositStatus === 'confirming' && (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                className="w-16 h-16 mx-auto mb-4 rounded-full bg-tg-warning/10 flex items-center justify-center"
              >
                <Clock size={32} className="text-tg-warning" />
              </motion.div>
              <h3 className="text-lg font-semibold text-tg-text mb-2">
                {t.wallet.awaitingConfirmation}
              </h3>
              <p className="text-sm text-tg-text-secondary mb-4">
                {t.wallet.depositSent}
              </p>
              <Loader2 size={20} className="animate-spin mx-auto text-tg-text-secondary" />
            </>
          )}

          {depositStatus === 'completed' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-tg-success/10 flex items-center justify-center">
                <CheckCircle size={32} className="text-tg-success" />
              </div>
              <h3 className="text-lg font-semibold text-tg-text mb-2">
                {t.wallet.depositCompleted}
              </h3>
              <p className="text-sm text-tg-text-secondary mb-4">
                {amount} TON {t.wallet.credited}
              </p>
              <Button variant="primary" fullWidth onClick={handleClose}>
                {t.wallet.done}
              </Button>
            </>
          )}

          {depositStatus === 'failed' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-tg-error/10 flex items-center justify-center">
                <XCircle size={32} className="text-tg-error" />
              </div>
              <h3 className="text-lg font-semibold text-tg-text mb-2">
                {t.wallet.depositFailed}
              </h3>
              <p className="text-sm text-tg-text-secondary mb-4">
                {error || t.wallet.depositExpired}
              </p>
              <Button variant="primary" fullWidth onClick={() => { reset(); setAmount(''); }}>
                {t.common.retry}
              </Button>
            </>
          )}
        </div>
      );
    }

    // Show awaiting transaction screen
    if (depositStatus === 'awaiting_tx' && depositInfo) {
      return (
        <div className="space-y-4">
          <div className="text-center">
            <Loader2 size={24} className="animate-spin mx-auto text-tg-link mb-2" />
            <p className="text-sm text-tg-text-secondary">
              {t.wallet.confirmInWallet}
            </p>
          </div>

          {depositInfo.memo && (
            <div className="p-3 rounded-tg bg-tg-bg-secondary">
              <p className="text-xs text-tg-text-secondary mb-1">Memo</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono text-tg-text flex-1 break-all">
                  {depositInfo.memo}
                </code>
                <button onClick={handleCopyMemo} className="p-1.5 rounded-lg bg-tg-bg hover:bg-tg-bg-secondary">
                  {copied ? <Check size={14} className="text-tg-success" /> : <Copy size={14} className="text-tg-text-secondary" />}
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Show amount input screen
    return (
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-tg-text-secondary mb-2 block">
            {t.wallet.depositAmount}
          </label>
          <div className="relative">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tg-input text-lg pr-14"
              min="1"
              step="0.1"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-tg-text-secondary font-medium">
              TON
            </span>
          </div>
        </div>

        {/* Quick amount buttons */}
        <div className="flex gap-2 flex-wrap">
          {QUICK_AMOUNTS.map((qa) => (
            <motion.button
              key={qa}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setAmount(qa);
                hapticFeedback?.('light');
              }}
              className={`px-3 py-1.5 rounded-tg text-sm font-medium transition-colors ${
                amount === qa
                  ? 'bg-tg-link text-white'
                  : 'bg-tg-bg-secondary text-tg-text-secondary hover:text-tg-text'
              }`}
            >
              {qa} TON
            </motion.button>
          ))}
        </div>

        {/* Min deposit info */}
        <p className="text-xs text-tg-text-secondary">
          {t.wallet.minDeposit}: 1 TON
        </p>

        {error && (
          <p className="text-sm text-tg-error bg-tg-error/10 rounded-tg p-3">
            {error}
          </p>
        )}

        <Button
          variant="primary"
          fullWidth
          disabled={!amount || parseFloat(amount) < 1}
          onClick={handleDeposit}
        >
          <ArrowDownToLine size={18} />
          {t.wallet.depositVia} TonConnect
        </Button>
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t.profile.deposit}>
      {renderContent()}
    </Modal>
  );
}
