import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { api } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

interface Channel {
  id: string;
  title: string;
  username?: string;
  subscriberCount: number;
  status: string;
}

interface ApplyToBriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: {
    id: string;
    title: string;
    briefText?: string;
    requirements?: string;
    minSubscribers?: number;
    maxBudgetPerDeal?: string;
  };
}

export function ApplyToBriefModal({ isOpen, onClose, campaign }: ApplyToBriefModalProps) {
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [applicationNote, setApplicationNote] = useState('');
  const [proposedAmount, setProposedAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Fetch user's channels
  const { data: channelsData, isLoading: loadingChannels } = useQuery({
    queryKey: ['myChannels'],
    queryFn: async () => {
      const response = await api.get<Channel[]>('/channels/my');
      return response.data;
    },
    enabled: isOpen,
  });

  // Filter to only active channels that meet minimum subscriber requirements
  const eligibleChannels = (channelsData || []).filter((ch) => {
    if (ch.status !== 'ACTIVE') return false;
    if (campaign.minSubscribers && ch.subscriberCount < campaign.minSubscribers) return false;
    return true;
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/deals/apply', {
        campaignId: campaign.id,
        channelId: selectedChannelId,
        applicationNote: applicationNote.trim() || undefined,
        proposedAmount: proposedAmount ? parseFloat(proposedAmount) : undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification('success');
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      onClose();
      resetForm();
    },
    onError: (err: Error) => {
      hapticNotification('error');
      setError(err.message);
    },
  });

  const resetForm = () => {
    setSelectedChannelId('');
    setApplicationNote('');
    setProposedAmount('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedChannelId) {
      setError(t.briefs.selectYourChannel);
      return;
    }

    applyMutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t.briefs.applyToBrief}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Campaign Title */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="font-semibold">{campaign.title}</p>
        </div>

        {/* Brief Text */}
        {campaign.briefText && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs text-tg-hint mb-1 font-medium">{t.briefs.applyToBrief}</p>
            <p className="text-sm whitespace-pre-wrap">{campaign.briefText}</p>
          </div>
        )}

        {/* Requirements */}
        {campaign.requirements && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs text-tg-hint mb-1 font-medium">{t.briefs.requirements}</p>
            <p className="text-sm whitespace-pre-wrap">{campaign.requirements}</p>
          </div>
        )}

        {/* Min Subscribers Info */}
        {campaign.minSubscribers && (
          <div className="flex items-center gap-2 text-xs text-tg-hint">
            <span>{t.briefs.minSubscribers}:</span>
            <span className="font-medium">{campaign.minSubscribers.toLocaleString()}</span>
          </div>
        )}

        {/* Channel Selection */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.briefs.selectYourChannel}
          </label>
          {loadingChannels ? (
            <div className="h-12 skeleton rounded-xl" />
          ) : eligibleChannels.length === 0 ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-400">{t.briefs.noChannels}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {eligibleChannels.map((channel) => {
                const isSelected = selectedChannelId === channel.id;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => {
                      hapticSelection();
                      setSelectedChannelId(channel.id);
                    }}
                    className={`w-full p-3 rounded-xl text-left transition-all duration-200 ${
                      isSelected
                        ? 'bg-accent/20 border-accent border'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{channel.title}</p>
                        {channel.username && (
                          <p className="text-xs text-tg-hint">@{channel.username}</p>
                        )}
                      </div>
                      <p className="text-sm text-tg-hint">
                        {channel.subscriberCount.toLocaleString()} sub
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Application Note */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.briefs.applicationNote}
          </label>
          <textarea
            value={applicationNote}
            onChange={(e) => setApplicationNote(e.target.value)}
            placeholder={t.briefs.applicationNotePlaceholder}
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none"
          />
        </div>

        {/* Proposed Amount */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.briefs.proposedAmount}
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={proposedAmount}
              onChange={(e) => setProposedAmount(e.target.value)}
              placeholder={campaign.maxBudgetPerDeal || '0.00'}
              className="w-full px-4 py-3 pr-16 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-tg-hint font-medium">
              TON
            </span>
          </div>
        </div>

        {/* Error */}
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
            disabled={applyMutation.isPending}
            className="flex-1"
          >
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={applyMutation.isPending}
            disabled={applyMutation.isPending || !selectedChannelId || eligibleChannels.length === 0}
            className="flex-1"
          >
            {t.briefs.apply}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
