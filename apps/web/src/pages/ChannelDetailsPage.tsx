import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Users,
  Eye,
  TrendingUp,
  Globe,
  Clock,
  Star,
  CheckCircle,
  ShoppingCart,
  Zap,
  FileText,
  Image,
  Video,
  Share2,
  Calendar,
  Shield,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Edit3,
  BarChart3,
  Activity,
  Crown,
  Settings,
  Folder,
} from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, PageTransition, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { useAuthStore } from '../store/auth.store';
import { useTranslation } from '../i18n';
import { useState, useMemo } from 'react';
import { BoostModal } from '../components/BoostModal';
import { CreateDealModal } from '../components/CreateDealModal';
import { ReviewsList } from '../components/ReviewsList';
import { PlaceFolderModal } from '../components/PlaceFolderModal';
import {
  MiniLineChart,
  DonutChart,
  DonutLegend,
  PeakHoursChart,
  ViewSourcesBar,
} from '../components/ChannelStatsCharts';

interface ChannelDetails {
  id: string;
  telegramId: string;
  title: string;
  username?: string;
  description?: string;
  avatarUrl?: string;
  subscriberCount: number;
  avgViews: number;
  pricePerPost: string;
  categories: string[];
  language: string;
  status: string;
  ownerId: string;
  // Statistics
  engagementRate: number;
  subscriberGrowthWeek: number;
  subscriberGrowthMonth: number;
  // Audience
  audienceGeo?: Record<string, number>;
  peakHours?: number[];
  // Trust
  channelCreatedAt?: string;
  completedDealsCount: number;
  rating: number;
  reviewsCount: number;
  successRate: number;
  avgResponseTime?: number;
  // Ad conditions
  adFormats: string[];
  postDuration: string;
  restrictions: string[];
  allowsNativeAds: boolean;
  // Computed
  isBoosted: boolean;
  // Verification
  isVerified: boolean;
  verifiedAt?: string;
  hasVerifiedStats: boolean;
  languageStats?: Record<string, number>;
  premiumStats?: { premiumPercent: number };
  viewSourceStats?: Record<string, number>;
  viewsHistory?: Array<{ date: string; value: number }>;
  followersHistory?: Array<{ date: string; value: number }>;
  lastStatsUpdate?: string;
  telegramGrowthStats?: {
    followers: { current: number; change: number; percent: number };
    viewsPerPost: { current: number; change: number; percent: number };
    sharesPerPost: { current: number; change: number; percent: number };
  };
}

const formatIcons: Record<string, React.ElementType> = {
  TEXT: FileText,
  PHOTO: Image,
  VIDEO: Video,
  REPOST: Share2,
};

