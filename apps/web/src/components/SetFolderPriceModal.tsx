import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { useTelegram } from '../hooks/useTelegram';
import { DollarSign } from 'lucide-react';
import { useTranslation } from '../i18n';
import { folderPlacementsApi } from '../api/folderPlacements';

interface SetFolderPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
  folderTitle: string;
  currentPrice?: string | null;
}

export function SetFolderPriceModal({
  isOpen,
  onClose,
  folderId,
  folderTitle,
  currentPrice,
}: SetFolderPriceModalProps) {
  const [price, setPrice] = useState(currentPrice || '');
  const [isFree, setIsFree] = useState(!currentPrice);
  const [error, setError] = useState<string | null>(null);

  const { hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const setPriceMutation = useMutation({
    mutationFn: async () => {
      const priceValue = isFree ? null : price;
      const response = await folderPlacementsApi.setFolderPrice(folderId, priceValue);
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder', folderId] });
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

    if (!isFree) {
      const priceNum = parseFloat(price);
      if (!priceNum || priceNum <= 0) {
        setError(t.channels.enterValidPrice);
        return;
      }
    }

    setPriceMutation.mutate();
  };

  const handleToggleFree = () => {
    hapticSelection?.();
    setIsFree(!isFree);
    if (!isFree) {
      setPrice('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.folders.setPricing}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Folder Info */}
        <div className="p-4 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-[var(--tg-theme-text-color)]">
                {folderTitle}
              </p>
              <p className="text-xs text-[var(--tg-theme-hint-color)]">
                {t.folders.pricePerChannel}
              </p>
            </div>
          </div>
        </div>

        {/* Free/Paid Toggle */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleToggleFree}
            className={`w-full p-4 rounded-xl border-2 transition-all ${
              isFree
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-white/10 bg-[var(--tg-theme-secondary-bg-color)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="font-medium text-[var(--tg-theme-text-color)]">
                  {t.folders.makeItFree}
                </p>
                <p className="text-xs text-[var(--tg-theme-hint-color)]">
                  {t.folders.freeFolder}
                </p>
              </div>
              {isFree && (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              if (isFree) handleToggleFree();
            }}
            className={`w-full p-4 rounded-xl border-2 transition-all ${
              !isFree
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-white/10 bg-[var(--tg-theme-secondary-bg-color)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <p className="font-medium text-[var(--tg-theme-text-color)]">
                  {t.folders.paidFolder}
                </p>
                <p className="text-xs text-[var(--tg-theme-hint-color)]">
                  {t.folders.setPrice}
                </p>
              </div>
              {!isFree && (
                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Price Input (only if not free) */}
        {!isFree && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--tg-theme-text-color)]">
              {t.folders.pricePerChannel}
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={t.folders.enterPrice}
                className="w-full px-4 py-3 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/10 text-[var(--tg-theme-text-color)] placeholder:text-[var(--tg-theme-hint-color)] focus:outline-none focus:border-blue-500"
                disabled={setPriceMutation.isPending}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tg-theme-hint-color)] text-sm">
                TON
              </div>
            </div>
          </div>
        )}

        {/* Current Price Display */}
        {currentPrice && (
          <div className="p-3 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--tg-theme-hint-color)]">
                Current price:
              </span>
              <span className="text-[var(--tg-theme-text-color)] font-medium">
                {currentPrice} TON
              </span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={setPriceMutation.isPending}
            className="flex-1"
          >
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={setPriceMutation.isPending}
            className="flex-1"
          >
            {t.common.save}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
