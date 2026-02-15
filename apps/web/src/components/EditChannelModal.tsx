import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { api } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';
import { FileText, Image, Video, Repeat, Clock, Ban, Megaphone } from 'lucide-react';

interface Channel {
  id: string;
  title: string;
  username?: string;
  pricePerPost: string;
  categories: string[];
  adFormats: string[];
  postDuration: string;
  restrictions: string[];
  allowsNativeAds: boolean;
  description?: string;
}

interface EditChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel | null;
}

const AD_FORMATS = [
  { id: 'TEXT', icon: FileText, label: 'Текст' },
  { id: 'PHOTO', icon: Image, label: 'Фото' },
  { id: 'VIDEO', icon: Video, label: 'Видео' },
  { id: 'REPOST', icon: Repeat, label: 'Репост' },
];

const POST_DURATIONS = [
  { id: '24H', label: '24 часа' },
  { id: '48H', label: '48 часов' },
  { id: '72H', label: '72 часа' },
  { id: 'WEEK', label: 'Неделя' },
  { id: 'FOREVER', label: 'Навсегда' },
];

const RESTRICTIONS = [
  { id: 'NO_GAMBLING', label: 'Без казино' },
  { id: 'NO_ADULT', label: 'Без 18+' },
  { id: 'NO_POLITICS', label: 'Без политики' },
  { id: 'NO_CRYPTO', label: 'Без крипто' },
];

const CATEGORIES = [
  { id: 'technology', label: 'Технологии', emoji: '💻' },
  { id: 'business', label: 'Бизнес', emoji: '💼' },
  { id: 'entertainment', label: 'Развлечения', emoji: '🎬' },
  { id: 'news', label: 'Новости', emoji: '📰' },
  { id: 'crypto', label: 'Крипто', emoji: '₿' },
  { id: 'lifestyle', label: 'Лайфстайл', emoji: '🌟' },
];

