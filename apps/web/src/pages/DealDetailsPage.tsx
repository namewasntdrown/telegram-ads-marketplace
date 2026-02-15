import { useState, useRef, useEffect } from 'react';
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
  Edit3,
  MessageCircle,
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
  appealDeadline?: string;
  briefText?: string;
  briefMediaUrls?: string[];
  draftContentText?: string;
  draftContentMediaUrls?: string[];
  contentRevisionNote?: string;
  contentRevisionCount?: number;
  adFormat?: string;
  createdAt: string;
  updatedAt: string;
}

interface DealMessage {
  id: string;
  dealId: string;
  senderId: string;
  senderName?: string;
  text: string;
  createdAt: string;
}

interface Appeal {
  id: string;
  type: string;
  status: string;
  reason: string;
  adminNotes?: string;
  originalResolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

const statusIndex: Record<string, number> = {
  PENDING: 0,
  CONTENT_PENDING: 1,
  CONTENT_SUBMITTED: 2,
  CONTENT_APPROVED: 3,
  SCHEDULED: 3,
  POSTED: 4,
  RELEASED: 5,
  // Legacy mapping
  DRAFT: 0,
  AWAITING_DEPOSIT: 0,
  FUNDED: 1,
  AWAITING_VERIFICATION: 4,
  VERIFIED: 5,
};

export function DealDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hapticFeedback, hapticNotification } = useTelegram();
  const { user } = useAuthStore();
  const { t, language } = useTranslation();

  // Status steps with translations (expanded for content approval)
  const statusSteps = [
    { status: 'PENDING', label: t.dealDetails.stepRequest, icon: FileText },
    { status: 'CONTENT_PENDING', label: t.dealDetails.stepContent, icon: Edit3 },
    { status: 'CONTENT_SUBMITTED', label: t.dealDetails.stepApprovedContent, icon: CheckCircle },
    { status: 'SCHEDULED', label: t.dealDetails.stepApproved, icon: Lock },
    { status: 'POSTED', label: t.dealDetails.stepPosted, icon: Send },
    { status: 'RELEASED', label: t.dealDetails.stepReleased, icon: CheckCircle },
  ];

  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState('CONTENT_NOT_POSTED');
  const [disputeDescription, setDisputeDescription] = useState('');
  const [showAppealForm, setShowAppealForm] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  // Content approval states
  const [draftContentText, setDraftContentText] = useState('');
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  // Messaging states
  const [messageText, setMessageText] = useState('');
  const [showMessages, setShowMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const disputeReasons = [
    { value: 'CONTENT_NOT_POSTED', label: t.dealDetails.disputeReasons?.contentNotPosted || 'Content not posted' },
    { value: 'WRONG_CONTENT', label: t.dealDetails.disputeReasons?.wrongContent || 'Wrong content posted' },
    { value: 'EARLY_DELETION', label: t.dealDetails.disputeReasons?.earlyDeletion || 'Post deleted early' },
    { value: 'FAKE_STATISTICS', label: t.dealDetails.disputeReasons?.fakeStatistics || 'Fake statistics' },
    { value: 'OTHER', label: t.dealDetails.disputeReasons?.other || 'Other' },
  ];

  const { data: deal, isLoading, error } = useQuery({
    queryKey: ['deal', id],
    queryFn: async () => {
      const response = await api.get<Deal>(`/deals/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Channel owner approves deal (auto-locks funds + schedules posting)
  const [approveError, setApproveError] = useState<string | null>(null);
  const approveMutation = useMutation({
    mutationFn: () => api.post(`/deals/${id}/approve`),
    onSuccess: () => {
      hapticNotification?.('success');
      setApproveError(null);
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (error: Error) => {
      hapticNotification?.('error');
      const msg = error.message || '';
      if (msg.startsWith('BOT_NOT_ADMIN:')) {
        const botName = msg.split(':')[1] || 'bot';
        setApproveError(botName);
      }
    },
  });

  // Channel owner rejects deal
  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/deals/${id}/reject`, { reason: rejectReason }),
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
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
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: () => hapticNotification?.('error'),
  });

  // Advertiser opens dispute (for SCHEDULED/POSTED deals)
  const disputeMutation = useMutation({
    mutationFn: () => api.post(`/deals/${id}/dispute`, { reason: disputeReason, description: disputeDescription }),
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      queryClient.invalidateQueries({ queryKey: ['deals'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setShowDisputeForm(false);
      setDisputeReason('CONTENT_NOT_POSTED');
      setDisputeDescription('');
    },
    onError: () => hapticNotification?.('error'),
  });

  // Query for existing appeal on this deal
  const { data: dealAppeal } = useQuery({
    queryKey: ['deal-appeal', id],
    queryFn: async () => {
      try {
        const response = await api.get<Appeal[]>('/appeals/my');
        return response.data.find((a) => a.type === 'DEAL_DISPUTE_RESOLUTION' && (a as any).dealId === id) ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!id && !!deal && (deal.status === 'RELEASED' || deal.status === 'REFUNDED'),
  });

  // File appeal mutation
  const appealMutation = useMutation({
    mutationFn: () => api.post('/appeals/deal', { dealId: id, reason: appealReason }),
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['deal-appeal', id] });
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      setShowAppealForm(false);
      setAppealReason('');
    },
    onError: () => hapticNotification?.('error'),
  });

  // Content approval mutations
  const submitContentMutation = useMutation({
    mutationFn: () => api.post(`/deals/${id}/submit-content`, { contentText: draftContentText }),
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      setDraftContentText('');
    },
    onError: () => hapticNotification?.('error'),
  });

  const approveContentMutation = useMutation({
    mutationFn: () => api.post(`/deals/${id}/approve-content`),
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
    },
    onError: () => hapticNotification?.('error'),
  });

  const rejectContentMutation = useMutation({
    mutationFn: () => api.post(`/deals/${id}/reject-content`, { revisionNote }),
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['deal', id] });
      setShowRevisionForm(false);
      setRevisionNote('');
    },
    onError: () => hapticNotification?.('error'),
  });

  // Messaging
  const { data: messagesData } = useQuery({
    queryKey: ['deal-messages', id],
    queryFn: async () => {
      const response = await api.get<{ items: DealMessage[]; total: number }>(`/deals/${id}/messages?limit=100`);
      return response.data;
    },
    enabled: !!id && showMessages,
    refetchInterval: showMessages ? 10000 : false,
  });

  const sendMessageMutation = useMutation({
    mutationFn: () => api.post(`/deals/${id}/messages`, { text: messageText }),
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['deal-messages', id] });
    },
    onError: () => hapticNotification?.('error'),
  });

  useEffect(() => {
    if (messagesData?.items?.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messagesData?.items?.length]);

  const isAdvertiser = user?.id === deal?.advertiserId;
  const isChannelOwner = user?.id === deal?.channelOwnerId;
  const currentStep = statusIndex[deal?.status || ''] ?? 0;
  const channelTitle = deal?.channelTitle;
  const channelUsername = deal?.channelUsername;
  const campaignTitle = deal?.campaignTitle;

  // Calculate total with fee
  const totalAmount = deal ? (parseFloat(deal.amount) + parseFloat(deal.platformFee)).toFixed(2) : '0';

  // Appeal window logic
  const hasAppealWindow = deal?.appealDeadline && new Date(deal.appealDeadline) > new Date();
  const isLosingParty = deal && (
    (deal.status === 'RELEASED' && isAdvertiser) ||
    (deal.status === 'REFUNDED' && isChannelOwner)
  );
  const isWinningParty = deal && (
    (deal.status === 'RELEASED' && isChannelOwner) ||
    (deal.status === 'REFUNDED' && isAdvertiser)
  );
  const canFileAppeal = hasAppealWindow && isLosingParty && !dealAppeal;

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

                {/* CONTENT_PENDING - waiting for channel owner to prepare content */}
                {deal.status === 'CONTENT_PENDING' && (
                  <div className="text-center py-4">
                    <Edit3 size={32} className="mx-auto text-amber-500 mb-2" />
                    <p className="font-medium">{t.dealDetails.contentPending}</p>
                    <p className="text-sm text-tg-hint mt-1">{t.dealDetails.ownerPreparingContent}</p>
                  </div>
                )}

                {/* CONTENT_SUBMITTED - advertiser reviews draft */}
                {deal.status === 'CONTENT_SUBMITTED' && (
                  <div className="space-y-3">
                    <p className="text-sm text-tg-hint">{t.dealDetails.reviewDraftContent}</p>

                    {/* Show draft content */}
                    {deal.draftContentText && (
                      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-xs text-tg-hint mb-1">{t.dealDetails.draftContent}</p>
                        <p className="text-sm whitespace-pre-wrap">{deal.draftContentText}</p>
                      </div>
                    )}

                    {showRevisionForm ? (
                      <div className="space-y-3">
                        <textarea
                          value={revisionNote}
                          onChange={(e) => setRevisionNote(e.target.value)}
                          placeholder={t.dealDetails.revisionNotePlaceholder}
                          rows={3}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none"
                        />
                        <div className="flex gap-2">
                          <Button variant="secondary" fullWidth onClick={() => setShowRevisionForm(false)}>
                            {t.dealDetails.cancel}
                          </Button>
                          <Button
                            variant="primary"
                            fullWidth
                            loading={rejectContentMutation.isPending}
                            disabled={!revisionNote.trim()}
                            onClick={() => rejectContentMutation.mutate()}
                            className="!bg-amber-500"
                          >
                            {t.dealDetails.requestRevision}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          fullWidth
                          onClick={() => setShowRevisionForm(true)}
                        >
                          <XCircle size={18} />
                          {t.dealDetails.requestRevision}
                        </Button>
                        <Button
                          variant="primary"
                          fullWidth
                          loading={approveContentMutation.isPending}
                          onClick={() => {
                            hapticFeedback?.('medium');
                            approveContentMutation.mutate();
                          }}
                        >
                          <CheckCircle size={18} />
                          {t.dealDetails.approveContent}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* CONTENT_APPROVED */}
                {deal.status === 'CONTENT_APPROVED' && (
                  <div className="text-center py-4">
                    <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                    <p className="font-semibold text-green-500">{t.dealDetails.contentApprovedScheduling}</p>
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

                    {approveError && (
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2">
                        <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
                        <div className="text-sm text-red-400">
                          <p className="font-medium">{t.dealDetails.botNotAdminTitle}</p>
                          <p className="mt-1">{t.dealDetails.botNotAdminMessage.replace('{bot}', approveError)}</p>
                        </div>
                      </div>
                    )}

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

                {/* CONTENT_PENDING - channel owner submits content */}
                {deal.status === 'CONTENT_PENDING' && (
                  <div className="space-y-3">
                    {/* Show brief from advertiser */}
                    {deal.briefText && (
                      <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
                        <p className="text-xs text-accent mb-1">{t.dealDetails.briefFromAdvertiser}</p>
                        <p className="text-sm whitespace-pre-wrap">{deal.briefText}</p>
                      </div>
                    )}

                    {/* Show revision note if any */}
                    {deal.contentRevisionNote && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <p className="text-xs text-amber-400 mb-1">{t.dealDetails.revisionNote} ({t.dealDetails.revisionCount}: {deal.contentRevisionCount})</p>
                        <p className="text-sm">{deal.contentRevisionNote}</p>
                      </div>
                    )}

                    <textarea
                      value={draftContentText}
                      onChange={(e) => setDraftContentText(e.target.value)}
                      placeholder={t.dealDetails.draftContentPlaceholder}
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none"
                    />
                    <Button
                      variant="primary"
                      fullWidth
                      loading={submitContentMutation.isPending}
                      disabled={!draftContentText.trim()}
                      onClick={() => {
                        hapticFeedback?.('medium');
                        submitContentMutation.mutate();
                      }}
                    >
                      <Send size={18} />
                      {t.dealDetails.submitContent}
                    </Button>
                  </div>
                )}

                {/* CONTENT_SUBMITTED - waiting for advertiser review */}
                {deal.status === 'CONTENT_SUBMITTED' && (
                  <div className="text-center py-4">
                    <Clock size={32} className="mx-auto text-amber-500 mb-2" />
                    <p className="font-medium">{t.dealDetails.contentSubmitted}</p>
                    <p className="text-sm text-tg-hint mt-1">{t.dealDetails.waitingForApproval}</p>
                  </div>
                )}

                {/* CONTENT_APPROVED */}
                {deal.status === 'CONTENT_APPROVED' && (
                  <div className="text-center py-4">
                    <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
                    <p className="font-semibold text-green-500">{t.dealDetails.contentApprovedScheduling}</p>
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

          {/* Dispute Reason (when deal is disputed) */}
          {deal.status === 'DISPUTED' && deal.disputeReason && (
            <StaggerItem>
              <Card className="bg-amber-500/10 border border-amber-500/20">
                <h3 className="font-semibold mb-2 text-amber-400">{t.dealDetails.disputeReasonLabel}</h3>
                <p className="text-sm">{deal.disputeReason}</p>
                {deal.disputeDescription && (
                  <p className="text-sm text-tg-hint mt-2">{deal.disputeDescription}</p>
                )}
              </Card>
            </StaggerItem>
          )}

          {/* Appeal Window Notice */}
          {hasAppealWindow && isWinningParty && !dealAppeal && (
            <StaggerItem>
              <Card className="bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-center gap-3">
                  <Clock size={24} className="text-amber-400" />
                  <div>
                    <p className="font-semibold text-amber-400">{t.appeals.windowTitle}</p>
                    <p className="text-sm text-tg-hint">{t.appeals.frozenNotice}</p>
                  </div>
                </div>
              </Card>
            </StaggerItem>
          )}

          {/* Appeal Form (for losing party within appeal window) */}
          {canFileAppeal && (
            <StaggerItem>
              {showAppealForm ? (
                <Card>
                  <h3 className="font-semibold mb-3">{t.appeals.fileAppeal}</h3>
                  <p className="text-sm text-tg-hint mb-3">{t.appeals.windowDescription}</p>
                  <textarea
                    value={appealReason}
                    onChange={(e) => setAppealReason(e.target.value)}
                    placeholder={t.appeals.reasonPlaceholder}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none mb-3"
                  />
                  <div className="flex gap-2">
                    <Button variant="secondary" fullWidth onClick={() => {
                      setShowAppealForm(false);
                      setAppealReason('');
                    }}>
                      {t.dealDetails.cancel}
                    </Button>
                    <Button
                      variant="primary"
                      fullWidth
                      loading={appealMutation.isPending}
                      disabled={!appealReason.trim()}
                      onClick={() => {
                        hapticFeedback?.('medium');
                        appealMutation.mutate();
                      }}
                    >
                      {t.appeals.submit}
                    </Button>
                  </div>
                </Card>
              ) : (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    hapticFeedback?.('light');
                    setShowAppealForm(true);
                  }}
                  className="!text-amber-400"
                >
                  <AlertCircle size={18} />
                  {t.appeals.fileAppeal}
                </Button>
              )}
            </StaggerItem>
          )}

          {/* Appeal Status (when appeal exists) */}
          {dealAppeal && (
            <StaggerItem>
              <Card className={`border ${
                dealAppeal.status === 'PENDING' ? 'bg-amber-500/10 border-amber-500/20' :
                dealAppeal.status === 'REVERSED' ? 'bg-green-500/10 border-green-500/20' :
                'bg-red-500/10 border-red-500/20'
              }`}>
                <h3 className="font-semibold mb-2">{t.appeals.appealStatus}</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {dealAppeal.status === 'PENDING' && <Clock size={16} className="text-amber-400" />}
                    {dealAppeal.status === 'REVERSED' && <CheckCircle size={16} className="text-green-400" />}
                    {dealAppeal.status === 'UPHELD' && <XCircle size={16} className="text-red-400" />}
                    <span className="font-medium">
                      {dealAppeal.status === 'PENDING' ? t.appeals.pending :
                       dealAppeal.status === 'REVERSED' ? t.appeals.reversed :
                       t.appeals.upheld}
                    </span>
                  </div>
                  <p className="text-sm text-tg-hint">{dealAppeal.reason}</p>
                  {dealAppeal.adminNotes && (
                    <div className="mt-2 p-3 rounded-xl bg-white/5">
                      <p className="text-xs text-tg-hint">{t.appeals.adminResponse}</p>
                      <p className="text-sm">{dealAppeal.adminNotes}</p>
                    </div>
                  )}
                </div>
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

          {/* Open Dispute Button (for advertiser on SCHEDULED/POSTED deals) */}
          {(deal.status === 'SCHEDULED' || deal.status === 'POSTED') && isAdvertiser && (
            <StaggerItem>
              {showDisputeForm ? (
                <Card>
                  <h3 className="font-semibold mb-3">{t.dealDetails.openDispute}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-tg-hint mb-2">{t.dealDetails.disputeReasonLabel}</label>
                      <select
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
                      >
                        {disputeReasons.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      value={disputeDescription}
                      onChange={(e) => setDisputeDescription(e.target.value)}
                      placeholder={t.dealDetails.disputeReasonPlaceholder}
                      rows={3}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none"
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button variant="secondary" fullWidth onClick={() => {
                      setShowDisputeForm(false);
                      setDisputeReason('CONTENT_NOT_POSTED');
                      setDisputeDescription('');
                    }}>
                      {t.dealDetails.cancel}
                    </Button>
                    <Button
                      variant="primary"
                      fullWidth
                      loading={disputeMutation.isPending}
                      disabled={!disputeDescription.trim()}
                      onClick={() => {
                        hapticFeedback?.('medium');
                        disputeMutation.mutate();
                      }}
                      className="!bg-amber-500"
                    >
                      {t.dealDetails.confirmDispute}
                    </Button>
                  </div>
                </Card>
              ) : (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    hapticFeedback?.('light');
                    setShowDisputeForm(true);
                  }}
                  className="!text-amber-400"
                >
                  <AlertCircle size={18} />
                  {t.dealDetails.openDispute}
                </Button>
              )}
            </StaggerItem>
          )}
          {/* Messaging Section */}
          {deal && !['CANCELLED', 'EXPIRED', 'REFUNDED', 'RELEASED'].includes(deal.status) && (
            <StaggerItem>
              <Card>
                <button
                  onClick={() => {
                    hapticFeedback?.('light');
                    setShowMessages(!showMessages);
                  }}
                  className="flex items-center justify-between w-full"
                >
                  <h3 className="font-semibold flex items-center gap-2">
                    <MessageCircle size={18} />
                    {t.messages.title}
                  </h3>
                  <span className="text-sm text-tg-hint">
                    {showMessages ? '−' : '+'}
                  </span>
                </button>

                {showMessages && (
                  <div className="mt-4">
                    {/* Messages list */}
                    <div className="max-h-64 overflow-y-auto space-y-2 mb-3">
                      {(!messagesData?.items || messagesData.items.length === 0) && (
                        <p className="text-sm text-tg-hint text-center py-4">{t.messages.noMessages}</p>
                      )}
                      {messagesData?.items?.map((msg) => {
                        const isOwn = msg.senderId === user?.id;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                                isOwn
                                  ? 'bg-accent/20 text-accent'
                                  : 'bg-white/5 text-tg-text'
                              }`}
                            >
                              {!isOwn && msg.senderName && (
                                <p className="text-xs text-tg-hint mb-0.5">{msg.senderName}</p>
                              )}
                              <p className="whitespace-pre-wrap">{msg.text}</p>
                              <p className="text-xs text-tg-hint mt-1 text-right">
                                {new Date(msg.createdAt).toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Message input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        placeholder={t.messages.messagePlaceholder}
                        className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && messageText.trim()) {
                            sendMessageMutation.mutate();
                          }
                        }}
                      />
                      <button
                        disabled={!messageText.trim() || sendMessageMutation.isPending}
                        onClick={() => sendMessageMutation.mutate()}
                        className="px-3 py-2 rounded-xl bg-accent text-white disabled:opacity-50"
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </Card>
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
