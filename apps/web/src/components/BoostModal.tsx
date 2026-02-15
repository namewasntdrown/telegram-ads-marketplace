import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { api } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';
import { Zap, PenLine } from 'lucide-react';
import { useTranslation } from '../i18n';

interface BoostModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'channel' | 'folder';
  itemId: string;
  itemTitle: string;
  userBalance?: string;
}

const dayOptions = [1, 3, 7, 14, 30];
const amountOptions = ['1', '2', '5', '10', '20'];

export function BoostModal({
  isOpen,
  onClose,
  type,
  itemId,
  itemTitle,
  userBalance = '0',
}: BoostModalProps) {
  const [days, setDays] = useState(7);
  const [amountPerDay, setAmountPerDay] = useState('1');
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const effectiveAmount = isCustom ? customAmount : amountPerDay;

  const totalCost = useMemo(() => {
    const amount = parseFloat(effectiveAmount) || 0;
    return (amount * days).toFixed(2);
  }, [days, effectiveAmount]);

  const hasEnoughBalance = parseFloat(userBalance) >= parseFloat(totalCost);

  const boostMutation = useMutation({
    mutationFn: async () => {
      const endpoint = type === 'channel'
        ? `/channels/${itemId}/boost`
        : `/folders/${itemId}/boost`;
      const response = await api.post(endpoint, {
        days,
        amountPerDay: effectiveAmount,
      });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: [type === 'channel' ? 'channels' : 'folders'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      onClose();
    },
    onError: (err: Error) => {
      hapticNotification?.('error');
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amount = parseFloat(effectiveAmount);
    if (isCustom && (!amount || amount < 1)) {
      setError(t.modals.boost.minAmount);
      return;
    }

    if (!hasEnoughBalance) {
      setError(t.modals.boost.insufficientBalance);
      return;
    }

    boostMutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.modals.boost.title}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Paid Feature Notice */}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <span className="text-amber-400 text-lg">{t.modals.boost.paidFeature}</span>
          <span className="text-sm text-amber-300/80">
            {t.modals.boost.paidDescription}
          </span>
        </div>

        {/* Item Info */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <Zap className="text-amber-400" size={20} />
          </div>
          <div>
            <p className="font-medium">{itemTitle}</p>
            <p className="text-sm text-tg-hint">
              {t.modals.boost.boostToAppear}
            </p>
          </div>
        </div>

        {/* Days Selection */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.boost.duration}
          </label>
          <div className="flex gap-2">
            {dayOptions.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  hapticSelection?.();
                  setDays(d);
                }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  days === d
                    ? 'bg-accent text-white'
                    : 'bg-white/5 text-tg-hint hover:bg-white/10'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Amount Per Day Selection */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.boost.amountPerDay}
          </label>
          <div className="flex gap-2 flex-wrap">
            {amountOptions.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  hapticSelection?.();
                  setAmountPerDay(amt);
                  setIsCustom(false);
                }}
                className={`flex-1 min-w-[50px] py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  !isCustom && amountPerDay === amt
                    ? 'bg-accent text-white'
                    : 'bg-white/5 text-tg-hint hover:bg-white/10'
                }`}
              >
                {amt}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                hapticSelection?.();
                setIsCustom(true);
              }}
              className={`flex-1 min-w-[50px] py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-1 ${
                isCustom
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-tg-hint hover:bg-white/10'
              }`}
            >
              <PenLine size={14} />
            </button>
          </div>

          {/* Custom Amount Input */}
          {isCustom && (
            <div className="mt-3">
              <input
                type="number"
                step="0.1"
                min="1"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder={t.modals.boost.enterAmount}
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
              />
            </div>
          )}

          <p className="text-xs text-tg-hint mt-2">
            {t.modals.boost.higherAmount}
          </p>
        </div>

        {/* Cost Summary */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-accent/10 to-accent-light/10 border border-accent/20">
          <div className="flex justify-between items-center mb-2">
            <span className="text-tg-hint">{t.modals.boost.duration}</span>
            <span className="font-medium">{days} {t.modals.boost.days}</span>
          </div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-tg-hint">{t.modals.boost.amountPerDay}</span>
            <span className="font-medium">{effectiveAmount || '0'} TON</span>
          </div>
          <div className="border-t border-white/10 my-2" />
          <div className="flex justify-between items-center">
            <span className="font-medium">{t.modals.boost.totalCost}</span>
            <span className="text-lg font-bold text-accent">{totalCost} TON</span>
          </div>
        </div>

        {/* Balance Warning */}
        {!hasEnoughBalance && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">
              {t.modals.boost.insufficientBalance}. {t.modals.boost.needBalance.replace('{need}', totalCost).replace('{have}', userBalance)}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={boostMutation.isPending}
          disabled={boostMutation.isPending || !hasEnoughBalance}
        >
          <Zap size={18} />
          {t.modals.boost.boostFor} {totalCost} TON
        </Button>
      </form>
    </Modal>
  );
}