export function EditChannelModal({ isOpen, onClose, channel }: EditChannelModalProps) {
  const { hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [pricePerPost, setPricePerPost] = useState('');
  const [adFormats, setAdFormats] = useState<string[]>(['TEXT']);
  const [postDuration, setPostDuration] = useState('24H');
  const [customDuration, setCustomDuration] = useState('');
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [allowsNativeAds, setAllowsNativeAds] = useState(true);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Initialize form when channel changes
  useEffect(() => {
    if (channel) {
      setSelectedCategories(channel.categories || []);
      setPricePerPost(channel.pricePerPost || '');
      setAdFormats(channel.adFormats?.length ? channel.adFormats : ['TEXT']);
      const duration = channel.postDuration || '24H';
      if (POST_DURATIONS.some(d => d.id === duration)) {
        setPostDuration(duration);
        setCustomDuration('');
      } else {
        setPostDuration('CUSTOM');
        setCustomDuration(duration.replace('H', ''));
      }
      setRestrictions(channel.restrictions || []);
      setAllowsNativeAds(channel.allowsNativeAds ?? true);
      setDescription(channel.description || '');
      setError(null);
    }
  }, [channel]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const finalDuration = postDuration === 'CUSTOM' ? `${customDuration}H` : postDuration;
      const response = await api.patch(`/channels/${channel?.id}`, {
        categories: selectedCategories,
        pricePerPost,
        adFormats,
        postDuration: finalDuration,
        restrictions,
        allowsNativeAds,
        description: description || undefined,
      });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['my-channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel', channel?.id] });
      onClose();
    },
    onError: (err: Error) => {
      hapticNotification?.('error');
      setError(err.message);
    },
  });

  const handleCategoryToggle = (catId: string) => {
    hapticSelection?.();
    setSelectedCategories((prev) =>
      prev.includes(catId)
        ? prev.filter((c) => c !== catId)
        : prev.length < 5
        ? [...prev, catId]
        : prev
    );
  };

  const handleFormatToggle = (formatId: string) => {
    hapticSelection?.();
    setAdFormats((prev) =>
      prev.includes(formatId)
        ? prev.filter((f) => f !== formatId)
        : [...prev, formatId]
    );
  };

  const handleRestrictionToggle = (restrictionId: string) => {
    hapticSelection?.();
    setRestrictions((prev) =>
      prev.includes(restrictionId)
        ? prev.filter((r) => r !== restrictionId)
        : [...prev, restrictionId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (selectedCategories.length === 0) {
      setError('Выберите хотя бы одну категорию');
      return;
    }

    if (!pricePerPost || parseFloat(pricePerPost) < 0.1) {
      setError('Введите корректную цену (мин. 0.1 TON)');
      return;
    }

    if (adFormats.length === 0) {
      setError('Выберите хотя бы один формат');
      return;
    }

    if (postDuration === 'CUSTOM' && (!customDuration || parseInt(customDuration) <= 0)) {
      setError('Введите корректное количество часов');
      return;
    }

    updateMutation.mutate();
  };

  if (!channel) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Настройки канала">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Categories */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-tg-hint mb-2">
            <span>📁</span>
            Категории (макс. 5)
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategories.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryToggle(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isSelected
                      ? 'bg-accent/20 border-accent text-accent border'
                      : 'bg-white/5 border border-white/10 text-tg-hint'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Price per post */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-tg-hint mb-2">
            <span>💰</span>
            Цена за пост (TON)
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0.1"
              value={pricePerPost}
              onChange={(e) => setPricePerPost(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-tg-hint text-sm">TON</span>
          </div>
        </div>

        {/* Ad Formats */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-tg-hint mb-2">
            <span>📝</span>
            Форматы рекламы
          </label>
          <div className="flex flex-wrap gap-2">
            {AD_FORMATS.map((format) => {
              const isSelected = adFormats.includes(format.id);
              const Icon = format.icon;
              return (
                <button
                  key={format.id}
                  type="button"
                  onClick={() => handleFormatToggle(format.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isSelected
                      ? 'bg-accent/20 border-accent text-accent border'
                      : 'bg-white/5 border border-white/10 text-tg-hint'
                  }`}
                >
                  <Icon size={16} />
                  <span>{format.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Post Duration */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-tg-hint mb-2">
            <Clock size={16} />
            Длительность поста
          </label>
          <div className="flex flex-wrap gap-2">
            {POST_DURATIONS.map((duration) => {
              const isSelected = postDuration === duration.id;
              return (
                <button
                  key={duration.id}
                  type="button"
                  onClick={() => {
                    hapticSelection?.();
                    setPostDuration(duration.id);
                  }}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isSelected
                      ? 'bg-accent/20 border-accent text-accent border'
                      : 'bg-white/5 border border-white/10 text-tg-hint'
                  }`}
                >
                  {duration.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                hapticSelection?.();
                setPostDuration('CUSTOM');
              }}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                postDuration === 'CUSTOM'
                  ? 'bg-accent/20 border-accent text-accent border'
                  : 'bg-white/5 border border-white/10 text-tg-hint'
              }`}
            >
              Своё
            </button>
          </div>
          {postDuration === 'CUSTOM' && (
            <div className="mt-2 relative">
              <input
                type="number"
                min="1"
                value={customDuration}
                onChange={(e) => setCustomDuration(e.target.value)}
                placeholder="Введите часы"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors pr-20"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-tg-hint text-sm">часов</span>
            </div>
          )}
        </div>

        {/* Restrictions */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-tg-hint mb-2">
            <Ban size={16} />
            Ограничения
          </label>
          <p className="text-xs text-tg-hint mb-2">Выберите типы контента, которые вы НЕ принимаете</p>
          <div className="flex flex-wrap gap-2">
            {RESTRICTIONS.map((restriction) => {
              const isSelected = restrictions.includes(restriction.id);
              return (
                <button
                  key={restriction.id}
                  type="button"
                  onClick={() => handleRestrictionToggle(restriction.id)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isSelected
                      ? 'bg-red-500/20 border-red-500 text-red-400 border'
                      : 'bg-white/5 border border-white/10 text-tg-hint'
                  }`}
                >
                  {restriction.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Native Ads Toggle */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-tg-hint mb-2">
            <Megaphone size={16} />
            Нативная реклама
          </label>
          <button
            type="button"
            onClick={() => {
              hapticSelection?.();
              setAllowsNativeAds(!allowsNativeAds);
            }}
            className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all duration-200 ${
              allowsNativeAds
                ? 'bg-green-500/10 border-green-500/30'
                : 'bg-white/5 border-white/10'
            }`}
          >
            <span className={allowsNativeAds ? 'text-green-400' : 'text-tg-hint'}>
              {allowsNativeAds ? 'Нативная реклама разрешена' : 'Нативная реклама запрещена'}
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
          <p className="text-xs text-tg-hint mt-1">Нативная реклама соответствует стилю вашего канала</p>
        </div>

        {/* Description */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-tg-hint mb-2">
            <span>📋</span>
            Описание
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Опишите ваш канал..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none"
          />
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
          Сохранить
        </Button>
      </form>
    </Modal>
  );
}
