import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Megaphone,
  Plus,
  Trash2,
  Target,
  Globe,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, StatusBadge, PageTransition, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

interface Campaign {
  id: string;
  title: string;
  description?: string;
  totalBudget: string;
  spentBudget: string;
  categories: string[];
  targetLanguages: string[];
  status: string;
  advertiserId: string;
  dealsCount: number;
  createdAt: string;
}

interface Deal {
  id: string;
  channelId: string;
  channelTitle: string;
  channelUsername?: string;
  amount: string;
  status: string;
  createdAt: string;
}

const languageLabels: Record<string, string> = {
  en: '🇬🇧 English',
  ru: '🇷🇺 Русский',
  uk: '🇺🇦 Українська',
  es: '🇪🇸 Español',
  de: '🇩🇪 Deutsch',
  fr: '🇫🇷 Français',
};

export function CampaignDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hapticFeedback, hapticNotification } = useTelegram();
  const { t, translateCategory } = useTranslation();

  const getCategoryLabel = (cat: string): string => {
    const emoji: Record<string, string> = {
      technology: '💻',
      business: '💼',
      entertainment: '🎬',
      news: '📰',
      crypto: '₿',
      lifestyle: '🌟',
    };
    const key = cat.toLowerCase();
    return `${emoji[key] || ''} ${translateCategory(cat)}`.trim();
  };

  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const response = await api.get<Campaign>(`/campaigns/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  const { data: deals, isLoading: dealsLoading } = useQuery({
    queryKey: ['campaign-deals', id],
    queryFn: async () => {
      const response = await api.get<{ items: Deal[] }>(`/deals?campaignId=${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/campaigns/${id}`);
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      navigate('/campaigns');
    },
    onError: () => hapticNotification?.('error'),
  });

  const handleDelete = () => {
    if (confirm(t.ui.confirmDelete)) {
      hapticFeedback?.('medium');
      deleteMutation.mutate();
    }
  };

  const getProgress = () => {
    if (!campaign) return 0;
    const spent = parseFloat(campaign.spentBudget) || 0;
    const total = parseFloat(campaign.totalBudget) || 1;
    return Math.min((spent / total) * 100, 100);
  };

  if (isLoading) {
    return (
      <PageTransition>
        <div className="p-4">
          <div className="h-8 w-32 skeleton rounded-lg mb-4" />
          <div className="h-48 skeleton rounded-2xl mb-4" />
          <div className="h-32 skeleton rounded-2xl" />
        </div>
      </PageTransition>
    );
  }

  if (error || !campaign) {
    return (
      <PageTransition>
        <div className="p-4">
          <Card className="text-center py-12">
            <p className="text-red-500 font-medium">{t.ui.notFound}</p>
            <Button variant="secondary" className="mt-4" onClick={() => navigate('/campaigns')}>
              <ArrowLeft size={18} /> {t.ui.back}
            </Button>
          </Card>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-4 pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-4"
        >
          <button
            onClick={() => {
              hapticFeedback?.('light');
              navigate('/campaigns');
            }}
            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{campaign.title}</h1>
            <p className="text-sm text-tg-hint">
              {t.ui.created} {new Date(campaign.createdAt).toLocaleDateString()}
            </p>
          </div>
          <StatusBadge status={campaign.status} />
        </motion.div>

        <StaggerContainer className="space-y-4">
          {/* Budget Card */}
          <StaggerItem>
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-accent/20 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-cyan-400 flex items-center justify-center">
                    <Wallet size={20} className="text-white" />
                  </div>
                  <span className="font-semibold">{t.campaigns.budget}</span>
                </div>

                <div className="flex justify-between items-end mb-2">
                  <div>
                    <p className="text-3xl font-bold text-accent">{campaign.spentBudget}</p>
                    <p className="text-sm text-tg-hint">of {campaign.totalBudget} TON</p>
                  </div>
                  <p className="text-lg font-semibold">{getProgress().toFixed(0)}%</p>
                </div>

                {/* Progress Bar */}
                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-cyan-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${getProgress()}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
              </div>
            </Card>
          </StaggerItem>

          {/* Description */}
          {campaign.description && (
            <StaggerItem>
              <Card>
                <h3 className="font-semibold mb-2">{t.ui.description}</h3>
                <p className="text-tg-hint">{campaign.description}</p>
              </Card>
            </StaggerItem>
          )}

          {/* Targets */}
          <StaggerItem>
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Target size={18} className="text-accent" />
                <h3 className="font-semibold">{t.ui.targetCategories}</h3>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {campaign.categories.map((cat) => (
                  <span key={cat} className="px-3 py-1.5 rounded-xl bg-white/5 text-sm">
                    {getCategoryLabel(cat)}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Globe size={18} className="text-accent" />
                <h3 className="font-semibold">{t.ui.targetLanguages}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {campaign.targetLanguages.map((lang) => (
                  <span key={lang} className="px-3 py-1.5 rounded-xl bg-white/5 text-sm">
                    {languageLabels[lang] || lang}
                  </span>
                ))}
              </div>
            </Card>
          </StaggerItem>

          {/* Stats */}
          <StaggerItem>
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={18} className="text-accent" />
                <h3 className="font-semibold">{t.profile.statistics}</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-xl bg-white/5">
                  <p className="text-2xl font-bold">{campaign.dealsCount}</p>
                  <p className="text-xs text-tg-hint">{t.profile.deals}</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-white/5">
                  <p className="text-2xl font-bold text-accent">{campaign.spentBudget}</p>
                  <p className="text-xs text-tg-hint">{t.profile.spent}</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-white/5">
                  <p className="text-2xl font-bold text-green-400">
                    {(parseFloat(campaign.totalBudget) - parseFloat(campaign.spentBudget)).toFixed(2)}
                  </p>
                  <p className="text-xs text-tg-hint">{t.ui.remaining}</p>
                </div>
              </div>
            </Card>
          </StaggerItem>

          {/* Deals */}
          <StaggerItem>
            <Card>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Megaphone size={18} className="text-accent" />
                  <h3 className="font-semibold">{t.profile.deals}</h3>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    hapticFeedback?.('light');
                    navigate(`/channels`);
                  }}
                >
                  <Plus size={16} /> {t.ui.addDeal}
                </Button>
              </div>

              {dealsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 skeleton rounded-xl" />
                  ))}
                </div>
              ) : deals?.items.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-14 h-14 mx-auto rounded-xl bg-white/5 flex items-center justify-center mb-3">
                    <Megaphone size={24} className="text-white/20" />
                  </div>
                  <p className="text-sm text-tg-hint">{t.ui.noDeals}</p>
                  <p className="text-xs text-tg-hint mt-1">{t.ui.browseChannels}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {deals?.items.map((deal) => (
                    <div
                      key={deal.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/5"
                    >
                      <div>
                        <p className="font-medium">{deal.channelTitle}</p>
                        {deal.channelUsername && (
                          <p className="text-sm text-accent">@{deal.channelUsername}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{deal.amount} TON</p>
                        <StatusBadge status={deal.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </StaggerItem>

          {/* Actions */}
          <StaggerItem>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                fullWidth
                onClick={handleDelete}
                loading={deleteMutation.isPending}
                className="!text-red-400"
              >
                <Trash2 size={18} /> {t.ui.delete}
              </Button>
            </div>
          </StaggerItem>
        </StaggerContainer>
      </div>
    </PageTransition>
  );
}
