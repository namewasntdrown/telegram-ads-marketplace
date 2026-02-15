import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderOpen, Plus, Zap, Clock, CheckCircle, XCircle, DollarSign, Scale } from 'lucide-react';
import { api } from '../api/client';
import { Card, Button, CardSkeleton, PageTransition, StaggerContainer, StaggerItem } from '../components/ui';
import { useTelegram } from '../hooks/useTelegram';
import { useAuthStore } from '../store/auth.store';
import { AddFolderModal } from '../components/AddFolderModal';
import { BoostModal } from '../components/BoostModal';
import { useTranslation } from '../i18n';
import { SetFolderPriceModal } from '../components/SetFolderPriceModal';

interface Folder {
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
  ownerId: string;
}

interface PaginatedFolders {
  items: Folder[];
  total: number;
  page: number;
  totalPages: number;
}

type ViewMode = 'all' | 'my';

export function FoldersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = searchParams.get('view') === 'my' ? 'my' : 'all';

  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [boostFolder, setBoostFolder] = useState<Folder | null>(null);
  const [priceFolder, setPriceFolder] = useState<Folder | null>(null);

  const { hapticFeedback, hapticNotification, hapticSelection } = useTelegram();
  const { user, isAuthenticated } = useAuthStore();
  const { t, translateCategory } = useTranslation();
  const queryClient = useQueryClient();

  const [appealingFolderId, setAppealingFolderId] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState('');

  const categories = [
    { id: null, label: t.categories.all, emoji: '✨' },
    { id: 'technology', label: t.categories.technology, emoji: '💻' },
    { id: 'business', label: t.categories.business, emoji: '💼' },
    { id: 'entertainment', label: t.categories.entertainment, emoji: '🎬' },
    { id: 'news', label: t.categories.news, emoji: '📰' },
    { id: 'crypto', label: t.categories.crypto, emoji: '₿' },
    { id: 'lifestyle', label: t.categories.lifestyle, emoji: '🌟' },
  ];

  // Sync viewMode with URL param
  useEffect(() => {
    const urlView = searchParams.get('view');
    if (urlView === 'my' && viewMode !== 'my') {
      setViewMode('my');
    }
  }, [searchParams]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['folders', selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory) params.set('categories', selectedCategory);
      const response = await api.get<PaginatedFolders>(`/folders?${params}`);
      return response.data;
    },
    enabled: viewMode === 'all',
  });

  const { data: myFolders, isLoading: isLoadingMy, error: errorMy } = useQuery({
    queryKey: ['my-folders'],
    queryFn: async () => {
      const response = await api.get<Folder[]>('/folders/my/folders');
      return response.data;
    },
    enabled: viewMode === 'my' && isAuthenticated,
  });

  const appealFolderMutation = useMutation({
    mutationFn: async ({ folderId, reason }: { folderId: string; reason: string }) => {
      const response = await api.post('/appeals/folder', { folderId, reason });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      setAppealingFolderId(null);
      setAppealReason('');
      queryClient.invalidateQueries({ queryKey: ['my-folders'] });
    },
    onError: () => hapticNotification?.('error'),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full tg-badge-warning text-xs font-medium">
            <Clock size={12} />
            {t.folders.onModeration}
          </span>
        );
      case 'ACTIVE':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full tg-badge-success text-xs font-medium">
            <CheckCircle size={12} />
            {t.folders.activeStatus}
          </span>
        );
      case 'REJECTED':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full tg-badge-error text-xs font-medium">
            <XCircle size={12} />
            {t.folders.rejectedStatus}
          </span>
        );
      default:
        return null;
    }
  };

  const currentFolders = viewMode === 'all' ? data?.items : myFolders;
  const currentLoading = viewMode === 'all' ? isLoading : isLoadingMy;
  const currentError = viewMode === 'all' ? error : errorMy;

  const handleCategoryChange = (cat: string | null) => {
    hapticSelection?.();
    setSelectedCategory(cat);
  };

  const handleOpenFolder = (folderLink: string) => {
    hapticFeedback?.('medium');
    window.open(`https://${folderLink}`, '_blank');
  };

  return (
    <PageTransition>
      <div className="p-4">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-4"
        >
          <h1 className="text-xl font-bold text-tg-text">{t.folders.title}</h1>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              hapticFeedback?.('light');
              setShowAddModal(true);
            }}
          >
            <Plus size={18} />
            {t.common.add}
          </Button>
        </motion.div>

        {/* View Mode Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2 mb-4"
        >
          <button
            onClick={() => {
              hapticSelection?.();
              setViewMode('all');
              setSearchParams({});
            }}
            className={`flex-1 py-2.5 rounded-tg text-sm font-medium transition-all duration-150 ${
              viewMode === 'all'
                ? 'bg-tg-link text-white'
                : 'bg-tg-bg-secondary text-tg-text-secondary hover:bg-gray-200'
            }`}
          >
            {t.folders.allFolders}
          </button>
          <button
            onClick={() => {
              hapticSelection?.();
              setViewMode('my');
              setSearchParams({ view: 'my' });
            }}
            className={`flex-1 py-2.5 rounded-tg text-sm font-medium transition-all duration-150 ${
              viewMode === 'my'
                ? 'bg-tg-link text-white'
                : 'bg-tg-bg-secondary text-tg-text-secondary hover:bg-gray-200'
            }`}
          >
            {t.folders.myFolders}
          </button>
        </motion.div>

        {/* Category Filter - only for All Folders */}
        {viewMode === 'all' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex gap-2 overflow-x-auto pb-4 mb-4 hide-scrollbar"
          >
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <motion.button
                  key={cat.id ?? 'all'}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-tg text-sm whitespace-nowrap font-medium transition-all duration-150 ${
                    isActive
                      ? 'tg-btn-primary'
                      : 'tg-btn-secondary text-tg-text-secondary'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </motion.button>
              );
            })}
          </motion.div>
        )}

        {/* Loading State */}
        {currentLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error State */}
        {currentError && (
          <Card className="text-center py-8">
            <p className="text-tg-error font-medium">{t.errors.failedToLoad}</p>
            <p className="text-sm text-tg-text-secondary mt-1">{t.errors.tryAgain}</p>
          </Card>
        )}

        {/* Empty State */}
        {!currentLoading && !currentError && currentFolders && currentFolders.length === 0 && (
          <Card className="text-center py-10">
            <div className="w-14 h-14 mx-auto rounded-tg-md bg-tg-bg-secondary flex items-center justify-center mb-4">
              <FolderOpen size={28} className="text-tg-text-secondary" />
            </div>
            <p className="font-semibold text-tg-text">
              {viewMode === 'my' ? t.folders.noMyFolders : t.folders.noFoldersFound}
            </p>
            <p className="text-sm text-tg-text-secondary mt-1">
              {viewMode === 'my' ? t.folders.addFirstFolder : t.folders.tryDifferentCategory}
            </p>
          </Card>
        )}

        {/* Folder List */}
        <StaggerContainer className="space-y-3">
          {currentFolders?.map((folder) => (
            <StaggerItem key={folder.id}>
              <Card>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-tg bg-purple-500/10 flex items-center justify-center">
                      <FolderOpen size={22} className="text-purple-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/folders/${folder.id}`}
                          className="font-semibold text-tg-text hover:text-tg-link transition-colors"
                        >
                          {folder.title}
                        </Link>
                        {viewMode === 'my' && getStatusBadge(folder.status)}
                        {folder.isBoosted && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full tg-badge-warning text-xs font-medium">
                            <Zap size={12} />
                            {t.folders.boosted}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-tg-text-secondary">{folder.folderLink}</p>
                    </div>
                  </div>
                </div>

                {folder.description && (
                  <p className="text-sm text-tg-text-secondary mb-3 line-clamp-2">
                    {folder.description}
                  </p>
                )}

                <div className="flex gap-1.5 mb-4 flex-wrap">
                  {folder.categories.slice(0, 3).map((cat) => (
                    <span
                      key={cat}
                      className="tg-badge capitalize"
                    >
                      {translateCategory(cat)}
                    </span>
                  ))}
                  {folder.pricePerChannel && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-medium">
                      <DollarSign size={12} />
                      {folder.pricePerChannel} TON
                    </span>
                  )}
                  {!folder.pricePerChannel && viewMode === 'all' && (
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium">
                      {t.folders.freeFolder}
                    </span>
                  )}
                </div>

                {/* Appeal form for rejected folders */}
                {folder.status === 'REJECTED' && folder.ownerId === user?.id && appealingFolderId === folder.id && (
                  <div className="space-y-2 mb-3">
                    <textarea
                      value={appealReason}
                      onChange={(e) => setAppealReason(e.target.value)}
                      placeholder={t.appeals.reasonPlaceholder}
                      className="w-full px-3 py-2 rounded-tg bg-tg-bg-secondary border border-tg-separator text-tg-text text-sm focus:outline-none focus:border-tg-link resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        fullWidth
                        onClick={() => {
                          setAppealingFolderId(null);
                          setAppealReason('');
                        }}
                      >
                        {t.common.cancel}
                      </Button>
                      <Button
                        variant="primary"
                        fullWidth
                        loading={appealFolderMutation.isPending}
                        disabled={!appealReason.trim()}
                        onClick={() => appealFolderMutation.mutate({ folderId: folder.id, reason: appealReason })}
                      >
                        {t.appeals.submit}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Link to={`/folders/${folder.id}`} className="flex-1">
                    <Button variant="primary" fullWidth>
                      {t.folders.details || 'Details'}
                    </Button>
                  </Link>
                  <Button
                    variant="secondary"
                    onClick={() => handleOpenFolder(folder.folderLink)}
                    title={t.folders.openFolder}
                  >
                    <FolderOpen size={18} />
                  </Button>
                  {folder.status === 'REJECTED' && folder.ownerId === user?.id && !appealingFolderId && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        hapticFeedback?.('light');
                        setAppealingFolderId(folder.id);
                      }}
                      title={t.appeals.fileAppeal}
                      className="!text-amber-500"
                    >
                      <Scale size={18} />
                    </Button>
                  )}
                  {folder.ownerId === user?.id && folder.status !== 'REJECTED' && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          hapticFeedback?.('light');
                          setPriceFolder(folder);
                        }}
                        title={t.folders.setPricing}
                      >
                        <DollarSign size={18} />
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          hapticFeedback?.('light');
                          setBoostFolder(folder);
                        }}
                        title={t.modals.boost.title}
                      >
                        <Zap size={18} />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Pagination - only for 'all' view */}
        {viewMode === 'all' && data && data.totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center mt-6"
          >
            <p className="text-sm text-tg-text-secondary tg-badge">
              {t.common.page} {data.page} {t.common.of} {data.totalPages}
            </p>
          </motion.div>
        )}
      </div>

      {/* Modals */}
      <AddFolderModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />

      {boostFolder && (
        <BoostModal
          isOpen={!!boostFolder}
          onClose={() => setBoostFolder(null)}
          type="folder"
          itemId={boostFolder.id}
          itemTitle={boostFolder.title}
          userBalance={user?.balanceTon}
        />
      )}

      {priceFolder && (
        <SetFolderPriceModal
          isOpen={!!priceFolder}
          onClose={() => setPriceFolder(null)}
          folderId={priceFolder.id}
          folderTitle={priceFolder.title}
          currentPrice={priceFolder.pricePerChannel}
        />
      )}
    </PageTransition>
  );
}
