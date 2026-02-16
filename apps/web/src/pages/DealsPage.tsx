import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, CheckCircle, AlertCircle, XCircle, DollarSign, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, StatusBadge, CardSkeleton, PageTransition, SegmentedControl, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

interface Deal {
  id: string;
  amount: string;
  status: string;
  campaignId: string;
  channelId: string;
  createdAt: string;
}

interface PaginatedDeals {
  items: Deal[];
  total: number;
}

const statusIcons: Record<string, { icon: typeof CheckCircle; color: string; bgColor: string }> = {
  // New statuses
  PENDING: { icon: Clock, color: 'text-tg-warning', bgColor: 'bg-tg-warning/10' },
  SCHEDULED: { icon: DollarSign, color: 'text-tg-link', bgColor: 'bg-tg-link/10' },
  POSTED: { icon: CheckCircle, color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  RELEASED: { icon: CheckCircle, color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  DISPUTED: { icon: AlertCircle, color: 'text-tg-error', bgColor: 'bg-tg-error/10' },
  REFUNDED: { icon: DollarSign, color: 'text-tg-link', bgColor: 'bg-tg-link/10' },
  CANCELLED: { icon: XCircle, color: 'text-tg-text-secondary', bgColor: 'bg-tg-bg-secondary' },
  EXPIRED: { icon: XCircle, color: 'text-tg-text-secondary', bgColor: 'bg-tg-bg-secondary' },
  // Legacy statuses
  DRAFT: { icon: FileText, color: 'text-tg-text-secondary', bgColor: 'bg-tg-bg-secondary' },
  AWAITING_DEPOSIT: { icon: Clock, color: 'text-tg-warning', bgColor: 'bg-tg-warning/10' },
  FUNDED: { icon: DollarSign, color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  CONTENT_PENDING: { icon: FileText, color: 'text-tg-link', bgColor: 'bg-tg-link/10' },
  CONTENT_SUBMITTED: { icon: FileText, color: 'text-tg-link', bgColor: 'bg-tg-link/10' },
  CONTENT_APPROVED: { icon: CheckCircle, color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  VERIFIED: { icon: CheckCircle, color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  AWAITING_VERIFICATION: { icon: Clock, color: 'text-tg-warning', bgColor: 'bg-tg-warning/10' },
};

export function DealsPage() {
  const [role, setRole] = useState<'advertiser' | 'channel_owner'>('advertiser');
  const { hapticFeedback, hapticSelection } = useTelegram();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data, isLoading, error } = useQuery({
    queryKey: ['deals', role],
    queryFn: async () => {
      const response = await api.get<PaginatedDeals>(`/deals?role=${role}`);
      return response.data;
    },
  });

  return (
    <PageTransition>
      <div className="p-4">
        <h1 className="text-xl font-bold text-tg-text mb-4">
          {t.deals.title}
        </h1>

        <SegmentedControl
          options={[
            { value: 'advertiser', label: t.deals.outgoing },
            { value: 'channel_owner', label: t.deals.incoming },
          ]}
          value={role}
          onChange={(v) => { hapticSelection?.(); setRole(v as 'advertiser' | 'channel_owner'); }}
          className="mb-4"
        />

        {isLoading && <div className="space-y-3">{[1, 2, 3].map((i) => <CardSkeleton key={i} />)}</div>}

        {error && (
          <Card className="text-center py-8">
            <AlertCircle size={36} className="mx-auto text-tg-error mb-2" />
            <p className="font-medium text-tg-error">{t.errors.failedToLoad}</p>
          </Card>
        )}

        {data && data.items.length === 0 && (
          <Card className="text-center py-10">
            <div className="w-14 h-14 mx-auto rounded-tg-md bg-tg-bg-secondary flex items-center justify-center mb-4">
              <FileText size={28} className="text-tg-text-secondary" />
            </div>
            <p className="font-semibold text-tg-text">{t.deals.noDeals}</p>
            <p className="text-sm text-tg-text-secondary mt-1">{t.campaigns.createFirst}</p>
          </Card>
        )}

        <StaggerContainer className="space-y-3">
          {data?.items.map((deal) => {
            const iconConfig = statusIcons[deal.status] || statusIcons.DRAFT;
            const Icon = iconConfig.icon;
            return (
              <StaggerItem key={deal.id}>
                <Card>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-tg ${iconConfig.bgColor} flex items-center justify-center`}>
                        <Icon size={20} className={iconConfig.color} />
                      </div>
                      <div>
                        <StatusBadge status={deal.status} />
                        <p className="text-xs text-tg-text-secondary mt-1">ID: {deal.id.slice(0, 8)}...</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-tg-link">{deal.amount}</p>
                      <p className="text-xs text-tg-text-secondary">TON</p>
                    </div>
                  </div>
                  <p className="text-sm text-tg-text-secondary mb-3">
                    Created: {new Date(deal.createdAt).toLocaleDateString()}
                  </p>
                  <Button
                    variant="secondary"
                    fullWidth
                    size="sm"
                    onClick={() => {
                      hapticFeedback?.('light');
                      navigate(`/deals/${deal.id}`);
                    }}
                  >
                    {t.ui.viewDetails} <ChevronRight size={16} />
                  </Button>
                </Card>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </PageTransition>
  );
}
