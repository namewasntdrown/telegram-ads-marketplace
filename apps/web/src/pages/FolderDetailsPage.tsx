import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Folder,
  DollarSign,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  ExternalLink,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, PageTransition, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { useAuthStore } from '../store/auth.store';
import { useTranslation } from '../i18n';
import { useState } from 'react';
import { SetFolderPriceModal } from '../components/SetFolderPriceModal';
import { BoostModal } from '../components/BoostModal';
import { RequestPlacementModal } from '../components/RequestPlacementModal';
import { FolderSettingsModal } from '../components/FolderSettingsModal';
import { folderPlacementsApi } from '../api/folderPlacements';

interface FolderDetails {
  id: string;
  title: string;
  description?: string;
  folderLink: string;
  folderHash?: string;
  categories: string[];
  status: string;
  boostAmount: string;
  boostUntil?: string;
  isBoosted: boolean;
  pricePerChannel?: string;
  collectionDeadline?: string;
  maxChannels?: number;
  minSubscribers?: number;
  ownerId: string;
  createdAt: string;
}

export function FolderDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hapticFeedback } = useTelegram();
  const { user } = useAuthStore();
  const { t, translateCategory } = useTranslation();
  const queryClient = useQueryClient();

  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showBoostModal, setShowBoostModal] = useState(false);
  const [showPlacementModal, setShowPlacementModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Fetch folder details
  const { data: folder, isLoading: folderLoading } = useQuery({
    queryKey: ['folder', id],
    queryFn: async () => {
      const response = await api.get<FolderDetails>(`/folders/${id}`);
      return response.data;
    },
    enabled: !!id,
  });

  // Fetch placement requests (for folder owner)
  const { data: placementsData, isLoading: placementsLoading } = useQuery({
    queryKey: ['folderPlacements', id],
    queryFn: async () => {
      const response = await folderPlacementsApi.getFolderPlacements(id!, {
        status: 'PENDING',
        limit: 100,
      });
      return response.data;
    },
    enabled: !!id && folder?.ownerId === user?.id,
  });

  // Fetch approved placements (paid placements through system)
  const { data: approvedData } = useQuery({
    queryKey: ['folderPlacements', id, 'approved'],
    queryFn: async () => {
      const response = await folderPlacementsApi.getFolderPlacements(id!, {
        status: 'APPROVED',
        limit: 100,
      });
      return response.data;
    },
    enabled: !!id,
  });

  // Fetch synced channels (actual Telegram folder contents)
  const { data: syncedData } = useQuery({
    queryKey: ['folderSyncedChannels', id],
    queryFn: async () => {
      const response = await folderPlacementsApi.getSyncedChannels(id!);
      return response.data;
    },
    enabled: !!id,
  });

  const isOwner = folder?.ownerId === user?.id;
  const pendingPlacements = placementsData?.items || [];
  const approvedPlacements = approvedData?.items || [];
  const syncedChannels = syncedData?.channels || [];
  const lastSyncedAt = syncedData?.lastSyncedAt;

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: () => folderPlacementsApi.syncFolderChannels(id!),
    onSuccess: (response) => {
      if (response.data.success) {
        hapticFeedback?.('rigid');
        queryClient.invalidateQueries({ queryKey: ['folderSyncedChannels', id] });
      } else {
        hapticFeedback?.('heavy');
      }
    },
    onError: () => {
      hapticFeedback?.('heavy');
    },
  });

  // Approve placement mutation
  const approveMutation = useMutation({
    mutationFn: (placementId: string) => folderPlacementsApi.approvePlacement(placementId),
    onSuccess: () => {
      hapticFeedback?.('rigid');
      queryClient.invalidateQueries({ queryKey: ['folderPlacements', id] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: () => {
      hapticFeedback?.('heavy');
    },
  });

  // Reject placement mutation
  const rejectMutation = useMutation({
    mutationFn: ({ placementId, reason }: { placementId: string; reason?: string }) =>
      folderPlacementsApi.rejectPlacement(placementId, reason),
    onSuccess: () => {
      hapticFeedback?.('rigid');
      queryClient.invalidateQueries({ queryKey: ['folderPlacements', id] });
      setRejectingId(null);
      setRejectReason('');
    },
    onError: () => {
      hapticFeedback?.('heavy');
    },
  });

  const handleApprove = (placementId: string) => {
    approveMutation.mutate(placementId);
  };

  const handleReject = (placementId: string) => {
    if (rejectingId === placementId) {
      rejectMutation.mutate({ placementId, reason: rejectReason });
    } else {
      setRejectingId(placementId);
    }
  };

  const handleOpenFolder = () => {
    if (folder?.folderLink) {
      const url = folder.folderLink.startsWith('http')
        ? folder.folderLink
        : `https://${folder.folderLink}`;
      window.open(url, '_blank');
      hapticFeedback?.('light');
    }
  };

  if (folderLoading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-tg-hint">{t.common.loading}</div>
        </div>
      </PageTransition>
    );
  }

  if (!folder) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="text-center py-10">
            <p className="text-tg-text">{t.common.noData}</p>
          </Card>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="pb-20">
        {/* Header */}
        <div className="sticky top-0 z-10 tg-bg border-b border-tg-separator mb-6">
          <div className="flex items-center justify-between p-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-full active:bg-tg-bg-secondary transition-colors"
            >
              <ArrowLeft size={24} className="text-tg-text" />
            </button>
            <h1 className="text-lg font-bold text-tg-text">{t.folders.title}</h1>
            <div className="w-10" />
          </div>
        </div>

        <div className="px-4 space-y-4">
          {/* Folder Info Card */}
          <Card>
            <div className="flex items-start gap-4 mb-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                <Folder className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-tg-text mb-1">{folder.title}</h2>
                <p className="text-sm text-tg-hint">{folder.folderLink}</p>
              </div>
            </div>

            {folder.description && (
              <p className="text-sm text-tg-text-secondary mb-4">{folder.description}</p>
            )}

            {/* Categories */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {folder.categories.map((cat) => (
                <span key={cat} className="tg-badge capitalize">
                  {translateCategory(cat)}
                </span>
              ))}
            </div>

            {/* Price Info */}
            {folder.pricePerChannel ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 mb-4">
                <DollarSign className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-green-400">
                    {folder.pricePerChannel} TON
                  </p>
                  <p className="text-xs text-tg-hint">{t.folders.pricePerChannel}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 mb-4">
                <CheckCircle className="w-5 h-5 text-blue-400" />
                <p className="text-sm text-blue-400">{t.folders.freeFolder}</p>
              </div>
            )}

            {/* Channels Count */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-tg-bg-secondary mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-tg-hint" />
                <div>
                  <p className="text-sm text-tg-text">
                    {syncedChannels.length > 0 ? syncedChannels.length : approvedPlacements.length} {t.folders.channelsInFolder}
                  </p>
                  {lastSyncedAt && (
                    <p className="text-xs text-tg-hint">
                      {t.folders.synced || 'Synced'}: {new Date(lastSyncedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
              {isOwner && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => syncMutation.mutate()}
                  loading={syncMutation.isPending}
                  title={t.folders.syncChannels || 'Sync channels'}
                >
                  <RefreshCw size={16} className={syncMutation.isPending ? 'animate-spin' : ''} />
                </Button>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="primary" fullWidth onClick={handleOpenFolder}>
                <ExternalLink size={18} />
                {t.folders.openFolder}
              </Button>
              {isOwner && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      hapticFeedback?.('light');
                      setShowPriceModal(true);
                    }}
                  >
                    <DollarSign size={18} />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      hapticFeedback?.('light');
                      setShowSettingsModal(true);
                    }}
                  >
                    <Settings size={18} />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      hapticFeedback?.('light');
                      setShowBoostModal(true);
                    }}
                  >
                    <Zap size={18} />
                  </Button>
                </>
              )}
            </div>

            {/* Collection Requirements - show to everyone */}
            {(folder.collectionDeadline || folder.maxChannels || folder.minSubscribers) && (
              <div className="mt-4 p-3 rounded-xl bg-tg-bg-secondary space-y-2">
                <p className="text-sm font-medium text-tg-text mb-2">{t.folders.requirements || 'Requirements'}</p>
                {folder.collectionDeadline && (
                  <div className="flex items-center gap-2 text-sm text-tg-hint">
                    <Clock size={14} />
                    <span>{t.folders.deadline || 'Deadline'}: {new Date(folder.collectionDeadline).toLocaleDateString()}</span>
                    {new Date(folder.collectionDeadline) < new Date() && (
                      <span className="text-red-400">({t.folders.expired || 'Expired'})</span>
                    )}
                  </div>
                )}
                {folder.maxChannels && (
                  <div className="flex items-center gap-2 text-sm text-tg-hint">
                    <Users size={14} />
                    <span>{t.folders.maxChannels || 'Max channels'}: {folder.maxChannels}</span>
                  </div>
                )}
                {folder.minSubscribers && (
                  <div className="flex items-center gap-2 text-sm text-tg-hint">
                    <Users size={14} />
                    <span>{t.folders.minSubscribers || 'Min subscribers'}: {folder.minSubscribers.toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}

            {/* Place My Channel Button - for non-owners on paid folders */}
            {!isOwner && folder.pricePerChannel && (
              <Button
                variant="primary"
                fullWidth
                className="mt-3"
                onClick={() => {
                  hapticFeedback?.('light');
                  setShowPlacementModal(true);
                }}
              >
                <Users size={18} />
                {t.folders.placeMyChannel}
              </Button>
            )}
          </Card>

          {/* Pending Requests (Owner Only) */}
          {isOwner && folder.pricePerChannel && (
            <Card>
              <h3 className="text-lg font-bold text-tg-text mb-4">
                {t.folders.placementRequests}
              </h3>

              {placementsLoading ? (
                <div className="text-center py-4 text-tg-hint">{t.common.loading}</div>
              ) : pendingPlacements.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-tg-hint mx-auto mb-3" />
                  <p className="text-sm text-tg-hint">{t.folders.noRequests}</p>
                </div>
              ) : (
                <StaggerContainer className="space-y-3">
                  {pendingPlacements.map((placement) => (
                    <StaggerItem key={placement.id}>
                      <div className="p-4 rounded-xl bg-tg-bg-secondary border border-tg-separator">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                            <Users className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-tg-text truncate">
                              {placement.channel?.title || 'Channel'}
                            </p>
                            {placement.channel?.username ? (
                              <a
                                href={`https://t.me/${placement.channel.username}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                @{placement.channel.username}
                              </a>
                            ) : (
                              <p className="text-xs text-tg-hint">
                                {placement.channel?.subscriberCount.toLocaleString()} {t.channels.subscribers}
                              </p>
                            )}
                            {placement.channel?.username && (
                              <p className="text-xs text-tg-hint">
                                {placement.channel?.subscriberCount.toLocaleString()} {t.channels.subscribers}
                              </p>
                            )}
                          </div>
                          {placement.channel?.username && (
                            <a
                              href={`https://t.me/${placement.channel.username}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors flex-shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink size={18} />
                            </a>
                          )}
                        </div>

                        <div className="flex items-center justify-between mb-3 p-2 rounded-lg bg-tg-bg">
                          <span className="text-xs text-tg-hint">{t.folders.folderOwnerWillReceive}</span>
                          <span className="text-sm font-medium text-tg-text">
                            {placement.amount} TON
                          </span>
                        </div>

                        {rejectingId === placement.id ? (
                          <div className="space-y-2">
                            <input
                              type="text"
                              placeholder={t.folders.rejectionReason}
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg bg-tg-bg border border-tg-separator text-tg-text placeholder:text-tg-hint focus:outline-none focus:border-blue-500"
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
                                {t.common.cancel}
                              </Button>
                              <Button
                                variant="primary"
                                fullWidth
                                onClick={() => handleReject(placement.id)}
                                loading={rejectMutation.isPending}
                              >
                                {t.folders.reject}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              variant="secondary"
                              fullWidth
                              onClick={() => handleReject(placement.id)}
                            >
                              <XCircle size={18} />
                              {t.folders.reject}
                            </Button>
                            <Button
                              variant="primary"
                              fullWidth
                              onClick={() => handleApprove(placement.id)}
                              loading={approveMutation.isPending}
                            >
                              <CheckCircle size={18} />
                              {t.folders.approve}
                            </Button>
                          </div>
                        )}
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerContainer>
              )}
            </Card>
          )}

          {/* Channels in Folder (synced from Telegram) */}
          {syncedChannels.length > 0 && (
            <Card>
              <h3 className="text-lg font-bold text-tg-text mb-4">
                {t.folders.channels} ({syncedChannels.length})
              </h3>
              <StaggerContainer className="space-y-2">
                {syncedChannels.map((channel) => (
                  <StaggerItem key={channel.telegramId}>
                    <a
                      href={channel.username ? `https://t.me/${channel.username}` : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg bg-tg-bg-secondary hover:bg-tg-bg-secondary/80 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-tg-text">
                          {channel.title}
                        </p>
                        <p className="text-xs text-tg-hint">
                          {channel.username ? `@${channel.username}` : ''} {channel.subscriberCount > 0 ? `• ${channel.subscriberCount.toLocaleString()} ${t.channels.subscribers}` : ''}
                        </p>
                      </div>
                      <ExternalLink size={16} className="text-tg-hint" />
                    </a>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </Card>
          )}

          {/* Paid Placements (fallback when no synced data) */}
          {syncedChannels.length === 0 && approvedPlacements.length > 0 && (
            <Card>
              <h3 className="text-lg font-bold text-tg-text mb-4">
                {t.folders.paidPlacements || 'Paid Placements'} ({approvedPlacements.length})
              </h3>
              <StaggerContainer className="space-y-2">
                {approvedPlacements.map((placement) => (
                  <StaggerItem key={placement.id}>
                    <Link
                      to={`/channels/${placement.channelId}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-tg-bg-secondary hover:bg-tg-bg-secondary/80 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-tg-text">
                          {placement.channel?.title || 'Channel'}
                        </p>
                        <p className="text-xs text-tg-hint">
                          {placement.channel?.subscriberCount.toLocaleString()} {t.channels.subscribers}
                        </p>
                      </div>
                    </Link>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </Card>
          )}
        </div>
      </div>

      {/* Modals */}
      {showPriceModal && (
        <SetFolderPriceModal
          isOpen={showPriceModal}
          onClose={() => setShowPriceModal(false)}
          folderId={folder.id}
          folderTitle={folder.title}
          currentPrice={folder.pricePerChannel}
        />
      )}

      {showBoostModal && (
        <BoostModal
          isOpen={showBoostModal}
          onClose={() => setShowBoostModal(false)}
          type="folder"
          itemId={folder.id}
          itemTitle={folder.title}
          userBalance={user?.balanceTon}
        />
      )}

      {showSettingsModal && (
        <FolderSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          folderId={folder.id}
          folderTitle={folder.title}
          currentSettings={{
            collectionDeadline: folder.collectionDeadline,
            maxChannels: folder.maxChannels,
            minSubscribers: folder.minSubscribers,
          }}
        />
      )}

      {showPlacementModal && folder.pricePerChannel && (
        <RequestPlacementModal
          isOpen={showPlacementModal}
          onClose={() => setShowPlacementModal(false)}
          folderId={folder.id}
          folderTitle={folder.title}
          folderPrice={folder.pricePerChannel}
          userBalance={user?.balanceTon}
        />
      )}
    </PageTransition>
  );
}