export function ChannelDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hapticFeedback } = useTelegram();
  const { user } = useAuthStore();
  const { t, translateCategory } = useTranslation();

  const [showBoostModal, setShowBoostModal] = useState(false);
  const [showDealModal, setShowDealModal] = useState(false);
  const [showPlaceFolderModal, setShowPlaceFolderModal] = useState(false);

  const queryClient = useQueryClient();

  const { data: channel, isLoading, error } = useQuery({
    queryKey: ['channel', id],
    queryFn: async () => {
      const response = await api.get<ChannelDetails>(`/channels/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  const refreshStatsMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<ChannelDetails>(`/channels/${id}/refresh-stats`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel', id] });
      hapticFeedback?.('medium');
    },
  });

  const verifyChannelMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<ChannelDetails>(`/channels/${id}/verify`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel', id] });
      hapticFeedback?.('heavy');
    },
  });

  const durationLabels: Record<string, string> = {
    '24H': t.channels.duration24h,
    '48H': t.channels.duration48h,
    '72H': t.channels.duration72h,
    'WEEK': t.channels.durationWeek,
    'FOREVER': t.channels.durationForever,
  };

  const formatDuration = (duration: string): string => {
    if (durationLabels[duration]) {
      return durationLabels[duration];
    }
    // Handle custom hours format like "12H"
    const match = duration.match(/^(\d+)H$/);
    if (match) {
      return `${match[1]} ${t.channels.hours || 'hours'}`;
    }
    return duration;
  };

  const restrictionLabels: Record<string, string> = {
    'NO_GAMBLING': t.channels.noGambling,
    'NO_ADULT': t.channels.noAdult,
    'NO_POLITICS': t.channels.noPolitics,
    'NO_CRYPTO': t.channels.noCrypto,
  };

  const formatLabels: Record<string, string> = {
    'TEXT': t.channels.formatText,
    'PHOTO': t.channels.formatPhoto,
    'VIDEO': t.channels.formatVideo,
    'REPOST': t.channels.formatRepost,
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatGrowth = (num: number): string => {
    if (num > 0) return `+${formatNumber(num)}`;
    if (num < 0) return formatNumber(num);
    return '0';
  };

  const getChannelAge = (createdAt?: string): string => {
    if (!createdAt) return '—';
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 30) return `${diffDays}d`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}m`;
    return `${Math.floor(diffDays / 365)}y`;
  };

  // Only show skeleton on initial load (no cached data)
  if (!channel && isLoading) {
    return (
      <PageTransition>
        <div className="p-4">
          <div className="h-8 w-32 skeleton rounded-lg mb-4" />
          <div className="h-48 skeleton rounded-2xl mb-4" />
          <div className="h-32 skeleton rounded-2xl mb-4" />
          <div className="h-32 skeleton rounded-2xl" />
        </div>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div className="p-4">
          <Card className="text-center py-12">
            <p className="text-red-500 font-medium">{t.ui.notFound}</p>
            <Button variant="secondary" className="mt-4" onClick={() => navigate('/channels')}>
              <ArrowLeft size={18} /> {t.ui.back}
            </Button>
          </Card>
        </div>
      </PageTransition>
    );
  }

  if (!channel) {
    return (
      <PageTransition>
        <div className="p-4">
          <Card className="text-center py-12">
            <p className="text-tg-hint font-medium">{t.ui.notFound}</p>
            <Button variant="secondary" className="mt-4" onClick={() => navigate('/channels')}>
              <ArrowLeft size={18} /> {t.ui.back}
            </Button>
          </Card>
        </div>
      </PageTransition>
    );
  }

  const isOwner = user?.id === channel.ownerId;

  // Convert daily changes to cumulative values for followers chart (like Telegram shows it)
  const cumulativeFollowersHistory = useMemo(() => {
    if (!channel?.followersHistory?.length || !channel.subscriberCount) return null;

    // Sort by date (oldest to newest)
    const sorted = [...channel.followersHistory].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Convert: start from current subscriber count and go backwards
    const result: Array<{ date: string; value: number }> = [];
    let running = channel.subscriberCount;

    for (let i = sorted.length - 1; i >= 0; i--) {
      result.unshift({ date: sorted[i].date, value: running });
      running -= sorted[i].value;
    }

    return result;
  }, [channel?.followersHistory, channel?.subscriberCount]);

  return (
    <PageTransition>
      <div className="p-4 pb-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-4"
        >
          <button
            onClick={() => {
              hapticFeedback?.('light');
              navigate('/channels');
            }}
            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{channel.title}</h1>
              {channel.isVerified && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
                  <CheckCircle size={12} />
                  {t.channels.verified}
                </span>
              )}
            </div>
            {channel.username && (
              <a
                href={`https://t.me/${channel.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent flex items-center gap-1"
              >
                @{channel.username} <ExternalLink size={12} />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <button
                onClick={() => {
                  hapticFeedback?.('light');
                  refreshStatsMutation.mutate();
                }}
                disabled={refreshStatsMutation.isPending}
                className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={18} className={refreshStatsMutation.isPending ? 'animate-spin' : ''} />
              </button>
            )}
            {channel.isBoosted && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
                <Zap size={12} />
              </span>
            )}
          </div>
        </motion.div>

        <StaggerContainer className="space-y-4">
          {/* Main Info Card */}
          <StaggerItem>
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-accent/20 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-4 mb-4">
                  {channel.avatarUrl ? (
                    <img
                      src={channel.avatarUrl}
                      alt={channel.title}
                      className="w-16 h-16 rounded-2xl object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent-light flex items-center justify-center text-2xl font-bold text-white">
                      {channel.title[0]}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl font-bold text-accent">{channel.pricePerPost}</span>
                      <span className="text-tg-hint">TON</span>
                    </div>
                    <p className="text-sm text-tg-hint">{t.channels.pricePerPost}</p>
                  </div>
                </div>

                {channel.description && (
                  <p className="text-sm text-tg-hint mb-4">{channel.description}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {channel.categories.map((cat) => (
                    <span key={cat} className="neu-badge capitalize">{translateCategory(cat)}</span>
                  ))}
                </div>
              </div>
            </Card>
          </StaggerItem>

          {/* Statistics */}
          <StaggerItem>
            <Card className="overflow-hidden">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-accent" />
                {t.channels.statistics}
              </h3>

              {/* Main Stats Grid */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/5 border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Users size={16} className="text-blue-400" />
                    <span className="text-xs text-tg-hint">{t.channels.subscribers}</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatNumber(channel.telegramGrowthStats?.followers?.current ?? channel.subscriberCount)}
                  </p>
                  {channel.telegramGrowthStats?.followers ? (
                    <p className={`text-xs mt-1 ${channel.telegramGrowthStats.followers.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {channel.telegramGrowthStats.followers.change >= 0 ? '+' : ''}
                      {formatNumber(channel.telegramGrowthStats.followers.change)}
                      {' '}({channel.telegramGrowthStats.followers.percent >= 0 ? '+' : ''}
                      {channel.telegramGrowthStats.followers.percent.toFixed(1)}%)
                    </p>
                  ) : channel.subscriberGrowthWeek !== 0 ? (
                    <p className={`text-xs mt-1 ${channel.subscriberGrowthWeek >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatGrowth(channel.subscriberGrowthWeek)} {t.channels.thisWeek || 'this week'}
                    </p>
                  ) : null}
                </div>
                <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/5 border border-purple-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Eye size={16} className="text-purple-400" />
                    <span className="text-xs text-tg-hint">{t.channels.avgViews}</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatNumber(channel.telegramGrowthStats?.viewsPerPost?.current ?? channel.avgViews)}
                  </p>
                  {channel.telegramGrowthStats?.viewsPerPost ? (
                    <p className={`text-xs mt-1 ${channel.telegramGrowthStats.viewsPerPost.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {channel.telegramGrowthStats.viewsPerPost.change >= 0 ? '+' : ''}
                      {formatNumber(channel.telegramGrowthStats.viewsPerPost.change)}
                      {' '}({channel.telegramGrowthStats.viewsPerPost.percent >= 0 ? '+' : ''}
                      {channel.telegramGrowthStats.viewsPerPost.percent.toFixed(1)}%)
                    </p>
                  ) : channel.hasVerifiedStats ? (
                    <p className="text-xs text-tg-hint mt-1 flex items-center gap-1">
                      <CheckCircle size={10} className="text-blue-400" />
                      {t.channels.fromTelegram || 'from Telegram'}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Engagement & Growth Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/5 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity size={16} className="text-green-400" />
                    <span className="text-xs text-tg-hint">{t.channels.engagement}</span>
                  </div>
                  <p className="text-2xl font-bold text-green-400">{channel.engagementRate.toFixed(1)}%</p>
                </div>
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/5 border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp size={16} className="text-amber-400" />
                    <span className="text-xs text-tg-hint">{t.channels.growthMonth}</span>
                  </div>
                  <p className={`text-2xl font-bold ${channel.subscriberGrowthMonth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatGrowth(channel.subscriberGrowthMonth)}
                  </p>
                </div>
              </div>
            </Card>
          </StaggerItem>

          {/* Views & Followers History Charts - only for verified channels */}
          {channel.hasVerifiedStats && (channel.viewsHistory?.length || channel.followersHistory?.length) && (
            <StaggerItem>
              <Card>
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <BarChart3 size={18} className="text-accent" />
                  {t.channels.historyCharts || 'Analytics'}
                </h3>

                {/* Subscribers Chart */}
                {cumulativeFollowersHistory && cumulativeFollowersHistory.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-sm font-medium">{t.channels.subscribersHistory || 'Subscribers (30 days)'}</span>
                      </div>
                      <span className="text-sm text-tg-hint">
                        {cumulativeFollowersHistory[cumulativeFollowersHistory.length - 1]?.value.toLocaleString()}
                      </span>
                    </div>
                    <MiniLineChart
                      data={cumulativeFollowersHistory}
                      color="#3B82F6"
                      height={100}
                      showArea={true}
                    />
                  </div>
                )}

                {/* Views Chart */}
                {channel.viewsHistory && channel.viewsHistory.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-purple-500" />
                        <span className="text-sm font-medium">{t.channels.viewsHistory || 'Views (30 days)'}</span>
                      </div>
                      <span className="text-sm text-tg-hint">
                        {channel.avgViews.toLocaleString()}
                      </span>
                    </div>
                    <MiniLineChart
                      data={channel.viewsHistory}
                      color="#A855F7"
                      height={100}
                      showArea={true}
                      currentValue={channel.avgViews}
                    />
                  </div>
                )}
              </Card>
            </StaggerItem>
          )}

          {/* Audience - only for verified channels */}
          {channel.hasVerifiedStats && (
            <StaggerItem>
              <Card>
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Globe size={18} className="text-accent" />
                  {t.channels.audience}
                </h3>

                {/* Geography */}
                {channel.audienceGeo && Object.keys(channel.audienceGeo).length > 0 && (
                  <div className="mb-5">
                    <p className="text-sm text-tg-hint mb-3">{t.channels.geography}</p>
                    <div className="space-y-2.5">
                      {Object.entries(channel.audienceGeo)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .map(([country, percent], index) => {
                          const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
                          return (
                            <div key={country} className="flex items-center gap-3">
                              <span className="text-sm w-12 font-medium">{country}</span>
                              <div className="flex-1 h-2.5 bg-white/10 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${percent}%` }}
                                  transition={{ duration: 0.5, delay: index * 0.1 }}
                                  className="h-full rounded-full"
                                  style={{ backgroundColor: colors[index % colors.length] }}
                                />
                              </div>
                              <span className="text-sm font-medium w-12 text-right">{percent}%</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Peak Hours Chart */}
                {channel.peakHours && channel.peakHours.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm text-tg-hint">{t.channels.peakHours}</p>
                      <div className="flex gap-1.5">
                        {channel.peakHours.slice(0, 3).map((hour) => (
                          <span key={hour} className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs font-medium">
                            {hour}:00
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5">
                      <PeakHoursChart hours={channel.peakHours} />
                      <div className="flex justify-between mt-2 text-xs text-tg-hint">
                        <span>00:00</span>
                        <span>06:00</span>
                        <span>12:00</span>
                        <span>18:00</span>
                        <span>23:00</span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </StaggerItem>
          )}

          {/* Trust & Reputation */}
          <StaggerItem>
            <Card>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Shield size={18} className="text-accent" />
                {t.channels.trust}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="flex items-center gap-2 mb-1">
                    <Star size={14} className="text-amber-400" />
                    <span className="text-xs text-tg-hint">{t.channels.rating}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold">{channel.rating.toFixed(1)}</p>
                    <span className="text-xs text-tg-hint">({channel.reviewsCount} {t.channels.reviews})</span>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={14} className="text-green-400" />
                    <span className="text-xs text-tg-hint">{t.channels.completedDeals}</span>
                  </div>
                  <p className="text-lg font-bold">{channel.completedDealsCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-tg-hint">{t.channels.successRate}</span>
                  </div>
                  <p className="text-lg font-bold text-green-400">{channel.successRate.toFixed(0)}%</p>
                </div>
                <div className="p-3 rounded-xl bg-white/5">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={14} className="text-tg-hint" />
                    <span className="text-xs text-tg-hint">{t.channels.responseTime}</span>
                  </div>
                  <p className="text-lg font-bold">
                    {channel.avgResponseTime ? `${channel.avgResponseTime} ${t.channels.minutes}` : '—'}
                  </p>
                </div>
              </div>
              {channel.channelCreatedAt && (
                <div className="mt-3 p-3 rounded-xl bg-white/5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-tg-hint" />
                      <span className="text-sm text-tg-hint">{t.channels.channelAge}</span>
                    </div>
                    <span className="font-medium">{getChannelAge(channel.channelCreatedAt)}</span>
                  </div>
                </div>
              )}
            </Card>
          </StaggerItem>

          {/* Reviews Section */}
          {channel.reviewsCount > 0 && (
            <StaggerItem>
              <ReviewsList channelId={channel.id} />
            </StaggerItem>
          )}

          {/* Verification Section - for owners */}
          {isOwner && !channel.isVerified && (
            <StaggerItem>
              <Card className="border border-blue-500/30 bg-blue-500/5">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <CheckCircle size={18} className="text-blue-400" />
                  {t.channels.verification}
                </h3>
                <p className="text-sm text-tg-hint mb-3">
                  {t.channels.verificationInstructions}
                </p>
                <p className="text-xs text-tg-hint mb-4">
                  {t.channels.verificationBenefits}
                </p>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={() => {
                    hapticFeedback?.('medium');
                    verifyChannelMutation.mutate();
                  }}
                  disabled={verifyChannelMutation.isPending}
                >
                  {verifyChannelMutation.isPending ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      {t.channels.verifying}
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      {t.channels.verifyChannel}
                    </>
                  )}
                </Button>
                {verifyChannelMutation.isSuccess && (
                  <p className="text-sm text-green-400 mt-2 text-center">
                    {t.channels.verificationPending}
                  </p>
                )}
              </Card>
            </StaggerItem>
          )}

          {/* Verified Statistics - shown when hasVerifiedStats */}
          {channel.hasVerifiedStats && (
            <StaggerItem>
              <Card className="border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <CheckCircle size={18} className="text-blue-400" />
                    {t.channels.verifiedStats}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
                    Telegram API
                  </span>
                </div>

                {/* Language Stats with Donut Chart */}
                {channel.languageStats && Object.keys(channel.languageStats).length > 0 && (
                  <div className="mb-6">
                    <p className="text-sm text-tg-hint mb-4">{t.channels.languageStats}</p>
                    <div className="flex items-center gap-6">
                      <DonutChart
                        data={channel.languageStats}
                        size={110}
                        strokeWidth={14}
                      />
                      <div className="flex-1">
                        <DonutLegend data={channel.languageStats} maxItems={4} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Premium Stats */}
                {channel.premiumStats && (
                  <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 to-amber-600/5 border border-amber-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Crown size={18} className="text-amber-400" />
                        <span className="text-sm font-medium">{t.channels.premiumSubscribers}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-amber-400">
                          {channel.premiumStats.premiumPercent}%
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${channel.premiumStats.premiumPercent}%` }}
                        transition={{ duration: 0.5 }}
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full"
                      />
                    </div>
                  </div>
                )}

                {/* View Source Stats */}
                {channel.viewSourceStats && Object.keys(channel.viewSourceStats).length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-tg-hint mb-3">{t.channels.viewSources}</p>
                    <ViewSourcesBar data={channel.viewSourceStats} />
                  </div>
                )}

                {/* Last Update */}
                {channel.lastStatsUpdate && (
                  <div className="flex items-center justify-between pt-3 border-t border-white/10">
                    <p className="text-xs text-tg-hint">
                      {t.channels.lastStatsUpdate}
                    </p>
                    <p className="text-xs text-tg-hint flex items-center gap-1">
                      <RefreshCw size={10} />
                      {new Date(channel.lastStatsUpdate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </Card>
            </StaggerItem>
          )}

          {/* Ad Conditions */}
          <StaggerItem>
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <MessageCircle size={18} className="text-accent" />
                  {t.channels.adConditions}
                </h3>
                {isOwner && (
                  <button
                    onClick={() => {
                      hapticFeedback?.('light');
                      navigate(`/channels/${id}/settings`);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-sm font-medium hover:bg-accent/30 transition-colors"
                  >
                    <Edit3 size={14} />
                    {t.ui.edit || 'Edit'}
                  </button>
                )}
              </div>

              {/* Ad Formats */}
              <div className="mb-4">
                <p className="text-sm text-tg-hint mb-2">{t.channels.adFormats}</p>
                <div className="flex gap-2 flex-wrap">
                  {(channel.adFormats.length > 0 ? channel.adFormats : ['TEXT', 'PHOTO', 'VIDEO']).map((format) => {
                    const Icon = formatIcons[format] || FileText;
                    return (
                      <span key={format} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-sm font-medium">
                        <Icon size={14} />
                        {formatLabels[format] || format}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Post Duration */}
              <div className="mb-4">
                <p className="text-sm text-tg-hint mb-2">{t.channels.postDuration}</p>
                <span className="px-3 py-1.5 rounded-lg bg-white/10 text-sm font-medium">
                  {formatDuration(channel.postDuration)}
                </span>
              </div>

              {/* Restrictions */}
              <div className="mb-4">
                <p className="text-sm text-tg-hint mb-2">{t.channels.restrictions}</p>
                {channel.restrictions.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {channel.restrictions.map((restriction) => (
                      <span key={restriction} className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium">
                        {restrictionLabels[restriction] || restriction}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-sm font-medium">
                    {t.channels.noRestrictions}
                  </span>
                )}
              </div>

              {/* Native Ads */}
              <div className="flex justify-between items-center p-3 rounded-xl bg-white/5">
                <span className="text-sm">{t.channels.nativeAds}</span>
                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                  channel.allowsNativeAds
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {channel.allowsNativeAds ? t.channels.allowed : t.channels.notAllowed}
                </span>
              </div>
            </Card>
          </StaggerItem>
        </StaggerContainer>

        {/* Fixed Bottom Actions - TEST v4 */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-tg-bg via-tg-bg to-transparent">
          <div className="flex gap-2 max-w-lg mx-auto">
            {isOwner ? (
              <>
                <button
                  type="button"
                  className="flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-200 tg-btn-secondary flex items-center justify-center gap-2"
                  onClick={() => {
                    hapticFeedback?.('light');
                    setShowPlaceFolderModal(true);
                  }}
                >
                  <Folder size={18} />
                  {t.folders.placeInFolder}
                </button>
                <Link
                  to={`/channels/${id}/settings`}
                  className="px-6 py-3 rounded-xl font-semibold transition-all duration-200 tg-btn-secondary flex items-center justify-center gap-2"
                  onClick={() => hapticFeedback?.('light')}
                >
                  <Settings size={18} />
                </Link>
                <button
                  type="button"
                  className="px-6 py-3 rounded-xl font-semibold transition-all duration-200 tg-btn-secondary flex items-center justify-center"
                  onClick={() => {
                    hapticFeedback?.('light');
                    setShowBoostModal(true);
                  }}
                >
                  <Zap size={18} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-200 tg-btn-primary text-white flex items-center justify-center gap-2"
                onClick={() => {
                  hapticFeedback?.('medium');
                  setShowDealModal(true);
                }}
              >
                <ShoppingCart size={18} />
                {t.channels.createDeal}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showBoostModal && (
        <BoostModal
          isOpen={showBoostModal}
          onClose={() => setShowBoostModal(false)}
          type="channel"
          itemId={channel.id}
          itemTitle={channel.title}
          userBalance={user?.balanceTon}
        />
      )}

      {showDealModal && (
        <CreateDealModal
          isOpen={showDealModal}
          onClose={() => setShowDealModal(false)}
          channel={{
            id: channel.id,
            title: channel.title,
            username: channel.username,
            avatarUrl: channel.avatarUrl,
            pricePerPost: channel.pricePerPost,
          }}
        />
      )}

      {showPlaceFolderModal && (
        <PlaceFolderModal
          isOpen={showPlaceFolderModal}
          onClose={() => setShowPlaceFolderModal(false)}
          channelId={channel.id}
          channelTitle={channel.title}
          userBalance={user?.balanceTon}
        />
      )}
    </PageTransition>
  );
}
