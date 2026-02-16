import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { api } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string || 'bot';

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddChannelModal({ isOpen, onClose }: AddChannelModalProps) {
  const [link, setLink] = useState('');
  const [pricePerPost, setPricePerPost] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [botNotAdmin, setBotNotAdmin] = useState<string | null>(null);

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
        const botName = msg.split(':')[1] || BOT_USERNAME;
        setBotNotAdmin(botName);
        setError(null);
      } else {
        setBotNotAdmin(null);
        setError(msg);
      }
    },
  });

  const resetForm = () => {
    setLink('');
    setPricePerPost('');
    setSelectedCategories([]);
    setError(null);
    setBotNotAdmin(null);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBotNotAdmin(null);

    if (!link.trim()) {
      setError(t.modals.addChannel.errorLink);
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

        {/* Bot Admin Requirement Notice */}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <span className="text-amber-400 text-lg mt-0.5">⚠️</span>
          <span className="text-sm text-amber-300/80">
            {t.modals.addChannel.botAdminRequired.replace('{bot}', `@${BOT_USERNAME}`)}
          </span>
        </div>

        {/* Channel Link */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.addChannel.channelLink}
          </label>
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={t.modals.addChannel.channelLinkPlaceholder}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
          />
          <p className="text-xs text-tg-hint mt-1">
            {t.modals.addChannel.channelLinkHint}
          </p>
        </div>

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

        {/* Bot Not Admin Error */}
        {botNotAdmin && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">
              {t.modals.addChannel.botNotAdminError.replace('{bot}', botNotAdmin)}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={createMutation.isPending}
          disabled={createMutation.isPending}
        >
          {t.modals.addChannel.submit}
        </Button>
      </form>
    </Modal>
  );
}
