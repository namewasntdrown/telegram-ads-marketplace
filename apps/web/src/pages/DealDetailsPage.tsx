import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Send,
  Ban,
  ExternalLink,
  FileText,
  Image,
  Calendar,
  Lock,
  Star,
} from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, StatusBadge, PageTransition, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { useAuthStore } from '../store/auth.store';
import { useTranslation } from '../i18n';
import { ReviewModal } from '../components/ReviewModal';

interface Deal {
  id: string;
  amount: string;
  platformFee: string;
  status: string;
  contentType: string;
  contentText?: string;
  contentMediaUrls: string[];
  postUrl?: string;
  scheduledPostTime?: string;
  actualPostTime?: string;
  minViewsRequired?: number;
  viewsAtVerification?: number;
  verificationDeadline?: string;
  disputeReason?: string;
  disputeDescription?: string;
  campaignId: string;
  channelId: string;
  advertiserId: string;
  channelOwnerId: string;
  channelTitle?: string;
  channelUsername?: string;
  campaignTitle?: string;
  createdAt: string;
  updatedAt: string;
}

const statusIndex: Record<string, number> = {
  PENDING: 0,
  SCHEDULED: 1,
  POSTED: 2,
  RELEASED: 3,
  // Legacy mapping
  DRAFT: 0,
  CONTENT_PENDING: 0,
  AWAITING_DEPOSIT: 0,
  FUNDED: 1,
  AWAITING_VERIFICATION: 2,
  VERIFIED: 3,
};

