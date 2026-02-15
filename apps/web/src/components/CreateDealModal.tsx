import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { api } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';
import { FileText, Image, Video, File, Megaphone, Calendar } from 'lucide-react';
import { useTranslation } from '../i18n';

interface Channel {
  id: string;
  title: string;
  username?: string;
  avatarUrl?: string;
  pricePerPost: string;
  formatPrices?: Record<string, string>;
}

const AD_FORMAT_OPTIONS = [
  { key: '1_24', label: '1/24h' },
  { key: '2_48', label: '2/48h' },
  { key: 'no_delete', label: 'No delete' },
  { key: 'repost', label: 'Repost' },
] as const;

interface Campaign {
  id: string;
  title: string;
  totalBudget: string;
  spentBudget: string;
  status: string;
}

interface CreateDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel | null;
}

export function CreateDealModal({ isOpen, onClose, channel }: CreateDealModalProps) {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [adFormat, setAdFormat] = useState<string>('');
  const [contentType, setContentType] = useState('TEXT');
  const [contentText, setContentText] = useState('');
  const [scheduledPostTime, setScheduledPostTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Minimum datetime: 1 hour from now
  const minScheduleTime = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }, []);

  const { hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const contentTypes = [
    { id: 'TEXT', label: 'Text', icon: FileText },
    { id: 'PHOTO', label: 'Photo', icon: Image },
    { id: 'VIDEO', label: 'Video', icon: Video },
    { id: 'DOCUMENT', label: 'Document', icon: File },
  ];

  // Set default amount from channel price
  useEffect(() => {
    if (channel?.pricePerPost) {
      setAmount(channel.pricePerPost);
    }
    setAdFormat('');
  }, [channel]);

  // When adFormat changes, update amount from formatPrices
  useEffect(() => {
    if (adFormat && channel?.formatPrices?.[adFormat]) {
      setAmount(channel.formatPrices[adFormat]);
    } else if (!adFormat && channel?.pricePerPost) {
      setAmount(channel.pricePerPost);
    }
  }, [adFormat, channel]);

  // Fetch user's campaigns
  const { data: campaignsData, isLoading: campaignsLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await api.get<{ items: Campaign[] }>('/campaigns');
      return response.data;
    },
    enabled: isOpen,
  });

  const activeCampaigns = campaignsData?.items.filter(c => c.status === 'ACTIVE' || c.status === 'DRAFT') || [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/deals', {
        campaignId: selectedCampaign,
        channelId: channel?.id,
        amount,
        contentType,
        contentText: contentText || undefined,
        scheduledPostTime: scheduledPostTime ? new Date(scheduledPostTime).toISOString() : undefined,
        adFormat: adFormat || undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', selectedCampaign] });
      onClose();
      resetForm();
    },
    onError: (err: Error) => {
      hapticNotification?.('error');
      setError(err.message);
    },
  });

  const resetForm = () => {
    setSelectedCampaign('');
    setAmount(channel?.pricePerPost || '');
    setAdFormat('');
    setContentType('TEXT');
    setContentText('');
    setScheduledPostTime('');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedCampaign) {
      setError(t.modals.createDeal.errorCampaign);
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError(t.modals.createDeal.errorAmount);
      return;
    }

    if (!contentText.trim()) {
      setError(t.modals.createDeal.errorContent);
      return;
    }

    createMutation.mutate();
  };

  if (!channel) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.modals.createDeal.title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Channel Info */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
          {channel.avatarUrl ? (
            <img
              src={channel.avatarUrl}
              alt={channel.title}
              className="w-12 h-12 rounded-xl object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-accent-light/20 flex items-center justify-center text-lg font-bold text-accent">
              {channel.title[0]}
            </div>
          )}
          <div>
            <p className="font-semibold">{channel.title}</p>
            {channel.username && (
              <p className="text-sm text-accent">@{channel.username}</p>
            )}
          </div>
          <div className="ml-auto text-right">
            <p className="font-bold text-accent">
              {channel.formatPrices && Object.keys(channel.formatPrices).length > 0
                ? `${channel.pricePerPost}+`
                : channel.pricePerPost}
            </p>
            <p className="text-xs text-tg-hint">TON/post</p>
          </div>
        </div>

        {/* Ad Format Selection - only if channel has formatPrices */}
        {channel.formatPrices && Object.keys(channel.formatPrices).length > 0 && (
          <div>
            <label className="block text-sm font-medium text-tg-hint mb-2">
              {t.modals.createDeal.selectFormat}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {AD_FORMAT_OPTIONS.filter((opt) => channel.formatPrices?.[opt.key]).map((opt) => {
                const isSelected = adFormat === opt.key;
                const price = channel.formatPrices![opt.key];
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      hapticSelection?.();
                      setAdFormat(opt.key);
                    }}
                    className={`p-3 rounded-xl text-left transition-all duration-200 ${
                      isSelected
                        ? 'bg-accent/20 border-accent border'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className={`text-xs mt-1 ${isSelected ? 'text-accent' : 'text-tg-hint'}`}>
                      {price} TON
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Campaign Selection */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.createDeal.selectCampaign}
          </label>
          {campaignsLoading ? (
            <div className="h-12 skeleton rounded-xl" />
          ) : activeCampaigns.length === 0 ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Megaphone size={18} className="text-amber-400" />
                <p className="text-sm font-medium text-amber-400">{t.modals.createDeal.noCampaigns}</p>
              </div>
              <p className="text-xs text-amber-300/80">
                {t.modals.createDeal.createCampaignFirst}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeCampaigns.map((campaign) => {
                const remaining = parseFloat(campaign.totalBudget) - parseFloat(campaign.spentBudget);
                const isSelected = selectedCampaign === campaign.id;
                return (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => {
                      hapticSelection?.();
                      setSelectedCampaign(campaign.id);
                    }}
                    className={`w-full p-3 rounded-xl text-left transition-all duration-200 ${
                      isSelected
                        ? 'bg-accent/20 border-accent border'
                        : 'bg-white/5 border border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <p className="font-medium">{campaign.title}</p>
                      <p className={`text-sm ${remaining < parseFloat(amount || '0') ? 'text-red-400' : 'text-green-400'}`}>
                        {remaining.toFixed(2)} TON {t.modals.createDeal.left}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.createDeal.amount}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={channel.pricePerPost}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
          />
          <p className="text-xs text-tg-hint mt-1">
            {t.modals.createDeal.channelPrice}: {channel.pricePerPost} TON
          </p>
        </div>

        {/* Content Type */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.createDeal.contentType}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {contentTypes.map((type) => {
              const Icon = type.icon;
              const isSelected = contentType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => {
                    hapticSelection?.();
                    setContentType(type.id);
                  }}
                  className={`flex items-center gap-2 p-3 rounded-xl text-sm transition-all duration-200 ${
                    isSelected
                      ? 'bg-accent/20 border-accent text-accent border'
                      : 'bg-white/5 border border-white/10 text-tg-hint'
                  }`}
                >
                  <Icon size={18} />
                  <span>{type.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ad Content */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.createDeal.adContent} <span className="text-red-400">*</span>
          </label>
          <textarea
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            placeholder={t.modals.createDeal.adContentPlaceholder}
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none"
          />
          <p className="text-xs text-tg-hint mt-1">
            {t.modals.createDeal.autoPost}
          </p>
        </div>

        {/* Schedule Post Time */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            <Calendar size={14} className="inline mr-1" />
            {t.modals.createDeal.schedulePost}
          </label>
          <input
            type="datetime-local"
            value={scheduledPostTime}
            onChange={(e) => setScheduledPostTime(e.target.value)}
            min={minScheduleTime}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
          />
          <p className="text-xs text-tg-hint mt-1">
            {scheduledPostTime ? t.modals.createDeal.schedulePostHint : t.modals.createDeal.postImmediately}
          </p>
        </div>

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
          loading={createMutation.isPending}
          disabled={createMutation.isPending || !selectedCampaign || activeCampaigns.length === 0 || !contentText.trim()}
        >
          {t.modals.createDeal.createFor} {amount || '0'} TON
        </Button>
      </form>
    </Modal>
  );
}
