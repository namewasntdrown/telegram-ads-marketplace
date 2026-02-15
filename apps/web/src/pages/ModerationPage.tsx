import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Clock, Radio, FolderOpen, ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, PageTransition, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

interface Channel {
  id: string;
  title: string;
  username?: string;
  subscriberCount: number;
  pricePerPost: string;
  categories: string[];
  status: string;
  ownerId: string;
  createdAt: string;
}

interface Folder {
  id: string;
  title: string;
  description?: string;
  folderLink: string;
  categories: string[];
  status: string;
  ownerId: string;
  createdAt: string;
}

type Tab = 'channels' | 'folders';

export function ModerationPage() {
  const [activeTab, setActiveTab] = useState<Tab>('channels');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { hapticFeedback, hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();
  const { t, translateCategory } = useTranslation();

  const { data: pendingChannels, isLoading: loadingChannels } = useQuery({
    queryKey: ['pending-channels'],
    queryFn: async () => {
      const response = await api.get<Channel[]>('/channels/pending');
      return response.data;
    },
  });

  const { data: pendingFolders, isLoading: loadingFolders } = useQuery({
    queryKey: ['pending-folders'],
    queryFn: async () => {
      const response = await api.get<Folder[]>('/folders/pending');
      return response.data;
    },
  });

  const approveChannelMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.patch(`/channels/${id}/status`, { status: 'ACTIVE' });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['pending-channels'] });
      queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
    onError: () => hapticNotification?.('error'),
  });

  const rejectChannelMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await api.patch(`/channels/${id}/status`, {
        status: 'REJECTED',
        rejectionReason: reason,
      });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['pending-channels'] });
      setRejectingId(null);
      setRejectReason('');
    },
    onError: () => hapticNotification?.('error'),
  });

  const approveFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.patch(`/folders/${id}/status`, { status: 'ACTIVE' });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['pending-folders'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    },
    onError: () => hapticNotification?.('error'),
  });

  const rejectFolderMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await api.patch(`/folders/${id}/status`, {
        status: 'REJECTED',
        rejectionReason: reason,
      });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['pending-folders'] });
      setRejectingId(null);
      setRejectReason('');
    },
    onError: () => hapticNotification?.('error'),
  });

  const isLoading = activeTab === 'channels' ? loadingChannels : loadingFolders;
  const pendingItems = activeTab === 'channels' ? pendingChannels : pendingFolders;

  return (
    <PageTransition>
      <div className="p-4">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <h1 className="text-xl font-bold">
            <span className="gradient-text">{t.moderation.title}</span>
          </h1>
          <p className="text-sm text-tg-hint mt-1">{t.moderation.subtitle}</p>
        </motion.div>

        {/* Tab Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2 mb-4"
        >
          <button
            onClick={() => {
              hapticSelection?.();
              setActiveTab('channels');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === 'channels'
                ? 'bg-accent text-white'
                : 'bg-white/5 text-tg-hint hover:bg-white/10'
            }`}
          >
            <Radio size={16} />
            {t.moderation.channels} ({pendingChannels?.length ?? 0})
          </button>
          <button
            onClick={() => {
              hapticSelection?.();
              setActiveTab('folders');
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === 'folders'
                ? 'bg-accent text-white'
                : 'bg-white/5 text-tg-hint hover:bg-white/10'
            }`}
          >
            <FolderOpen size={16} />
            {t.moderation.folders} ({pendingFolders?.length ?? 0})
          </button>
        </motion.div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <div className="h-20 skeleton rounded-lg" />
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && pendingItems?.length === 0 && (
          <Card className="text-center py-12">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-tg-secondary-bg flex items-center justify-center mb-4">
              <CheckCircle size={32} className="text-green-400" />
            </div>
            <p className="font-semibold">{t.moderation.allCaughtUp}</p>
            <p className="text-sm text-tg-hint mt-1">
              {t.moderation.noPending.replace('{type}', activeTab === 'channels' ? t.moderation.channels.toLowerCase() : t.moderation.folders.toLowerCase())}
            </p>
          </Card>
        )}

        {/* Pending Items */}
        <StaggerContainer className="space-y-4">
          {activeTab === 'channels' && pendingChannels?.map((channel) => (
            <StaggerItem key={channel.id}>
              <Card>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center text-lg font-bold text-blue-400">
                    {channel.title[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{channel.title}</h3>
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium">
                        <Clock size={12} />
                        {t.moderation.pending}
                      </span>
                    </div>
                    {channel.username && (
                      <a
                        href={`https://t.me/${channel.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-accent flex items-center gap-1 hover:underline"
                      >
                        @{channel.username}
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-accent">{channel.pricePerPost}</p>
                    <p className="text-xs text-tg-hint">TON/post</p>
                  </div>
                </div>

                <div className="flex gap-1.5 mb-4 flex-wrap">
                  {channel.categories.map((cat) => (
                    <span key={cat} className="neu-badge capitalize">{translateCategory(cat)}</span>
                  ))}
                </div>

                {rejectingId === channel.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder={t.moderation.rejectionReason}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        fullWidth
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                      >
                        {t.moderation.cancel}
                      </Button>
                      <Button
                        variant="primary"
                        fullWidth
                        loading={rejectChannelMutation.isPending}
                        disabled={!rejectReason.trim()}
                        onClick={() => rejectChannelMutation.mutate({ id: channel.id, reason: rejectReason })}
                        className="!bg-red-500"
                      >
                        {t.moderation.reject}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => {
                        hapticFeedback?.('light');
                        setRejectingId(channel.id);
                      }}
                    >
                      <XCircle size={18} />
                      {t.moderation.reject}
                    </Button>
                    <Button
                      variant="primary"
                      fullWidth
                      loading={approveChannelMutation.isPending}
                      onClick={() => {
                        hapticFeedback?.('medium');
                        approveChannelMutation.mutate(channel.id);
                      }}
                    >
                      <CheckCircle size={18} />
                      {t.moderation.approve}
                    </Button>
                  </div>
                )}
              </Card>
            </StaggerItem>
          ))}

          {activeTab === 'folders' && pendingFolders?.map((folder) => (
            <StaggerItem key={folder.id}>
              <Card>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center text-lg font-bold text-violet-400">
                    <FolderOpen size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{folder.title}</h3>
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-medium">
                        <Clock size={12} />
                        {t.moderation.pending}
                      </span>
                    </div>
                    <a
                      href={`https://${folder.folderLink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent flex items-center gap-1 hover:underline"
                    >
                      {folder.folderLink}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                {folder.description && (
                  <p className="text-sm text-tg-hint mb-3">{folder.description}</p>
                )}

                <div className="flex gap-1.5 mb-4 flex-wrap">
                  {folder.categories.map((cat) => (
                    <span key={cat} className="neu-badge capitalize">{translateCategory(cat)}</span>
                  ))}
                </div>

                {rejectingId === folder.id ? (
                  <div className="space-y-3">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder={t.moderation.rejectionReason}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        fullWidth
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                      >
                        {t.moderation.cancel}
                      </Button>
                      <Button
                        variant="primary"
                        fullWidth
                        loading={rejectFolderMutation.isPending}
                        disabled={!rejectReason.trim()}
                        onClick={() => rejectFolderMutation.mutate({ id: folder.id, reason: rejectReason })}
                        className="!bg-red-500"
                      >
                        {t.moderation.reject}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => {
                        hapticFeedback?.('light');
                        setRejectingId(folder.id);
                      }}
                    >
                      <XCircle size={18} />
                      {t.moderation.reject}
                    </Button>
                    <Button
                      variant="primary"
                      fullWidth
                      loading={approveFolderMutation.isPending}
                      onClick={() => {
                        hapticFeedback?.('medium');
                        approveFolderMutation.mutate(folder.id);
                      }}
                    >
                      <CheckCircle size={18} />
                      {t.moderation.approve}
                    </Button>
                  </div>
                )}
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </PageTransition>
  );
}