export function DealDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hapticFeedback, hapticNotification } = useTelegram();
  const { user } = useAuthStore();
  const { t, language } = useTranslation();

  // Status steps with translations
  const statusSteps = [
    { status: 'PENDING', label: t.dealDetails.stepRequest, icon: FileText },
    { status: 'SCHEDULED', label: t.dealDetails.stepApproved, icon: Lock },
    { status: 'POSTED', label: t.dealDetails.stepPosted, icon: Send },
    { status: 'RELEASED', label: t.dealDetails.stepReleased, icon: CheckCircle },
  ];

  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const { data: deal, isLoading, error } = useQuery({
    queryKey: ['deal', id],
    queryFn: async () => {
      const response = await api.get<Deal>(`/deals/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Channel owner approves deal (auto-locks funds + schedules posting)
  const approveMutation = useMutation({
    mutationFn: () => api.post(`/deals/${id}/approve`),
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
    onError: () => hapticNotification?.('error'),
  });

  // Channel owner rejects deal
  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/deals/${id}/reject`, { reason: rejectReason }),
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      setShowRejectForm(false);
    },
    onError: () => hapticNotification?.('error'),
  });

  // Advertiser cancels deal (only for PENDING)
  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/deals/${id}/cancel`),
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
    },
    onError: () => hapticNotification?.('error'),
  });

  const isAdvertiser = user?.id === deal?.advertiserId;
  const isChannelOwner = user?.id === deal?.channelOwnerId;
  const currentStep = statusIndex[deal?.status || ''] ?? 0;
  const channelTitle = deal?.channelTitle;
  const channelUsername = deal?.channelUsername;
  const campaignTitle = deal?.campaignTitle;

  // Calculate total with fee
  const totalAmount = deal ? (parseFloat(deal.amount) + parseFloat(deal.platformFee)).toFixed(2) : '0';

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

  if (error || !deal) {
    return (
      <PageTransition>
        <div className="p-4">
          <Card className="text-center py-12">
            <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
            <p className="text-red-500 font-medium">{t.dealDetails.dealNotFound}</p>
            <Button variant="secondary" className="mt-4" onClick={() => navigate('/deals')}>
              <ArrowLeft size={18} /> {t.dealDetails.back}
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
              navigate('/deals');
            }}
            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{t.dealDetails.title}</h1>
            <p className="text-sm text-tg-hint">ID: {deal.id.slice(0, 12)}...</p>
          </div>
          <StatusBadge status={deal.status} />
        </motion.div>

        <StaggerContainer className="space-y-4">
          {/* Progress Steps */}
          <StaggerItem>
            <Card>
              <h3 className="font-semibold mb-4">{t.dealDetails.progress}</h3>
              <div className="flex justify-between relative">
                {/* Progress Line */}
                <div className="absolute top-5 left-0 right-0 h-0.5 bg-white/10" />
                <div
                  className="absolute top-5 left-0 h-0.5 bg-accent transition-all duration-500"
                  style={{ width: `${(currentStep / (statusSteps.length - 1)) * 100}%` }}
                />

                {statusSteps.map((step, index) => {
                  const Icon = step.icon;
                  const isCompleted = index <= currentStep;
                  const isCurrent = index === currentStep;
                  return (
                    <div key={step.status} className="flex flex-col items-center relative z-10">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        isCompleted
                          ? 'bg-accent text-white'
                          : 'bg-white/10 text-tg-hint'
                      } ${isCurrent ? 'ring-2 ring-accent ring-offset-2 ring-offset-tg-bg' : ''}`}>
                        <Icon size={18} />
                      </div>
                      <span className={`text-xs mt-2 ${isCompleted ? 'text-accent' : 'text-tg-hint'}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </StaggerItem>

          {/* Amount */}
          <StaggerItem>
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-accent/20 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 blur-xl" />
              <div className="relative flex justify-between items-center">
                <div>
                  <p className="text-sm text-tg-hint">{t.dealDetails.dealAmount}</p>
                  <p className="text-3xl font-bold text-accent">{deal.amount} TON</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-tg-hint">{t.dealDetails.fee}</p>
                  <p className="text-lg font-semibold">{deal.platformFee} TON</p>
                  <p className="text-xs text-tg-hint mt-1">{t.dealDetails.total}: {totalAmount} TON</p>
                </div>
              </div>
            </Card>
          </StaggerItem>

          {/* Scheduled Time */}
          {deal.scheduledPostTime && (
            <StaggerItem>
              <Card className="bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-3">
                  <Calendar size={24} className="text-amber-400" />
                  <div>
                    <p className="text-sm text-amber-400">{t.dealDetails.scheduledFor}</p>
                    <p className="font-semibold">{new Date(deal.scheduledPostTime).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')}</p>
                  </div>
                </div>
              </Card>
            </StaggerItem>
          )}

          {/* Channel & Campaign Info */}
          <StaggerItem>
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-accent-light/20 flex items-center justify-center text-lg font-bold text-accent">
                  {channelTitle?.[0] || '?'}
                </div>
                <div>
                  <p className="font-semibold">{channelTitle || t.dealDetails.loading}</p>
                  {channelUsername && (
                    <a
                      href={`https://t.me/${channelUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent flex items-center gap-1"
                    >
                      @{channelUsername} <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-white/5">
                <p className="text-xs text-tg-hint">{t.dealDetails.campaign}</p>
                <p className="font-medium">{campaignTitle || t.dealDetails.loading}</p>
              </div>
            </Card>
          </StaggerItem>

          {/* Ad Content Preview */}
          <StaggerItem>
            <Card>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                {deal.contentType === 'PHOTO' ? <Image size={18} /> : <FileText size={18} />}
                {t.dealDetails.adContent}
              </h3>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                {deal.contentMediaUrls && deal.contentMediaUrls.length > 0 && (
                  <div className="mb-3">
                    <img
                      src={deal.contentMediaUrls[0]}
                      alt="Ad"
                      className="rounded-lg max-h-48 object-cover"
                    />
                  </div>
                )}
                <p className="text-sm whitespace-pre-wrap">{deal.contentText || t.dealDetails.noText}</p>
              </div>
            </Card>
          </StaggerItem>

          {/* Post URL (if posted) */}
          {deal.postUrl && (
            <StaggerItem>
              <Card>
                <h3 className="font-semibold mb-2">{t.dealDetails.postLink}</h3>
                <a
                  href={deal.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-3 rounded-xl bg-accent/10 text-accent"
                >
                  <ExternalLink size={18} />
                  {t.dealDetails.openPost}
                </a>
              </Card>
            </StaggerItem>
          )}

          {/* Actions for Advertiser */}
          {isAdvertiser && (
            <StaggerItem>
              <Card>
                <h3 className="font-semibold mb-3">{t.dealDetails.yourActions}</h3>

                {/* PENDING - waiting for channel owner */}
                {deal.status === 'PENDING' && (
                  <div className="text-center py-4">
                    <Clock size={32} className="mx-auto text-amber-500 mb-2" />
                    <p className="font-medium">{t.dealDetails.waitingForApproval}</p>
                    <p className="text-sm text-tg-hint mt-1">{t.dealDetails.channelOwnerReviewing}</p>
                    <p className="text-xs text-tg-hint mt-2">
                      {t.dealDetails.afterApprovalFundsLocked.replace('{amount}', totalAmount)}
                    </p>
                  </div>
                )}

                {/* SCHEDULED - approved, waiting for posting */}
                {deal.status === 'SCHEDULED' && (
                  <div className="text-center py-4">
                    <Lock size={32} className="mx-auto text-green-500 mb-2" />
                    <p className="font-semibold text-green-500">{t.dealDetails.approved}!</p>
                    <p className="text-sm text-tg-hint mt-1">
                      {t.dealDetails.fundsLockedPostScheduled} {deal.scheduledPostTime
                        ? new Date(deal.scheduledPostTime).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')
                        : t.dealDetails.soon}
                    </p>
                  </div>
                )}

                {/* POSTED */}
                {deal.status === 'POSTED' && (
                  <div className="text-center py-4">
                    <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                    <p className="font-semibold text-green-500">{t.dealDetails.adPublishedSuccess}</p>
                    {deal.verificationDeadline && (
                      <p className="text-sm text-tg-hint mt-1">
                        {t.dealDetails.fundsWillBePaidAfterVerification}
                      </p>
                    )}
                  </div>
                )}

                {/* RELEASED */}
                {deal.status === 'RELEASED' && (
                  <div className="text-center py-4">
                    <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                    <p className="font-semibold text-green-500">{t.dealDetails.dealCompleted}</p>
                    <p className="text-sm text-tg-hint mt-1">{t.dealDetails.fundsPaidToOwner}</p>

                    {/* Review button for advertiser */}
                    <Button
                      variant="secondary"
                      className="mt-4"
                      onClick={() => {
                        hapticFeedback?.('light');
                        setShowReviewModal(true);
                      }}
                    >
                      <Star size={18} />
                      {t.reviews.leaveReview}
                    </Button>
                  </div>
                )}

                {/* CANCELLED */}
                {deal.status === 'CANCELLED' && (
                  <div className="text-center py-4">
                    <XCircle size={32} className="mx-auto text-red-500 mb-2" />
                    <p className="font-semibold text-red-500">{t.dealDetails.dealCancelled}</p>
                  </div>
                )}

                {/* DISPUTED */}
                {deal.status === 'DISPUTED' && (
                  <div className="text-center py-4">
                    <AlertCircle size={32} className="mx-auto text-amber-500 mb-2" />
                    <p className="font-semibold text-amber-500">{t.dealDetails.disputeOpened}</p>
                    <p className="text-sm text-tg-hint mt-1">{t.dealDetails.waitingForAdmin}</p>
                  </div>
                )}
              </Card>
            </StaggerItem>
          )}

          {/* Actions for Channel Owner */}
          {isChannelOwner && (
            <StaggerItem>
              <Card>
                <h3 className="font-semibold mb-3">{t.dealDetails.yourActions}</h3>

                {/* PENDING - approve or reject */}
                {deal.status === 'PENDING' && (
                  <div className="space-y-3">
                    <p className="text-sm text-tg-hint">
                      {t.dealDetails.reviewAdContent}
                    </p>

                    <div className="p-3 rounded-xl bg-accent/10 border border-accent/20">
                      <p className="text-sm text-accent">
                        {t.dealDetails.onApprovalFundsLocked.replace('{amount}', totalAmount)}
                      </p>
                    </div>

                    {showRejectForm ? (
                      <div className="space-y-3">
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder={t.dealDetails.rejectReason}
                          rows={3}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none"
                        />
                        <div className="flex gap-2">
                          <Button variant="secondary" fullWidth onClick={() => setShowRejectForm(false)}>
                            {t.dealDetails.cancel}
                          </Button>
                          <Button
                            variant="primary"
                            fullWidth
                            loading={rejectMutation.isPending}
                            onClick={() => rejectMutation.mutate()}
                            className="!bg-red-500"
                          >
                            {t.dealDetails.reject}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          fullWidth
                          onClick={() => setShowRejectForm(true)}
                        >
                          <XCircle size={18} />
                          {t.dealDetails.reject}
                        </Button>
                        <Button
                          variant="primary"
                          fullWidth
                          loading={approveMutation.isPending}
                          onClick={() => {
                            hapticFeedback?.('medium');
                            approveMutation.mutate();
                          }}
                        >
                          <CheckCircle size={18} />
                          {t.dealDetails.approve}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* SCHEDULED - approved, waiting for posting */}
                {deal.status === 'SCHEDULED' && (
                  <div className="text-center py-4">
                    <Clock size={32} className="mx-auto text-amber-500 mb-2" />
                    <p className="font-medium">{t.dealDetails.waitingForPublication}</p>
                    <p className="text-sm text-tg-hint mt-1">
                      {t.dealDetails.botWillPublish} {deal.scheduledPostTime
                        ? new Date(deal.scheduledPostTime).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US')
                        : t.dealDetails.soon}
                    </p>
                  </div>
                )}

                {/* POSTED */}
                {deal.status === 'POSTED' && (
                  <div className="text-center py-4">
                    <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                    <p className="font-semibold text-green-500">{t.dealDetails.adPublishedSuccess}</p>
                    <p className="text-sm text-tg-hint mt-1">
                      {t.dealDetails.youWillReceive} <span className="text-accent font-medium">{deal.amount} TON</span> {t.dealDetails.automatically}
                    </p>
                    {deal.verificationDeadline && (
                      <div className="mt-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                        <p className="text-sm text-green-400">
                          💰 {t.dealDetails.paymentDate}: {new Date(deal.verificationDeadline).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US', {
                            day: 'numeric',
                            month: 'long',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        <p className="text-xs text-tg-hint mt-1">
                          {t.dealDetails.fundsAfterVerification}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* RELEASED */}
                {deal.status === 'RELEASED' && (
                  <div className="text-center py-4">
                    <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                    <p className="font-semibold text-green-500">{t.dealDetails.paymentReceived}</p>
                    <p className="text-sm text-tg-hint mt-1">{deal.amount} {t.dealDetails.credited}</p>
                  </div>
                )}

                {/* CANCELLED */}
                {deal.status === 'CANCELLED' && (
                  <div className="text-center py-4">
                    <XCircle size={32} className="mx-auto text-red-500 mb-2" />
                    <p className="font-semibold text-red-500">{t.dealDetails.dealCancelled}</p>
                  </div>
                )}

                {/* DISPUTED */}
                {deal.status === 'DISPUTED' && (
                  <div className="text-center py-4">
                    <AlertCircle size={32} className="mx-auto text-amber-500 mb-2" />
                    <p className="font-semibold text-amber-500">{t.dealDetails.disputeOpened}</p>
                    <p className="text-sm text-tg-hint mt-1">{t.dealDetails.waitingForAdmin}</p>
                  </div>
                )}
              </Card>
            </StaggerItem>
          )}

          {/* Cancel Button (only for advertiser in PENDING status) */}
          {deal.status === 'PENDING' && isAdvertiser && (
            <StaggerItem>
              <Button
                variant="secondary"
                fullWidth
                loading={cancelMutation.isPending}
                onClick={() => {
                  if (confirm(t.dealDetails.confirmCancel)) {
                    hapticFeedback?.('medium');
                    cancelMutation.mutate();
                  }
                }}
                className="!text-red-400"
              >
                <Ban size={18} />
                {t.dealDetails.cancelRequest}
              </Button>
            </StaggerItem>
          )}
        </StaggerContainer>
      </div>

      {/* Review Modal */}
      {showReviewModal && deal && channelTitle && (
        <ReviewModal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          channelId={deal.channelId}
          channelTitle={channelTitle}
          dealId={deal.id}
        />
      )}
    </PageTransition>
  );
}
