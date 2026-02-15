import { useState, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { api } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';
import { Folder, AlertCircle, Users, CheckCircle } from 'lucide-react';
import { useTranslation } from '../i18n';
import { folderPlacementsApi } from '../api/folderPlacements';

interface RequestPlacementModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string;
  folderTitle: string;
  folderPrice: string;
  userBalance?: string;
}

interface UserChannel {
  id: string;
  title: string;
  username?: string;
  avatarUrl?: string;
  subscriberCount: number;
  status: string;
}

const PLATFORM_FEE_PERCENT = 5;

export function RequestPlacementModal({
  isOpen,
  onClose,
  folderId,
  folderTitle,
  folderPrice,
  userBalance = '0',
}: RequestPlacementModalProps) {
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Fetch user's channels
  const { data: channelsData, isLoading: loadingChannels } = useQuery({
    queryKey: ['myChannels'],
    queryFn: async () => {
      const response = await api.get<UserChannel[]>('/channels/my/channels');
      // Filter only active channels
      return response.data.filter(c => c.status === 'ACTIVE');
    },
    enabled: isOpen,
  });

  // Fetch existing placements for this folder to check which channels are already placed/pending
  const { data: existingPlacements } = useQuery({
    queryKey: ['folderPlacements', folderId, 'all'],
    queryFn: async () => {
      const response = await folderPlacementsApi.getFolderPlacements(folderId, {
        limit: 100,
      });
      return response.data.items;
    },
    enabled: isOpen,
  });

  const channels = channelsData || [];
  const placements = existingPlacements || [];

  // Check which channels are already placed or have pending requests
  const getChannelStatus = (channelId: string): 'available' | 'pending' | 'approved' => {
    const placement = placements.find(p => p.channelId === channelId);
    if (!placement) return 'available';
    if (placement.status === 'PENDING') return 'pending';
    if (placement.status === 'APPROVED') return 'approved';
    return 'available';
  };

  const availableChannels = channels.filter(c => getChannelStatus(c.id) === 'available');

  const { amount, platformFee, total } = useMemo(() => {
    const priceNum = parseFloat(folderPrice);
    const fee = (priceNum * PLATFORM_FEE_PERCENT) / 100;
    const totalCost = priceNum + fee;

    return {
      amount: priceNum.toFixed(2),
      platformFee: fee.toFixed(2),
      total: totalCost.toFixed(2),
    };
  }, [folderPrice]);

  const hasEnoughBalance = parseFloat(userBalance) >= parseFloat(total);

  const placementMutation = useMutation({
    mutationFn: async () => {
      if (!selectedChannelId) {
        throw new Error(t.folders.selectChannel);
      }
      const response = await folderPlacementsApi.createPlacement(folderId, selectedChannelId);
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['folderPlacements', folderId] });
      queryClient.invalidateQueries({ queryKey: ['myChannelPlacements'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      onClose();
    },
    onError: (err: any) => {
      hapticNotification?.('error');
      const message = err?.response?.data?.message || err.message || 'Error';
      setError(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedChannelId) {
      setError(t.folders.selectChannel);
      return;
    }

    if (!hasEnoughBalance) {
      setError(t.folders.insufficientBalance);
      return;
    }

    placementMutation.mutate();
  };

  const handleClose = () => {
    setSelectedChannelId('');
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t.folders.requestPlacement}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Folder Info */}
        <div className="p-4 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Folder className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-[var(--tg-theme-text-color)]">
                {folderTitle}
              </p>
              <p className="text-xs text-[var(--tg-theme-hint-color)]">
                {folderPrice} TON {t.folders.pricePerChannel}
              </p>
            </div>
          </div>
        </div>

        {/* Channel Selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[var(--tg-theme-text-color)]">
            {t.folders.selectChannel}
          </label>
          {loadingChannels ? (
            <div className="p-4 text-center text-[var(--tg-theme-hint-color)]">
              {t.common.loading}
            </div>
          ) : channels.length === 0 ? (
            <div className="p-4 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/5 text-center">
              <Users className="w-10 h-10 text-[var(--tg-theme-hint-color)] mx-auto mb-2" />
              <p className="text-sm text-[var(--tg-theme-hint-color)]">
                {t.folders.noChannelsFound}
              </p>
              <p className="text-xs text-[var(--tg-theme-hint-color)] mt-1">
                {t.folders.addChannelFirst}
              </p>
            </div>
          ) : availableChannels.length === 0 ? (
            <div className="p-4 rounded-xl bg-[var(--tg-theme-secondary-bg-color)] border border-white/5 text-center">
              <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
              <p className="text-sm text-[var(--tg-theme-hint-color)]">
                {t.folders.allChannelsPlaced}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {channels.map((channel) => {
                const status = getChannelStatus(channel.id);
                const isDisabled = status !== 'available';

                return (
                  <button
                    key={channel.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (!isDisabled) {
                        hapticSelection?.();
                        setSelectedChannelId(channel.id);
                      }
                    }}
                    className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                      isDisabled
                        ? 'opacity-50 cursor-not-allowed border-white/5 bg-[var(--tg-theme-secondary-bg-color)]'
                        : selectedChannelId === channel.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-white/10 bg-[var(--tg-theme-secondary-bg-color)] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {channel.avatarUrl ? (
                        <img
                          src={channel.avatarUrl}
                          alt={channel.title}
                          className="w-10 h-10 rounded-xl object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                          <Users className="w-5 h-5 text-white" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[var(--tg-theme-text-color)] truncate">
                          {channel.title}
                        </p>
                        <p className="text-xs text-[var(--tg-theme-hint-color)]">
                          {channel.subscriberCount.toLocaleString()} {t.channels.subscribers}
                        </p>
                      </div>
                      {status === 'pending' && (
                        <span className="text-xs px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400">
                          {t.folders.pending}
                        </span>
                      )}
                      {status === 'approved' && (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                          {t.folders.alreadyPlaced}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Cost Breakdown */}
        {selectedChannelId && (
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
        {selectedChannelId && !hasEnoughBalance && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">
              {t.folders.insufficientBalance}
            </p>
          </div>
        )}

        {/* Info Notice */}
        {selectedChannelId && hasEnoughBalance && (
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-300">
              {t.folders.requestInfo}
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
            onClick={handleClose}
            disabled={placementMutation.isPending}
            className="flex-1"
          >
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={placementMutation.isPending}
            disabled={!selectedChannelId || !hasEnoughBalance || availableChannels.length === 0}
            className="flex-1"
          >
            {t.folders.sendRequest}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
