import { Modal, Button } from './ui';
import { Globe, Users, Tag, Calendar } from 'lucide-react';
import { useTranslation } from '../i18n';

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

interface BriefDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: PublicCampaign;
  onApply: () => void;
}

export function BriefDetailModal({ isOpen, onClose, campaign, onApply }: BriefDetailModalProps) {
  const { t, translateCategory } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.briefs.briefDetails}>
      <div className="space-y-4">
        {/* Title + Advertiser + Date */}
        <div>
          <h2 className="text-lg font-bold text-tg-text">{campaign.title}</h2>
          <div className="flex items-center gap-3 mt-1">
            {campaign.advertiserUsername && (
              <span className="text-sm text-tg-text-secondary">
                {t.briefs.advertiser}: @{campaign.advertiserUsername}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-tg-text-secondary">
              <Calendar size={12} />
              {new Date(campaign.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Budget */}
        <div className="p-3 rounded-xl bg-white/5 border border-white/10">
          <p className="text-xs text-tg-hint mb-1 font-medium">{t.campaigns.budget}</p>
          <p className="text-xl font-bold text-tg-link">{campaign.totalBudget} TON</p>
        </div>

        {/* Brief Text (full, no line-clamp) */}
        {campaign.briefText && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs text-tg-hint mb-1 font-medium">{t.briefs.briefText}</p>
            <p className="text-sm whitespace-pre-wrap">{campaign.briefText}</p>
          </div>
        )}

        {/* Requirements */}
        {campaign.requirements && (
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs text-tg-hint mb-1 font-medium">{t.briefs.requirements}</p>
            <p className="text-sm whitespace-pre-wrap">{campaign.requirements}</p>
          </div>
        )}

        {/* Categories */}
        {campaign.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {campaign.categories.map((cat) => (
              <span key={cat} className="tg-badge capitalize">
                <Tag size={12} className="inline mr-1" />
                {translateCategory(cat)}
              </span>
            ))}
          </div>
        )}

        {/* Languages */}
        {campaign.targetLanguages.length > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-tg-text-secondary">
            <Globe size={14} />
            <span>{campaign.targetLanguages.join(', ')}</span>
          </div>
        )}

        {/* Min subscribers */}
        {campaign.minSubscribers != null && campaign.minSubscribers > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-tg-text-secondary">
            <Users size={14} />
            <span>{t.briefs.minSubscribers}: {campaign.minSubscribers.toLocaleString()}</span>
          </div>
        )}

        {/* Max budget per deal */}
        {campaign.maxBudgetPerDeal && (
          <div className="text-sm text-tg-text-secondary">
            {t.briefs.maxBudgetPerDeal}: {campaign.maxBudgetPerDeal} TON
          </div>
        )}

        {/* Applications count */}
        <div className="text-sm text-tg-text-secondary">
          {campaign.dealsCount} {t.briefs.applicationsCount}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="flex-1"
          >
            {t.briefs.goBack}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onApply}
            className="flex-1"
          >
            {t.briefs.applyNow}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
