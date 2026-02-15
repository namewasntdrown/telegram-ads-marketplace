import { useState, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { api } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';
import { Folder, AlertCircle } from 'lucide-react';
import { useTranslation } from '../i18n';
import { folderPlacementsApi } from '../api/folderPlacements';

interface PlaceFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  channelTitle: string;
  folderId?: string;
  folderTitle?: string;
  userBalance?: string;
}

interface FolderOption {
  id: string;
  title: string;
  pricePerChannel?: string;
  categories: string[];
}

const PLATFORM_FEE_PERCENT = 5;

export function PlaceFolderModal({
  isOpen,
  onClose,
  channelId,
  channelTitle,
  folderId,
  folderTitle,
  userBalance = '0',
}: PlaceFolderModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState(folderId || '');
  const [error, setError] = useState<string | null>(null);

  const { hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Fetch available folders (only if no folderId provided)
  const { data: foldersData, isLoading: loadingFolders } = useQuery({
    queryKey: ['folders', 'paid'],
    queryFn: async () => {
      const response = await api.get<{ items: FolderOption[] }>('/folders?status=ACTIVE&limit=100');
      // Filter only paid folders (with pricePerChannel set)
      const paidFolders = response.data.items.filter(f => f.pricePerChannel);
      return paidFolders;
    },
    enabled: isOpen && !folderId,
  });

  const folders = foldersData || [];
  const selectedFolder = folders.find(f => f.id === selectedFolderId);
  const price = selectedFolder?.pricePerChannel || '0';

  const { amount, platformFee, total } = useMemo(() => {
    const priceNum = parseFloat(price);
    const fee = (priceNum * PLATFORM_FEE_PERCENT) / 100;
    const totalCost = priceNum + fee;

    return {
      amount: priceNum.toFixed(2),
      platformFee: fee.toFixed(2),
      total: totalCost.toFixed(2),
    };
  }, [price]);

  const hasEnoughBalance = parseFloat(userBalance) >= parseFloat(total);

  const placementMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFolderId) {
        throw new Error(t.folders.selectFolder);
      }
      const response = await folderPlacementsApi.createPlacement(selectedFolderId, channelId);
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['channelPlacements', channelId] });
      queryClient.invalidateQueries({ queryKey: ['myChannelPlacements'] });
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

    if (!selectedFolderId) {
      setError(t.folders.selectFolder);
      return;
    }

    if (!hasEnoughBalance) {
      setError(t.folders.insufficientBalance);
      return;
    }

    placementMutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.folders.placeInFolder}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Channel Info */}
        <div className="p-4 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-[var(--tg-theme-text-color)]">
                {channelTitle}
              </p>
              <p className="text-xs text-[var(--tg-theme-hint-color)]">
                {t.channels.title}
              </p>
            </div>
          </div>
        </div>

        {/* Folder Selection */}
        {!folderId && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-[var(--tg-theme-text-color)]">
              {t.folders.selectFolder}
            </label>
            {loadingFolders ? (
              <div className="p-4 text-center text-[var(--tg-theme-hint-color)]">
                {t.common.loading}
              </div>
            ) : folders.length === 0 ? (
              <div className="p-4 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/5 text-center">
                <p className="text-sm text-[var(--tg-theme-hint-color)]">
                  {t.folders.noFoldersFound}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => {
                      hapticSelection?.();
                      setSelectedFolderId(folder.id);
                    }}
                    className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                      selectedFolderId === folder.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-white/10 bg-[var(--tg-theme-secondary-bg-color)] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-[var(--tg-theme-text-color)]">
                          {folder.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[var(--tg-theme-hint-color)]">
                            {folder.categories.slice(0, 2).join(', ')}
                          </span>
                        </div>
                      </div>
                      <div className="text-right ml-3">
                        <p className="text-sm font-medium text-blue-400">
                          {folder.pricePerChannel} TON
                        </p>
                        <p className="text-xs text-[var(--tg-theme-hint-color)]">
                          {t.folders.pricePerChannel}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected Folder Display (if folderId provided) */}
        {folderId && folderTitle && (
          <div className="p-4 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/5">
            <div className="flex items-center gap-3">
              <Folder className="w-5 h-5 text-purple-400" />
              <div className="flex-1">
                <p className="font-medium text-[var(--tg-theme-text-color)]">
                  {folderTitle}
                </p>
                <p className="text-xs text-[var(--tg-theme-hint-color)]">
                  {t.folders.title}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cost Breakdown */}
        {selectedFolderId && (
          <div className="space-y-3 p-4 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/5">
            <h3 className="font-medium text-[var(--tg-theme-text-color)] mb-3">
              {t.folders.totalCost}
            </h3>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--tg-theme-hint-color)]">
                  {t.folders.folderOwnerWillReceive}
                </span>
                <span className="text-[var(--tg-theme-text-color)] font-medium">
                  {amount} TON
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--tg-theme-hint-color)]">
                  {t.folders.placementFee} ({PLATFORM_FEE_PERCENT}%)
                </span>
                <span className="text-[var(--tg-theme-text-color)] font-medium">
                  {platformFee} TON
                </span>
              </div>

              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--tg-theme-text-color)]">
                    {t.folders.totalCost}
                  </span>
                  <span className="text-lg font-bold text-blue-400">
                    {total} TON
                  </span>
                </div>
              </div>
            </div>

            {/* Balance Check */}
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--tg-theme-hint-color)]">
                  {t.profile.balance}
                </span>
                <span className={`font-medium ${
                  hasEnoughBalance
                    ? 'text-green-400'
                    : 'text-red-400'
                }`}>
                  {userBalance} TON
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Warning if not enough balance */}
        {selectedFolderId && !hasEnoughBalance && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">
              {t.folders.insufficientBalance}. {t.profile.deposit}
            </p>
          </div>
        )}

        {/* Info Notice */}
        {selectedFolderId && (
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-300">
              {t.folders.requestSent}
            </p>
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
            disabled={placementMutation.isPending}
            className="flex-1"
          >
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={placementMutation.isPending}
            disabled={!selectedFolderId || !hasEnoughBalance}
            className="flex-1"
          >
            {t.folders.placeInFolder}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
