import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { FileText, Users, ChevronLeft, ChevronRight, Globe, Tag, Search } from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, CardSkeleton, PageTransition, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';
import { ApplyToBriefModal } from '../components/ApplyToBriefModal';
import { BriefDetailModal } from '../components/BriefDetailModal';

interface PublicCampaign {
  id: string;
  title: string;
  description?: string;
  totalBudget: string;
  categories: string[];
  targetLanguages: string[];
  briefText?: string;
  requirements?: string;
  isPublic: boolean;
  minSubscribers?: number;
  maxBudgetPerDeal?: string;
  advertiserUsername?: string;
  dealsCount: number;
  createdAt: string;
}

interface PaginatedPublicCampaigns {
  items: PublicCampaign[];
  total: number;
  page: number;
  totalPages: number;
}

const CATEGORIES = [
  { id: 'technology', emoji: '💻' },
  { id: 'business', emoji: '💼' },
  { id: 'entertainment', emoji: '🎬' },
  { id: 'news', emoji: '📰' },
  { id: 'crypto', emoji: '₿' },
  { id: 'lifestyle', emoji: '🌟' },
] as const;

const LANGUAGES = [
  { id: 'en', flag: '🇬🇧' },
  { id: 'ru', flag: '🇷🇺' },
  { id: 'uk', flag: '🇺🇦' },
  { id: 'es', flag: '🇪🇸' },
  { id: 'de', flag: '🇩🇪' },
  { id: 'fr', flag: '🇫🇷' },
] as const;

const LIMIT = 10;

