import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Megaphone, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, StatusBadge, CardSkeleton, PageTransition, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { AddCampaignModal } from '../components/AddCampaignModal';
import { useTranslation } from '../i18n';

interface Campaign {
  id: string;
  title: string;
  description?: string;
  totalBudget: string;
  spentBudget: string;
  status: string;
  dealsCount: number;
}

interface PaginatedCampaigns {
  items: Campaign[];
  total: number;
}

export function CampaignsPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const { hapticFeedback } = useTelegram();
  const { t } = useTranslation();

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const response = await api.get<PaginatedCampaigns>('/campaigns');
      return response.data;
    },
  });

  const getProgress = (spent: string, total: string) => {
    const s = parseFloat(spent) || 0;
    const t = parseFloat(total) || 1;
    return Math.min((s / t) * 100, 100);
  };

  return (
    <PageTransition>
      <div className="p-4">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold text-tg-text">{t.campaigns.title}</h1>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              hapticFeedback?.('medium');
              setShowAddModal(true);
            }}
          >
            <Plus size={18} /> {t.common.add}
          </Button>
        </motion.div>

        {isLoading && <div className="space-y-3">{[1, 2, 3].map((i) => <CardSkeleton key={i} />)}</div>}

        {error && (
          <Card className="text-center py-8">
            <p className="text-tg-error font-medium">{t.errors.failedToLoad}</p>
          </Card>
        )}

        {data && data.items.length === 0 && (
          <Card className="text-center py-10">
            <div className="w-14 h-14 mx-auto rounded-tg-md bg-tg-link/10 flex items-center justify-center mb-4">
              <Megaphone size={28} className="text-tg-link" />
            </div>
            <p className="font-semibold text-tg-text">{t.campaigns.noCampaigns}</p>
            <p className="text-sm text-tg-text-secondary mt-1 mb-4">{t.campaigns.createFirst}</p>
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              <Plus size={18} /> {t.campaigns.createCampaign}
            </Button>
          </Card>
        )}

        <StaggerContainer className="space-y-3">
          {data?.items.map((campaign) => (
            <StaggerItem key={campaign.id}>
              <Link to={`/campaigns/${campaign.id}`} onClick={() => hapticFeedback?.('light')}>
                <Card>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold text-tg-text">{campaign.title}</h3>
                      {campaign.description && (
                        <p className="text-sm text-tg-text-secondary line-clamp-1 mt-1">{campaign.description}</p>
                      )}
                    </div>
                    <StatusBadge status={campaign.status} />
                  </div>

                  <div className="flex justify-between text-sm text-tg-text-secondary mb-2">
                    <span>{t.campaigns.budget}: {campaign.spentBudget}/{campaign.totalBudget} TON</span>
                    <span>{campaign.dealsCount} {t.campaigns.dealsCount}</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-1.5 rounded-full bg-tg-bg-secondary overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-tg-link"
                      initial={{ width: 0 }}
                      animate={{ width: `${getProgress(campaign.spentBudget, campaign.totalBudget)}%` }}
                      transition={{ duration: 0.5, delay: 0.2 }}
                    />
                  </div>

                  <div className="flex items-center justify-end mt-3 text-sm text-tg-link">
                    {t.ui.viewDetails} <ChevronRight size={16} />
                  </div>
                </Card>
              </Link>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>

      <AddCampaignModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />
    </PageTransition>
  );
}
