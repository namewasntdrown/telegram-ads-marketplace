import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bell, ChevronLeft, CheckCheck, Clock,
  MessageSquare, ShieldCheck, ShieldX, Megaphone,
  Wallet, AlertTriangle, XCircle, Timer, FolderPlus,
} from 'lucide-react';
import { api } from '../api/client';
import { PageTransition, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  data: Record<string, unknown> | null;
  createdAt: string;
}

interface NotificationsResponse {
  items: Notification[];
  total: number;
  unreadCount: number;
}

const typeConfig: Record<string, { icon: typeof Bell; color: string; bgColor: string }> = {
  DEAL_CREATED: { icon: MessageSquare, color: 'text-tg-link', bgColor: 'bg-tg-link/10' },
  DEAL_APPROVED: { icon: ShieldCheck, color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  DEAL_REJECTED: { icon: ShieldX, color: 'text-tg-error', bgColor: 'bg-tg-error/10' },
  DEAL_CANCELLED: { icon: XCircle, color: 'text-tg-text-secondary', bgColor: 'bg-tg-bg-secondary' },
  DEAL_POSTED: { icon: Megaphone, color: 'text-tg-link', bgColor: 'bg-tg-link/10' },
  DEAL_AUTO_RELEASED: { icon: Wallet, color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  DEAL_DISPUTED: { icon: AlertTriangle, color: 'text-tg-warning', bgColor: 'bg-tg-warning/10' },
  DEAL_RESOLVED_RELEASE: { icon: ShieldCheck, color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  DEAL_RESOLVED_REFUND: { icon: Wallet, color: 'text-tg-link', bgColor: 'bg-tg-link/10' },
  DEAL_EXPIRED: { icon: Timer, color: 'text-tg-text-secondary', bgColor: 'bg-tg-bg-secondary' },
  CHANNEL_APPROVED: { icon: ShieldCheck, color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  CHANNEL_REJECTED: { icon: ShieldX, color: 'text-tg-error', bgColor: 'bg-tg-error/10' },
  PLACEMENT_REQUESTED: { icon: FolderPlus, color: 'text-tg-link', bgColor: 'bg-tg-link/10' },
  PLACEMENT_APPROVED: { icon: ShieldCheck, color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  PLACEMENT_REJECTED: { icon: ShieldX, color: 'text-tg-error', bgColor: 'bg-tg-error/10' },
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин назад`;
  if (diffHrs < 24) return `${diffHrs} ч назад`;
  if (diffDays < 7) return `${diffDays} дн назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function NotificationsPage() {
  const { hapticFeedback } = useTelegram();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get<NotificationsResponse>('/notifications');
      return response.data;
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      hapticFeedback?.('medium');
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleNotificationClick = (notif: Notification) => {
    hapticFeedback?.('light');
    if (!notif.isRead) {
      markRead.mutate(notif.id);
    }
    // Navigate based on notification data
    const d = notif.data;
    if (d?.dealId) {
      navigate(`/deals/${d.dealId}`);
    } else if (d?.channelId) {
      navigate(`/channels/${d.channelId}`);
    }
  };

  const notifications = data?.items ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <PageTransition>
      <div className="p-4 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { hapticFeedback?.('light'); navigate('/'); }}
              className="w-9 h-9 rounded-tg bg-tg-bg-secondary flex items-center justify-center"
            >
              <ChevronLeft size={20} className="text-tg-text" />
            </motion.button>
            <div>
              <h1 className="text-xl font-bold text-tg-text">{t.profile.notifications}</h1>
              {unreadCount > 0 && (
                <p className="text-sm text-tg-text-secondary">
                  {unreadCount} {t.notifications.unread}
                </p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-tg bg-tg-link/10 text-tg-link text-sm font-medium"
            >
              <CheckCheck size={16} />
              {t.notifications.readAll}
            </motion.button>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="tg-card">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 skeleton rounded-tg flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 w-32 skeleton rounded mb-2" />
                    <div className="h-3 w-full skeleton rounded mb-1" />
                    <div className="h-3 w-20 skeleton rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && notifications.length === 0 && (
          <div className="tg-card text-center py-12">
            <div className="w-16 h-16 mx-auto rounded-full bg-tg-bg-secondary flex items-center justify-center mb-4">
              <Bell size={28} className="text-tg-text-secondary" />
            </div>
            <p className="font-semibold text-tg-text mb-1">{t.notifications.empty}</p>
            <p className="text-sm text-tg-text-secondary">{t.notifications.emptyHint}</p>
          </div>
        )}

        {/* List */}
        {!isLoading && notifications.length > 0 && (
          <StaggerContainer className="space-y-2">
            {notifications.map((notif) => {
              const config = typeConfig[notif.type] ?? { icon: Bell, color: 'text-tg-text-secondary', bgColor: 'bg-tg-bg-secondary' };
              const Icon = config.icon;

              return (
                <StaggerItem key={notif.id}>
                  <motion.div
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleNotificationClick(notif)}
                    className={`tg-card cursor-pointer transition-colors ${
                      !notif.isRead ? 'border-l-2 border-l-tg-link' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-tg ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
                        <Icon size={18} className={config.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-semibold truncate ${!notif.isRead ? 'text-tg-text' : 'text-tg-text-secondary'}`}>
                            {notif.title}
                          </p>
                          {!notif.isRead && (
                            <div className="w-2 h-2 rounded-full bg-tg-link flex-shrink-0" />
                          )}
                        </div>
                        <p className={`text-sm mt-0.5 line-clamp-2 ${!notif.isRead ? 'text-tg-text' : 'text-tg-text-secondary'}`}>
                          {notif.message}
                        </p>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Clock size={12} className="text-tg-text-secondary" />
                          <span className="text-xs text-tg-text-secondary">
                            {formatTime(notif.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        )}
      </div>
    </PageTransition>
  );
}