export function BriefsPage() {
  const [page, setPage] = useState(1);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'budget_high' | 'budget_low'>('newest');
  const [previewCampaign, setPreviewCampaign] = useState<PublicCampaign | null>(null);
  const [applyingCampaign, setApplyingCampaign] = useState<PublicCampaign | null>(null);

  const { hapticFeedback, hapticSelection } = useTelegram();
  const { t, translateCategory } = useTranslation();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-campaigns', page, selectedCategories, selectedLanguages, debouncedSearch, sortBy],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(LIMIT));
      selectedCategories.forEach((c) => params.append('categories[]', c));
      selectedLanguages.forEach((l) => params.append('targetLanguages[]', l));
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (sortBy !== 'newest') params.set('sortBy', sortBy);
      const response = await api.get<PaginatedPublicCampaigns>(`/campaigns/public?${params}`);
      return response.data;
    },
  });

  const toggleCategory = (catId: string) => {
    hapticSelection?.();
    setPage(1);
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId],
    );
  };

  const toggleLanguage = (langId: string) => {
    hapticSelection?.();
    setPage(1);
    setSelectedLanguages((prev) =>
      prev.includes(langId) ? prev.filter((l) => l !== langId) : [...prev, langId],
    );
  };

  const handleSortChange = (sort: 'newest' | 'budget_high' | 'budget_low') => {
    hapticSelection?.();
    setSortBy(sort);
    setPage(1);
  };

  return (
    <PageTransition>
      <div className="p-4">
        {/* Header */}
        <h1 className="text-xl font-bold text-tg-text mb-4">
          {t.briefs.title}
        </h1>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-tg-text-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.briefs.searchPlaceholder}
            className="w-full pl-10 pr-4 py-2.5 rounded-tg bg-tg-bg-secondary text-sm text-tg-text placeholder-tg-text-secondary focus:outline-none focus:ring-1 focus:ring-tg-link"
          />
        </div>

        {/* Sort Chips */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 mb-2">
          {([
            { key: 'newest' as const, label: t.briefs.sortNewest },
            { key: 'budget_high' as const, label: t.briefs.sortBudgetHigh },
            { key: 'budget_low' as const, label: t.briefs.sortBudgetLow },
          ]).map((s) => (
            <motion.button
              key={s.key}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleSortChange(s.key)}
              className={`px-3 py-1.5 rounded-tg text-xs whitespace-nowrap font-medium transition-all duration-150 ${
                sortBy === s.key
                  ? 'tg-btn-primary'
                  : 'tg-btn-secondary text-tg-text-secondary'
              }`}
            >
              {s.label}
            </motion.button>
          ))}
        </div>

        {/* Category Filter Chips */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 mb-2">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategories.includes(cat.id);
            return (
              <motion.button
                key={cat.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleCategory(cat.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-tg text-sm whitespace-nowrap font-medium transition-all duration-150 ${
                  isActive
                    ? 'tg-btn-primary'
                    : 'tg-btn-secondary text-tg-text-secondary'
                }`}
              >
                <span>{cat.emoji}</span>
                <span>{translateCategory(cat.id)}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Language Filter Chips */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-3 mb-4">
          {LANGUAGES.map((lang) => {
            const isActive = selectedLanguages.includes(lang.id);
            return (
              <motion.button
                key={lang.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => toggleLanguage(lang.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-tg text-xs whitespace-nowrap font-medium transition-all duration-150 ${
                  isActive
                    ? 'tg-btn-primary'
                    : 'tg-btn-secondary text-tg-text-secondary'
                }`}
              >
                <span>{lang.flag}</span>
                <span>{lang.id.toUpperCase()}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <Card className="text-center py-8">
            <p className="text-tg-error font-medium">{t.errors.failedToLoad}</p>
          </Card>
        )}

        {/* Empty State */}
        {data && data.items.length === 0 && (
          <Card className="text-center py-10">
            <div className="w-14 h-14 mx-auto rounded-tg-md bg-tg-bg-secondary flex items-center justify-center mb-4">
              <FileText size={28} className="text-tg-text-secondary" />
            </div>
            <p className="font-semibold text-tg-text">{t.briefs.noPublicBriefs}</p>
            <p className="text-sm text-tg-text-secondary mt-1">{t.briefs.browseBriefs}</p>
          </Card>
        )}

        {/* Campaign Brief Cards */}
        <StaggerContainer className="space-y-3">
          {data?.items.map((campaign) => (
            <StaggerItem key={campaign.id}>
              <Card>
                {/* Clickable body for preview */}
                <div
                  className="cursor-pointer"
                  onClick={() => {
                    hapticFeedback?.('light');
                    setPreviewCampaign(campaign);
                  }}
                >
                  <div className="mb-3">
                    <h3 className="font-semibold text-tg-text">{campaign.title}</h3>
                    {campaign.briefText && (
                      <p className="text-sm text-tg-text-secondary mt-1 line-clamp-2">
                        {campaign.briefText}
                      </p>
                    )}
                  </div>

                  {/* Budget */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg font-bold text-tg-link">{campaign.totalBudget}</span>
                    <span className="text-sm text-tg-text-secondary">TON</span>
                  </div>

                  {/* Categories */}
                  {campaign.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {campaign.categories.map((cat) => (
                        <span key={cat} className="tg-badge capitalize">
                          <Tag size={12} className="inline mr-1" />
                          {translateCategory(cat)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Target Languages */}
                  {campaign.targetLanguages.length > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-tg-text-secondary mb-3">
                      <Globe size={14} />
                      <span>{campaign.targetLanguages.join(', ')}</span>
                    </div>
                  )}

                  {/* Min Subscribers */}
                  {campaign.minSubscribers != null && campaign.minSubscribers > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-tg-text-secondary mb-2">
                      <Users size={14} />
                      <span>{t.briefs.minSubscribers}: {campaign.minSubscribers.toLocaleString()}</span>
                    </div>
                  )}

                  {/* Max Budget Per Deal */}
                  {campaign.maxBudgetPerDeal && (
                    <div className="text-sm text-tg-text-secondary mb-3">
                      {t.briefs.maxBudgetPerDeal}: {campaign.maxBudgetPerDeal} TON
                    </div>
                  )}

                  {/* Requirements */}
                  {campaign.requirements && (
                    <div className="text-sm text-tg-text-secondary mb-3 p-2 rounded-tg bg-tg-bg-secondary">
                      <span className="font-medium">{t.briefs.requirements}:</span> {campaign.requirements}
                    </div>
                  )}
                </div>

                {/* Apply Button */}
                <Button
                  variant="primary"
                  fullWidth
                  size="sm"
                  onClick={() => {
                    hapticFeedback?.('medium');
                    setApplyingCampaign(campaign);
                  }}
                >
                  {t.briefs.apply}
                </Button>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => {
                hapticFeedback?.('light');
                setPage((p) => Math.max(1, p - 1));
              }}
            >
              <ChevronLeft size={16} />
            </Button>
            <span className="text-sm text-tg-text-secondary">
              {t.common.page} {data.page} {t.common.of} {data.totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => {
                hapticFeedback?.('light');
                setPage((p) => p + 1);
              }}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewCampaign && (
        <BriefDetailModal
          isOpen={true}
          onClose={() => setPreviewCampaign(null)}
          campaign={previewCampaign}
          onApply={() => {
            const campaign = previewCampaign;
            setPreviewCampaign(null);
            setApplyingCampaign(campaign);
          }}
        />
      )}

      {/* Apply Modal */}
      {applyingCampaign && (
        <ApplyToBriefModal
          isOpen={true}
          onClose={() => setApplyingCampaign(null)}
          campaign={applyingCampaign}
        />
      )}
    </PageTransition>
  );
}
