import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Eye, Plus, Zap, Clock, CheckCircle, XCircle, ShoppingCart, ChevronRight, FileText, Image as ImageIcon, Video, Repeat, Ban, Megaphone, Star, SlidersHorizontal, X } from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, ChannelCardSkeleton, PageTransition, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { useAuthStore } from '../store/auth.store';
import { AddChannelModal } from '../components/AddChannelModal';
import { BoostModal } from '../components/BoostModal';
import { CreateDealModal } from '../components/CreateDealModal';
import { useTranslation } from '../i18n';

interface Channel {
  id: string;
  title: string;
  username?: string;
  avatarUrl?: string;
  subscriberCount: number;
  avgViews: number;
  pricePerPost: string;
  categories: string[];
  status: string;
  boostAmount: string;
  boostUntil?: string;
  isBoosted: boolean;
  ownerId: string;
  isVerified: boolean;
  // Extended fields
  adFormats: string[];
  postDuration: string;
  restrictions: string[];
  allowsNativeAds: boolean;
  description?: string;
  rating: number;
  reviewsCount: number;
}

interface PaginatedChannels {
  items: Channel[];
  total: number;
  page: number;
  totalPages: number;
}

type ViewMode = 'all' | 'my';

export function ChannelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialView = searchParams.get('view') === 'my' ? 'my' : 'all';

  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [boostChannel, setBoostChannel] = useState<Channel | null>(null);
  const [dealChannel, setDealChannel] = useState<Channel | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    subscribersMin: '',
    subscribersMax: '',
    priceMin: '',
    priceMax: '',
  });

  const { hapticFeedback, hapticSelection } = useTelegram();
  const { user, isAuthenticated } = useAuthStore();
  const { t, translateCategory } = useTranslation();
  const queryClient = useQueryClient();

  // Prefetch channel details on hover for instant navigation
  const prefetchChannel = useCallback((channelId: string) => {
    queryClient.prefetchQuery({
      queryKey: ['channel', channelId],
      queryFn: async () => {
        const response = await api.get(`/channels/${channelId}`);
        return response.data;
      },
      staleTime: 1000 * 60 * 2,
    });
  }, [queryClient]);

  const categories = [
    { id: null, label: t.categories.all, emoji: '✨' },
    { id: 'technology', label: t.categories.technology, emoji: '💻' },
    { id: 'business', label: t.categories.business, emoji: '💼' },
    { id: 'entertainment', label: t.categories.entertainment, emoji: '🎬' },
    { id: 'news', label: t.categories.news, emoji: '📰' },
    { id: 'crypto', label: t.categories.crypto, emoji: '₿' },
    { id: 'lifestyle', label: t.categories.lifestyle, emoji: '🌟' },
  ];

  // Sync viewMode with URL param
  useEffect(() => {
    const urlView = searchParams.get('view');
    if (urlView === 'my' && viewMode !== 'my') {
      setViewMode('my');
    }
  }, [searchParams]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['channels', selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.set('categories', selectedCategory);
      const response = await api.get<PaginatedChannels>(`/channels?${params}`);
      return response.data;
    },
    enabled: viewMode === 'all',
  });

  const { data: myChannels, isLoading: isLoadingMy, error: errorMy } = useQuery({
    queryKey: ['my-channels'],
    queryFn: async () => {
      const response = await api.get<Channel[]>('/channels/my/channels');
      return response.data;
    },
    enabled: viewMode === 'my' && isAuthenticated,
  });

  const handleCategoryChange = (cat: string | null) => {
    hapticSelection?.();
    setSelectedCategory(cat);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full tg-badge-warning text-xs font-medium">
            <Clock size={12} />
            {t.channels.onModeration}
          </span>
        );
      case 'ACTIVE':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full tg-badge-success text-xs font-medium">
            <CheckCircle size={12} />
            {t.channels.activeStatus}
          </span>
        );
      case 'REJECTED':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full tg-badge-error text-xs font-medium">
            <XCircle size={12} />
            {t.channels.rejectedStatus}
          </span>
        );
      default:
        return null;
    }
  };

  const currentChannels = viewMode === 'all' ? data?.items : myChannels;
  const currentLoading = viewMode === 'all' ? isLoading : isLoadingMy;
  const currentError = viewMode === 'all' ? error : errorMy;

  // Filter channels based on filter state
  const filteredChannels = useMemo(() => {
    if (!currentChannels) return [];

    const subscribersMin = filters.subscribersMin ? parseFloat(filters.subscribersMin) : 0;
    const subscribersMax = filters.subscribersMax ? parseFloat(filters.subscribersMax) : Infinity;
    const priceMin = filters.priceMin ? parseFloat(filters.priceMin) : 0;
    const priceMax = filters.priceMax ? parseFloat(filters.priceMax) : Infinity;

    return currentChannels.filter(ch => {
      const price = parseFloat(ch.pricePerPost);
      return (
        ch.subscriberCount >= subscribersMin &&
        ch.subscriberCount <= subscribersMax &&
        price >= priceMin &&
        price <= priceMax
      );
    });
  }, [currentChannels, filters]);

  const hasActiveFilters = filters.subscribersMin || filters.subscribersMax || filters.priceMin || filters.priceMax;

  const handleResetFilters = () => {
    hapticFeedback?.('light');
    setFilters({
      subscribersMin: '',
      subscribersMax: '',
      priceMin: '',
      priceMax: '',
    });
  };

  return (
    <PageTransition>
      <div className="p-4">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-4"
        >
          <h1 className="text-xl font-bold text-tg-text">{t.channels.title}</h1>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              hapticFeedback?.('light');
              setShowAddModal(true);
            }}
          >
            <Plus size={18} />
            {t.common.add}
          </Button>
        </motion.div>

        {/* View Mode Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2 mb-4"
        >
          <button
            onClick={() => {
              hapticSelection?.();
              setViewMode('all');
              setSearchParams({});
            }}
            className={`flex-1 py-2.5 rounded-tg text-sm font-medium transition-all duration-150 ${
              viewMode === 'all'
                ? 'bg-tg-link text-white'
                : 'bg-tg-bg-secondary text-tg-text-secondary hover:bg-gray-200'
            }`}
          >
            {t.channels.allChannels}
          </button>
          <button
            onClick={() => {
              hapticSelection?.();
              setViewMode('my');
              setSearchParams({ view: 'my' });
            }}
            className={`flex-1 py-2.5 rounded-tg text-sm font-medium transition-all duration-150 ${
              viewMode === 'my'
                ? 'bg-tg-link text-white'
                : 'bg-tg-bg-secondary text-tg-text-secondary hover:bg-gray-200'
            }`}
          >
            {t.channels.myChannels}
          </button>
        </motion.div>

        {/* Category Filter and Filter Button - only for All Channels */}
        {viewMode === 'all' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex gap-2 pb-4 mb-4"
          >
            {/* Filter Button - always visible */}
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                hapticSelection?.();
                setShowFilters(!showFilters);
              }}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-tg text-sm whitespace-nowrap font-medium transition-all duration-150 ${
                showFilters || hasActiveFilters
                  ? 'tg-btn-primary'
                  : 'tg-btn-secondary text-tg-text-secondary'
              }`}
            >
              <SlidersHorizontal size={16} />
              <span>{t.common.filter}</span>
              {hasActiveFilters && (
                <span className="ml-1 w-2 h-2 rounded-full bg-white" />
              )}
            </motion.button>

            {/* Categories - scrollable */}
            <div className="flex gap-2 overflow-x-auto hide-scrollbar">
              {categories.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <motion.button
                    key={cat.id ?? 'all'}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleCategoryChange(cat.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-tg text-sm whitespace-nowrap font-medium transition-all duration-150 ${
                      isActive
                        ? 'tg-btn-primary'
                        : 'tg-btn-secondary text-tg-text-secondary'
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Filter Panel */}
        <AnimatePresence>
          {viewMode === 'all' && showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="bg-tg-bg-secondary rounded-tg p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-tg-text">{t.common.filter}</h3>
                  <button
                    onClick={() => setShowFilters(false)}
                    className="p-1 rounded-full hover:bg-tg-bg text-tg-text-secondary"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Subscribers Range */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-tg-text mb-2">
                    {t.filters.subscribers}
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      placeholder={t.filters.from}
                      value={filters.subscribersMin}
                      onChange={(e) => setFilters(prev => ({ ...prev, subscribersMin: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-tg bg-tg-bg border border-tg-separator text-tg-text text-sm focus:outline-none focus:border-tg-link"
                    />
                    <span className="text-tg-text-secondary">—</span>
                    <input
                      type="number"
                      placeholder={t.filters.to}
                      value={filters.subscribersMax}
                      onChange={(e) => setFilters(prev => ({ ...prev, subscribersMax: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-tg bg-tg-bg border border-tg-separator text-tg-text text-sm focus:outline-none focus:border-tg-link"
                    />
                  </div>
                </div>

                {/* Price Range */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-tg-text mb-2">
                    {t.filters.price} (TON)
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      step="0.1"
                      placeholder={t.filters.from}
                      value={filters.priceMin}
                      onChange={(e) => setFilters(prev => ({ ...prev, priceMin: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-tg bg-tg-bg border border-tg-separator text-tg-text text-sm focus:outline-none focus:border-tg-link"
                    />
                    <span className="text-tg-text-secondary">—</span>
                    <input
                      type="number"
                      step="0.1"
                      placeholder={t.filters.to}
                      value={filters.priceMax}
                      onChange={(e) => setFilters(prev => ({ ...prev, priceMax: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-tg bg-tg-bg border border-tg-separator text-tg-text text-sm focus:outline-none focus:border-tg-link"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleResetFilters}
                    className="flex-1 py-2.5 rounded-tg text-sm font-medium bg-tg-bg text-tg-text-secondary hover:bg-tg-separator transition-colors"
                  >
                    {t.filters.reset}
                  </button>
                  <button
                    onClick={() => {
                      hapticFeedback?.('light');
                      setShowFilters(false);
                    }}
                    className="flex-1 py-2.5 rounded-tg text-sm font-medium bg-tg-link text-white hover:opacity-90 transition-opacity"
                  >
                    {t.filters.apply}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading State */}
        {currentLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <ChannelCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error State */}
        {currentError && (
          <Card className="text-center py-8">
            <p className="text-tg-error font-medium">{t.errors.failedToLoad}</p>
            <p className="text-sm text-tg-text-secondary mt-1">{t.errors.tryAgain}</p>
          </Card>
        )}

        {/* Empty State */}
        {!currentLoading && !currentError && filteredChannels.length === 0 && (
          <Card className="text-center py-10">
            <div className="w-14 h-14 mx-auto rounded-tg-md bg-tg-bg-secondary flex items-center justify-center mb-4">
              <span className="text-2xl">{viewMode === 'my' ? '📋' : '📢'}</span>
            </div>
            <p className="font-semibold text-tg-text">
              {viewMode === 'my' ? t.channels.noMyChannels : t.channels.noChannelsFound}
            </p>
            <p className="text-sm text-tg-text-secondary mt-1">
              {viewMode === 'my' ? t.channels.addFirstChannel : t.channels.tryDifferentCategory}
            </p>
            {viewMode === 'my' && (
              <Button
                variant="primary"
                className="mt-4"
                onClick={() => setShowAddModal(true)}
              >
                <Plus size={18} />
                {t.channels.addChannel}
              </Button>
            )}
            {viewMode === 'all' && hasActiveFilters && (
              <Button
                variant="secondary"
                className="mt-4"
                onClick={handleResetFilters}
              >
                {t.filters.reset}
              </Button>
            )}
          </Card>
        )}

        {/* Channel List */}
        <StaggerContainer className="space-y-3">
          {filteredChannels.map((channel) => (
            <StaggerItem key={channel.id}>
              <div
                className="tg-card transition-colors duration-150 active:bg-tg-bg-secondary"
                onMouseEnter={() => prefetchChannel(channel.id)}
                onTouchStart={() => prefetchChannel(channel.id)}
              >
                {/* Content area - clickable for navigation */}
                <div
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    hapticFeedback?.('light');
                    navigate(`/channels/${channel.id}`);
                  }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      {channel.avatarUrl ? (
                        <img
                          src={channel.avatarUrl}
                          alt={channel.title}
                          className="w-11 h-11 rounded-tg object-cover"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-tg bg-tg-link/10 flex items-center justify-center text-lg font-bold text-tg-link">
                          {channel.title[0]}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-tg-text">{channel.title}</h3>
                          {channel.isVerified && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-tg-link/10 text-tg-link">
                              <CheckCircle size={12} />
                            </span>
                          )}
                          {viewMode === 'my' && getStatusBadge(channel.status)}
                          {channel.isBoosted && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full tg-badge-warning text-xs font-medium">
                              <Zap size={12} />
                              {t.folders.boosted}
                            </span>
                          )}
                        </div>
                        {channel.username && (
                          <p className="text-sm text-tg-link">@{channel.username}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-lg font-bold text-tg-link">
                          {channel.pricePerPost}
                        </p>
                        <p className="text-xs text-tg-text-secondary">TON {t.channels.pricePerPost}</p>
                      </div>
                      <ChevronRight size={18} className="text-tg-text-secondary" />
                    </div>
                  </div>

                  <div className="flex gap-4 mb-3">
                    <div className="flex items-center gap-1.5 text-sm text-tg-text-secondary">
                      <Users size={14} />
                      <span>{formatNumber(channel.subscriberCount)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-tg-text-secondary">
                      <Eye size={14} />
                      <span>{formatNumber(channel.avgViews)} avg</span>
                    </div>
                    {channel.rating > 0 && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Star size={14} className="fill-tg-warning text-tg-warning" />
                        <span className="text-tg-warning font-medium">{channel.rating.toFixed(1)}</span>
                        <span className="text-tg-text-secondary">({channel.reviewsCount})</span>
                      </div>
                    )}
                  </div>

                  {/* Extended info row */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {/* Ad formats icons */}
                    {channel.adFormats && channel.adFormats.length > 0 && (
                      <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-tg-bg-secondary text-tg-text-secondary">
                        {channel.adFormats.includes('TEXT') && <FileText size={14} />}
                        {channel.adFormats.includes('PHOTO') && <ImageIcon size={14} />}
                        {channel.adFormats.includes('VIDEO') && <Video size={14} />}
                        {channel.adFormats.includes('REPOST') && <Repeat size={14} />}
                      </div>
                    )}
                    {/* Post duration */}
                    {channel.postDuration && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-tg-bg-secondary text-xs text-tg-text-secondary">
                        <Clock size={14} />
                        {getDurationLabel(channel.postDuration, t)}
                      </span>
                    )}
                    {/* Native ads badge */}
                    {channel.allowsNativeAds && (
                      <span className="flex items-center gap-1 px-2 py-1 rounded-lg tg-badge-success text-xs">
                        <Megaphone size={14} />
                        {t.channels.nativeAds}
                      </span>
                    )}
                  </div>

                  {/* Restrictions */}
                  {channel.restrictions && channel.restrictions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                      {channel.restrictions.map((r) => (
                        <span
                          key={r}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg tg-badge-error text-xs"
                        >
                          <Ban size={12} />
                          {getRestrictionLabel(r, t)}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-1.5 mb-4 flex-wrap">
                    {channel.categories.slice(0, 3).map((cat) => (
                      <span key={cat} className="tg-badge capitalize">
                        {translateCategory(cat)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Buttons - separate from clickable area */}
                <div className="flex gap-2 pt-3 border-t border-tg-separator">
                  {channel.status === 'ACTIVE' ? (
                    channel.ownerId === user?.id ? (
                      <>
                        <Link
                          to={`/channels/${channel.id}/settings`}
                          className="flex-1 tg-btn-primary flex items-center justify-center gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            hapticFeedback?.('light');
                          }}
                        >
                          {t.channels.configure}
                        </Link>
                        <button
                          type="button"
                          className="tg-btn-secondary flex items-center justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            hapticFeedback?.('light');
                            setBoostChannel(channel);
                          }}
                        >
                          <Zap size={18} />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="flex-1 tg-btn-primary flex items-center justify-center gap-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          hapticFeedback?.('medium');
                          setDealChannel(channel);
                        }}
                      >
                        <ShoppingCart size={18} />
                        {t.channels.createDeal}
                      </button>
                    )
                  ) : (
                    <div className="flex-1 py-2.5 rounded-tg text-sm font-medium text-center bg-tg-bg-secondary text-tg-text-secondary">
                      {channel.status === 'PENDING' ? t.channels.onModeration : t.channels.rejectedStatus}
                    </div>
                  )}
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Pagination - only for All Channels */}
        {viewMode === 'all' && data && data.totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center mt-6"
          >
            <p className="text-sm text-tg-text-secondary tg-badge">
              {t.common.page} {data.page} {t.common.of} {data.totalPages}
            </p>
          </motion.div>
        )}
      </div>

      {/* Modals */}
      <AddChannelModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />

      {boostChannel && (
        <BoostModal
          isOpen={!!boostChannel}
          onClose={() => setBoostChannel(null)}
          type="channel"
          itemId={boostChannel.id}
          itemTitle={boostChannel.title}
          userBalance={user?.balanceTon}
        />
      )}

      <CreateDealModal
        isOpen={!!dealChannel}
        onClose={() => setDealChannel(null)}
        channel={dealChannel}
      />
    </PageTransition>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function getDurationLabel(duration: string, t: ReturnType<typeof useTranslation>['t']): string {
  const durationMap: Record<string, string> = {
    '24H': t.channels.duration24h,
    '48H': t.channels.duration48h,
    '72H': t.channels.duration72h,
    'WEEK': t.channels.durationWeek,
    'FOREVER': t.channels.durationForever,
  };
  if (durationMap[duration]) {
    return durationMap[duration];
  }
  // Custom duration like "96H"
  const hours = duration.replace('H', '');
  return `${hours} ${t.channels.hours}`;
}

function getRestrictionLabel(restriction: string, t: ReturnType<typeof useTranslation>['t']): string {
  const restrictionMap: Record<string, string> = {
    'NO_GAMBLING': t.channels.noGambling,
    'NO_ADULT': t.channels.noAdult,
    'NO_POLITICS': t.channels.noPolitics,
    'NO_CRYPTO': t.channels.noCrypto,
  };
  return restrictionMap[restriction] || restriction;
}
