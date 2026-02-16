import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { api } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string || 'devsproutfolders_bot';

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddChannelModal({ isOpen, onClose }: AddChannelModalProps) {
  const [link, setLink] = useState('');
  const [pricePerPost, setPricePerPost] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [botAdminChecked, setBotAdminChecked] = useState(false);
  const [botIsAdmin, setBotIsAdmin] = useState(false);

  const { hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const categories = [
    { id: 'technology', label: t.categories.technology, emoji: '💻' },
    { id: 'business', label: t.categories.business, emoji: '💼' },
    { id: 'entertainment', label: t.categories.entertainment, emoji: '🎬' },
    { id: 'news', label: t.categories.news, emoji: '📰' },
    { id: 'crypto', label: t.categories.crypto, emoji: '₿' },
    { id: 'lifestyle', label: t.categories.lifestyle, emoji: '🌟' },
  ];

  const checkBotAdminMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ isAdmin: boolean; botUsername: string }>(
        '/channels/check-bot-admin',
        { link }
      );
      return response.data;
    },
    onSuccess: (data) => {
      setBotAdminChecked(true);
      setBotIsAdmin(data.isAdmin);
      if (data.isAdmin) {
        hapticNotification?.('success');
        setError(null);
      } else {
        hapticNotification?.('error');
      }
    },
    onError: (err: Error) => {
      hapticNotification?.('error');
      setBotAdminChecked(false);
      setBotIsAdmin(false);
      setError(err.message || t.errors.somethingWentWrong);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/channels/by-link', {
        link,
        pricePerPost,
        categories: selectedCategories,
      });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['my-channels'] });
      onClose();
      resetForm();
    },
    onError: (err: Error) => {
      hapticNotification?.('error');
      const msg = err.message || '';
      if (msg.startsWith('BOT_NOT_ADMIN:')) {
        setBotIsAdmin(false);
        setBotAdminChecked(true);
        setError(null);
      } else {
        setError(msg);
      }
    },
  });

  const resetForm = () => {
    setLink('');
    setPricePerPost('');
    setSelectedCategories([]);
    setError(null);
    setBotAdminChecked(false);
    setBotIsAdmin(false);
  };

  const handleCategoryToggle = (catId: string) => {
    hapticSelection?.();
    setSelectedCategories((prev) =>
      prev.includes(catId)
        ? prev.filter((c) => c !== catId)
        : prev.length < 5
        ? [...prev, catId]
        : prev
    );
  };

  const handleCheckBotAdmin = () => {
    setError(null);
    if (!link.trim()) {
      setError(t.modals.addChannel.errorLink);
      return;
    }
    checkBotAdminMutation.mutate();
  };

  const handleLinkChange = (value: string) => {
    setLink(value);
    // Reset bot admin check when link changes
    if (botAdminChecked) {
      setBotAdminChecked(false);
      setBotIsAdmin(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!link.trim()) {
      setError(t.modals.addChannel.errorLink);
      return;
    }

    if (!botIsAdmin) {
      setError(t.modals.addChannel.botNotAdminError.replace('{bot}', `@${BOT_USERNAME}`));
      return;
    }

    if (!pricePerPost || parseFloat(pricePerPost) <= 0) {
      setError(t.modals.addChannel.errorPrice);
      return;
    }

    if (selectedCategories.length === 0) {
      setError(t.modals.addChannel.errorCategory);
      return;
    }

    createMutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.modals.addChannel.title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Free Badge */}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <span className="text-emerald-400 text-lg">{t.modals.addChannel.free}</span>
          <span className="text-sm text-emerald-300/80">
            {t.modals.addChannel.freeDescription}
          </span>
        </div>

        {/* Channel Link */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.addChannel.channelLink}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={link}
              onChange={(e) => handleLinkChange(e.target.value)}
              placeholder={t.modals.addChannel.channelLinkPlaceholder}
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
            />
            <Button
              type="button"
              variant={botIsAdmin ? 'primary' : 'secondary'}
              onClick={handleCheckBotAdmin}
              loading={checkBotAdminMutation.isPending}
              disabled={checkBotAdminMutation.isPending || !link.trim()}
              className="shrink-0"
            >
              {botIsAdmin ? '✓' : t.modals.addChannel.checkBot}
            </Button>
          </div>
          <p className="text-xs text-tg-hint mt-1">
            {t.modals.addChannel.channelLinkHint}
          </p>
        </div>

        {/* Bot Admin Status */}
        {botAdminChecked && !botIsAdmin && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm font-medium text-red-400 mb-1">
              {t.modals.addChannel.botNotAdminTitle}
            </p>
            <p className="text-sm text-red-400/80">
              {t.modals.addChannel.botNotAdminSteps.replace('{bot}', `@${BOT_USERNAME}`)}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCheckBotAdmin}
              loading={checkBotAdminMutation.isPending}
              className="mt-2"
            >
              {t.modals.addChannel.recheckBot}
            </Button>
          </div>
        )}

        {botIsAdmin && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-emerald-400 text-lg">✓</span>
            <span className="text-sm text-emerald-300/80">
              {t.modals.addChannel.botAdminConfirmed}
            </span>
          </div>
        )}

        {/* Price & Categories - only shown when bot is confirmed as admin */}
        {botIsAdmin && (
          <>
            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-tg-hint mb-2">
                {t.modals.addChannel.pricePerPost}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pricePerPost}
                onChange={(e) => setPricePerPost(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
              />
            </div>

            {/* Categories */}
            <div>
              <label className="block text-sm font-medium text-tg-hint mb-2">
                {t.modals.addChannel.categoriesMax}
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const isSelected = selectedCategories.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleCategoryToggle(cat.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                        isSelected
                          ? 'bg-accent/20 border-accent text-accent border'
                          : 'bg-white/5 border border-white/10 text-tg-hint'
                      }`}
                    >
                      <span>{cat.emoji}</span>
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Info banner when bot not checked yet */}
        {!botAdminChecked && !botIsAdmin && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-amber-400 text-lg mt-0.5">!</span>
            <span className="text-sm text-amber-300/80">
              {t.modals.addChannel.botAdminRequired.replace('{bot}', `@${BOT_USERNAME}`)}
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Submit - only enabled when bot is admin */}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={createMutation.isPending}
          disabled={createMutation.isPending || !botIsAdmin}
        >
          {t.modals.addChannel.submit}
        </Button>
      </form>
    </Modal>
  );
}
