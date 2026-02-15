import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { api } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';
import { Settings, FileText, Image, Video, Share2, Check, PenLine } from 'lucide-react';
import { useTranslation } from '../i18n';

interface EditAdConditionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  currentConditions: {
    pricePerPost: string;
    adFormats: string[];
    postDuration: string;
    restrictions: string[];
    allowsNativeAds: boolean;
  };
}

const formatOptions = [
  { value: 'TEXT', icon: FileText },
  { value: 'PHOTO', icon: Image },
  { value: 'VIDEO', icon: Video },
  { value: 'REPOST', icon: Share2 },
];

const durationOptions = ['24H', '48H', '72H', 'WEEK', 'FOREVER'];

const restrictionOptions = [
  { value: 'NO_GAMBLING', label: 'No Gambling' },
  { value: 'NO_ADULT', label: 'No Adult' },
  { value: 'NO_POLITICS', label: 'No Politics' },
  { value: 'NO_CRYPTO', label: 'No Crypto' },
];

export function EditAdConditionsModal({
  isOpen,
  onClose,
  channelId,
  currentConditions,
}: EditAdConditionsModalProps) {
  const [pricePerPost, setPricePerPost] = useState(currentConditions.pricePerPost);
  const [adFormats, setAdFormats] = useState<string[]>(currentConditions.adFormats);
  const [postDuration, setPostDuration] = useState(currentConditions.postDuration);
  const [restrictions, setRestrictions] = useState<string[]>(currentConditions.restrictions);
  const [allowsNativeAds, setAllowsNativeAds] = useState(currentConditions.allowsNativeAds);
  const [error, setError] = useState<string | null>(null);
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [customHours, setCustomHours] = useState('');

  const { hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  // Reset state when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setPricePerPost(currentConditions.pricePerPost);
      setAdFormats(currentConditions.adFormats);
      setRestrictions(currentConditions.restrictions);
      setAllowsNativeAds(currentConditions.allowsNativeAds);
      setError(null);

      // Check if current duration is a preset or custom
      const isPreset = durationOptions.includes(currentConditions.postDuration);
      if (isPreset) {
        setPostDuration(currentConditions.postDuration);
        setIsCustomDuration(false);
        setCustomHours('');
      } else {
        // Parse custom hours from format like "12H"
        const match = currentConditions.postDuration.match(/^(\d+)H$/);
        if (match) {
          setCustomHours(match[1]);
          setIsCustomDuration(true);
          setPostDuration('');
        } else {
          setPostDuration(currentConditions.postDuration);
          setIsCustomDuration(false);
          setCustomHours('');
        }
      }
    }
  }, [isOpen, currentConditions]);

  // Get effective duration value
  const effectiveDuration = isCustomDuration ? `${customHours}H` : postDuration;

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(`/channels/${channelId}`, {
        pricePerPost,
        adFormats,
        postDuration: effectiveDuration,
        restrictions,
        allowsNativeAds,
      });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['myChannels'] });
      onClose();
    },
    onError: (err: Error) => {
      hapticNotification?.('error');
      setError(err.message);
    },
  });

  const toggleFormat = (format: string) => {
    hapticSelection?.();
    setAdFormats((prev) =>
      prev.includes(format)
        ? prev.filter((f) => f !== format)
        : [...prev, format]
    );
  };

  const toggleRestriction = (restriction: string) => {
    hapticSelection?.();
    setRestrictions((prev) =>
      prev.includes(restriction)
        ? prev.filter((r) => r !== restriction)
        : [...prev, restriction]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const price = parseFloat(pricePerPost);
    if (!price || price < 0.1) {
      setError(t.channels.enterValidPrice || 'Enter valid price (min 0.1 TON)');
      return;
    }

    if (adFormats.length === 0) {
      setError(t.channels.selectAtLeastOneFormat || 'Select at least one ad format');
      return;
    }

    if (isCustomDuration) {
      const hours = parseInt(customHours, 10);
      if (!hours || hours < 1) {
        setError(t.channels.enterValidHours || 'Enter valid number of hours');
        return;
      }
    }

    updateMutation.mutate();
  };

  const durationLabels: Record<string, string> = {
    '24H': t.channels.duration24h,
    '48H': t.channels.duration48h,
    '72H': t.channels.duration72h,
    'WEEK': t.channels.durationWeek,
    'FOREVER': t.channels.durationForever,
  };

  const formatLabels: Record<string, string> = {
    'TEXT': t.channels.formatText,
    'PHOTO': t.channels.formatPhoto,
    'VIDEO': t.channels.formatVideo,
    'REPOST': t.channels.formatRepost,
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.channels.editAdConditions || 'Edit Ad Conditions'}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Price per Post */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.addChannel.pricePerPost || 'Price per Post (TON)'}
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={pricePerPost}
              onChange={(e) => setPricePerPost(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors pr-16"
              placeholder="0.0"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-accent font-medium">
              TON
            </span>
          </div>
        </div>

        {/* Ad Formats */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.channels.adFormats}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {formatOptions.map(({ value, icon: Icon }) => {
              const isSelected = adFormats.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleFormat(value)}
                  className={`flex items-center gap-2 p-3 rounded-xl transition-all duration-200 ${
                    isSelected
                      ? 'bg-accent/20 border-2 border-accent text-accent'
                      : 'bg-white/5 border-2 border-transparent text-tg-hint hover:bg-white/10'
                  }`}
                >
                  <Icon size={18} />
                  <span className="font-medium">{formatLabels[value] || value}</span>
                  {isSelected && <Check size={16} className="ml-auto" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Post Duration */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.channels.postDuration}
          </label>
          <div className="flex flex-wrap gap-2">
            {durationOptions.map((duration) => (
              <button
                key={duration}
                type="button"
                onClick={() => {
                  hapticSelection?.();
                  setPostDuration(duration);
                  setIsCustomDuration(false);
                  setCustomHours('');
                }}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  !isCustomDuration && postDuration === duration
                    ? 'bg-accent text-white'
                    : 'bg-white/5 text-tg-hint hover:bg-white/10'
                }`}
              >
                {durationLabels[duration] || duration}
              </button>
            ))}
            {/* Custom hours button */}
            <button
              type="button"
              onClick={() => {
                hapticSelection?.();
                setIsCustomDuration(true);
                setPostDuration('');
              }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-1 ${
                isCustomDuration
                  ? 'bg-accent text-white'
                  : 'bg-white/5 text-tg-hint hover:bg-white/10'
              }`}
            >
              <PenLine size={14} />
              {t.channels.customHours || 'Custom'}
            </button>
          </div>

          {/* Custom hours input */}
          {isCustomDuration && (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="8760"
                  value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  placeholder={t.channels.enterHours || 'Enter hours'}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
                />
                <span className="text-tg-hint">{t.channels.hours || 'hours'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Restrictions */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.channels.restrictions}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {restrictionOptions.map(({ value, label }) => {
              const isSelected = restrictions.includes(value);
              const restrictionLabels: Record<string, string> = {
                'NO_GAMBLING': t.channels.noGambling,
                'NO_ADULT': t.channels.noAdult,
                'NO_POLITICS': t.channels.noPolitics,
                'NO_CRYPTO': t.channels.noCrypto,
              };
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleRestriction(value)}
                  className={`flex items-center gap-2 p-3 rounded-xl text-sm transition-all duration-200 ${
                    isSelected
                      ? 'bg-red-500/20 border-2 border-red-500 text-red-400'
                      : 'bg-white/5 border-2 border-transparent text-tg-hint hover:bg-white/10'
                  }`}
                >
                  <span className="font-medium">{restrictionLabels[value] || label}</span>
                  {isSelected && <Check size={16} className="ml-auto" />}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-tg-hint mt-2">
            {t.channels.restrictionsHint || 'Select content types you do NOT accept'}
          </p>
        </div>

        {/* Native Ads Toggle */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.channels.nativeAds}
          </label>
          <button
            type="button"
            onClick={() => {
              hapticSelection?.();
              setAllowsNativeAds(!allowsNativeAds);
            }}
            className={`w-full flex items-center justify-between p-4 rounded-xl transition-all duration-200 ${
              allowsNativeAds
                ? 'bg-green-500/20 border-2 border-green-500'
                : 'bg-white/5 border-2 border-transparent'
            }`}
          >
            <span className={allowsNativeAds ? 'text-green-400 font-medium' : 'text-tg-hint'}>
              {allowsNativeAds
                ? (t.channels.nativeAdsAllowed || 'Native ads allowed')
                : (t.channels.nativeAdsNotAllowed || 'Native ads not allowed')}
            </span>
            <div
              className={`w-12 h-6 rounded-full transition-all duration-200 relative ${
                allowsNativeAds ? 'bg-green-500' : 'bg-white/20'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 ${
                  allowsNativeAds ? 'left-7' : 'left-1'
                }`}
              />
            </div>
          </button>
          <p className="text-xs text-tg-hint mt-2">
            {t.channels.nativeAdsHint || 'Native ads blend with your channel content style'}
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
          loading={updateMutation.isPending}
          disabled={updateMutation.isPending}
        >
          <Settings size={18} />
          {t.ui.save || 'Save Changes'}
        </Button>
      </form>
    </Modal>
  );
}
