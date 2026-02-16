import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, Image, Video, Repeat, Clock, Ban, Megaphone, Save, Users, UserPlus, X } from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, PageTransition } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
// useAuthStore available if needed for admin checks
import { useTranslation } from '../i18n';

interface ChannelDetails {
  id: string;
  title: string;
  username?: string;
  pricePerPost: string;
  formatPrices?: Record<string, string>;
  categories: string[];
  adFormats: string[];
  postDuration: string;
  restrictions: string[];
  allowsNativeAds: boolean;
  description?: string;
}

const FORMAT_PRICE_KEYS = [
  { id: '1_24', label: '1/24ч', labelEn: '1/24h' },
  { id: '2_48', label: '2/48ч', labelEn: '2/48h' },
  { id: 'no_delete', label: 'Без удаления', labelEn: 'No delete' },
  { id: 'repost', label: 'Репост', labelEn: 'Repost' },
] as const;

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

export function ChannelSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hapticFeedback, hapticNotification, hapticSelection } = useTelegram();

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [pricePerPost, setPricePerPost] = useState('');
  const [useFormatPrices, setUseFormatPrices] = useState(false);
  const [formatPrices, setFormatPrices] = useState<Record<string, string>>({});
  const [adFormats, setAdFormats] = useState<string[]>(['TEXT']);
  const [postDuration, setPostDuration] = useState('24H');
  const [customDuration, setCustomDuration] = useState('');
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [allowsNativeAds, setAllowsNativeAds] = useState(true);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const [newAdminUsername, setNewAdminUsername] = useState('');

  // Admin queries
  const { data: admins, refetch: refetchAdmins } = useQuery({
    queryKey: ['channel-admins', id],
    queryFn: async () => {
      const response = await api.get<Array<{ id: string; userId: string; username: string; firstName?: string; role: string; addedAt: string }>>(`/channels/${id}/admins`);
      return response.data;
    },
    enabled: !!id,
  });

  const addAdminMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/channels/${id}/admins`, { username: newAdminUsername });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      setNewAdminUsername('');
      refetchAdmins();
    },
    onError: () => hapticNotification?.('error'),
  });

  const removeAdminMutation = useMutation({
    mutationFn: async (adminId: string) => {
      await api.delete(`/channels/${id}/admins/${adminId}`);
    },
    onSuccess: () => {
      hapticNotification?.('success');
      refetchAdmins();
    },
    onError: () => hapticNotification?.('error'),
  });

  const { data: channel, isLoading, isFetching } = useQuery({
    queryKey: ['channel', id],
    queryFn: async () => {
      const response = await api.get<ChannelDetails>(`/channels/${id}`);
      return response.data;
    },
    enabled: !!id,
    staleTime: 30000, // Data is fresh for 30 seconds
  });

  // Initialize form when channel data loads
  useEffect(() => {
    if (channel) {
      setSelectedCategories(channel.categories || []);
      setPricePerPost(channel.pricePerPost || '');
      if (channel.formatPrices && Object.keys(channel.formatPrices).length > 0) {
        setUseFormatPrices(true);
        setFormatPrices(channel.formatPrices);
      }
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
    }
  }, [channel]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const finalDuration = postDuration === 'CUSTOM' ? `${customDuration}H` : postDuration;
      // Filter out empty format prices
      const cleanFormatPrices = useFormatPrices
        ? Object.fromEntries(
            Object.entries(formatPrices).filter(([, v]) => v && parseFloat(v) > 0)
          )
        : undefined;
      const response = await api.patch(`/channels/${id}`, {
        categories: selectedCategories,
        pricePerPost: useFormatPrices ? undefined : pricePerPost,
        formatPrices: cleanFormatPrices,
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
      queryClient.invalidateQueries({ queryKey: ['channel', id] });
      navigate(-1);
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

    if (useFormatPrices) {
      const filledPrices = Object.values(formatPrices).filter((v) => v && parseFloat(v) > 0);
      if (filledPrices.length === 0) {
        setError('Укажите хотя бы одну цену по формату');
        return;
      }
    } else if (!pricePerPost || parseFloat(pricePerPost) < 0.1) {
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

  // Show loading if: loading OR no id OR no data and fetching
  if (isLoading || !id || (!channel && isFetching)) {
    return (
      <PageTransition>
        <div className="p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-white/10 rounded-xl w-1/3" />
            <div className="h-40 bg-white/10 rounded-xl" />
            <div className="h-40 bg-white/10 rounded-xl" />
          </div>
        </div>
      </PageTransition>
    );
  }

  if (!channel) {
    return (
      <PageTransition>
        <div className="p-4">
          <Card className="text-center py-12">
            <p className="text-red-500 font-medium">Канал не найден</p>
            <Button variant="secondary" className="mt-4" onClick={() => navigate('/channels')}>
              <ArrowLeft size={18} /> Назад
            </Button>
          </Card>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              hapticFeedback?.('light');
              navigate(-1);
            }}
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Настройки канала</h1>
            <p className="text-sm text-tg-hint">{channel.title}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Categories */}
          <Card>
            <label className="flex items-center gap-2 text-sm font-medium mb-3">
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
          </Card>

          {/* Price */}
          <Card>
            <label className="flex items-center gap-2 text-sm font-medium mb-3">
              <span>💰</span>
              Цены за размещение (TON)
            </label>

            {/* Toggle: single price vs format prices */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => { hapticSelection?.(); setUseFormatPrices(false); }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  !useFormatPrices
                    ? 'bg-accent/20 border-accent text-accent border'
                    : 'bg-white/5 border border-white/10 text-tg-hint'
                }`}
              >
                Единая цена
              </button>
              <button
                type="button"
                onClick={() => { hapticSelection?.(); setUseFormatPrices(true); }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  useFormatPrices
                    ? 'bg-accent/20 border-accent text-accent border'
                    : 'bg-white/5 border border-white/10 text-tg-hint'
                }`}
              >
                По форматам
              </button>
            </div>

            {!useFormatPrices ? (
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
            ) : (
              <div className="space-y-3">
                {FORMAT_PRICE_KEYS.map((fmt) => (
                  <div key={fmt.id} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-28 text-tg-hint">{fmt.label}</span>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formatPrices[fmt.id] || ''}
                        onChange={(e) =>
                          setFormatPrices((prev) => ({ ...prev, [fmt.id]: e.target.value }))
                        }
                        placeholder="0.00"
                        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors pr-16 text-sm"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-tg-hint text-xs">TON</span>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-tg-hint">
                  Оставьте пустым форматы, которые не предлагаете
                </p>
              </div>
            )}
          </Card>

          {/* Ad Formats */}
          <Card>
            <label className="flex items-center gap-2 text-sm font-medium mb-3">
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
          </Card>

          {/* Post Duration */}
          <Card>
            <label className="flex items-center gap-2 text-sm font-medium mb-3">
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
              <div className="mt-3 relative">
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
          </Card>

          {/* Restrictions */}
          <Card>
            <label className="flex items-center gap-2 text-sm font-medium mb-2">
              <Ban size={16} />
              Ограничения
            </label>
            <p className="text-xs text-tg-hint mb-3">Выберите типы контента, которые вы НЕ принимаете</p>
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
          </Card>

          {/* Native Ads */}
          <Card>
            <label className="flex items-center gap-2 text-sm font-medium mb-3">
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
            <p className="text-xs text-tg-hint mt-2">Нативная реклама соответствует стилю вашего канала</p>
          </Card>

          {/* Description */}
          <Card>
            <label className="flex items-center gap-2 text-sm font-medium mb-3">
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
          </Card>

          {/* Admins */}
          <Card>
            <label className="flex items-center gap-2 text-sm font-medium mb-3">
              <Users size={16} />
              {t.admins.title}
            </label>

            {/* Current admins list */}
            <div className="space-y-2 mb-3">
              {admins?.map((admin) => (
                <div key={admin.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{admin.username || admin.firstName || admin.userId.slice(0, 8)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      admin.role === 'OWNER' ? 'bg-accent/20 text-accent' : 'bg-white/10 text-tg-hint'
                    }`}>
                      {admin.role === 'OWNER' ? t.admins.ownerRole : t.admins.adminRole}
                    </span>
                  </div>
                  {admin.role !== 'OWNER' && (
                    <button
                      type="button"
                      onClick={() => removeAdminMutation.mutate(admin.id)}
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
              {(!admins || admins.length === 0) && (
                <p className="text-sm text-tg-hint">{t.admins.noAdmins}</p>
              )}
            </div>

            {/* Add admin form */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newAdminUsername}
                onChange={(e) => setNewAdminUsername(e.target.value)}
                placeholder={t.admins.enterUsername}
                className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors text-sm"
              />
              <button
                type="button"
                disabled={!newAdminUsername.trim() || addAdminMutation.isPending}
                onClick={() => addAdminMutation.mutate()}
                className="px-3 py-2 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1"
              >
                <UserPlus size={14} />
                {t.admins.addAdmin}
              </button>
            </div>
          </Card>

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
            <Save size={18} />
            Сохранить
          </Button>
        </form>
      </div>
    </PageTransition>
  );
}
