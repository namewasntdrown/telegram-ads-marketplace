import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Modal, Button } from './ui';
import { api } from '../api/client';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

interface AddCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const languageOptions = [
  { id: 'en', flag: '🇬🇧' },
  { id: 'ru', flag: '🇷🇺' },
  { id: 'uk', flag: '🇺🇦' },
  { id: 'es', flag: '🇪🇸' },
  { id: 'de', flag: '🇩🇪' },
  { id: 'fr', flag: '🇫🇷' },
];

const languageLabelsMap: Record<string, { en: string; ru: string }> = {
  en: { en: 'English', ru: 'Английский' },
  ru: { en: 'Russian', ru: 'Русский' },
  uk: { en: 'Ukrainian', ru: 'Украинский' },
  es: { en: 'Spanish', ru: 'Испанский' },
  de: { en: 'German', ru: 'Немецкий' },
  fr: { en: 'French', ru: 'Французский' },
};

export function AddCampaignModal({ isOpen, onClose }: AddCampaignModalProps) {
  const { t, language } = useTranslation();

  const categories = [
    { id: 'technology', label: t.categories.technology, emoji: '💻' },
    { id: 'business', label: t.categories.business, emoji: '💼' },
    { id: 'entertainment', label: t.categories.entertainment, emoji: '🎬' },
    { id: 'news', label: t.categories.news, emoji: '📰' },
    { id: 'crypto', label: t.categories.crypto, emoji: '₿' },
    { id: 'lifestyle', label: t.categories.lifestyle, emoji: '🌟' },
  ];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalBudget, setTotalBudget] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { hapticNotification, hapticSelection } = useTelegram();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/campaigns', {
        title,
        description: description || undefined,
        totalBudget,
        categories: selectedCategories,
        targetLanguages: selectedLanguages,
      });
      return response.data;
    },
    onSuccess: () => {
      hapticNotification?.('success');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      onClose();
      resetForm();
    },
    onError: (err: Error) => {
      hapticNotification?.('error');
      setError(err.message);
    },
  });

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTotalBudget('');
    setSelectedCategories([]);
    setSelectedLanguages([]);
    setError(null);
  };

  const handleCategoryToggle = (catId: string) => {
    hapticSelection?.();
    setSelectedCategories((prev) =>
      prev.includes(catId)
        ? prev.filter((c) => c !== catId)
        : prev.length < 10
        ? [...prev, catId]
        : prev
    );
  };

  const handleLanguageToggle = (langId: string) => {
    hapticSelection?.();
    setSelectedLanguages((prev) =>
      prev.includes(langId)
        ? prev.filter((l) => l !== langId)
        : prev.length < 10
        ? [...prev, langId]
        : prev
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || title.length < 3) {
      setError(t.modals.createCampaign.errorTitle);
      return;
    }

    if (!totalBudget || parseFloat(totalBudget) <= 0) {
      setError(t.modals.createCampaign.errorBudget);
      return;
    }

    if (selectedCategories.length === 0) {
      setError(t.modals.createCampaign.errorCategory);
      return;
    }

    if (selectedLanguages.length === 0) {
      setError(t.modals.createCampaign.errorLanguage);
      return;
    }

    createMutation.mutate();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.modals.createCampaign.title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.createCampaign.campaignTitle}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.modals.createCampaign.campaignTitlePlaceholder}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.createCampaign.description}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t.modals.createCampaign.descriptionPlaceholder}
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors resize-none"
          />
        </div>

        {/* Budget */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.createCampaign.totalBudget}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={totalBudget}
            onChange={(e) => setTotalBudget(e.target.value)}
            placeholder="100.00"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-accent focus:outline-none transition-colors"
          />
          <p className="text-xs text-tg-hint mt-1">
            {t.modals.createCampaign.budgetHint}
          </p>
        </div>

        {/* Categories */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.createCampaign.targetCategories}
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

        {/* Languages */}
        <div>
          <label className="block text-sm font-medium text-tg-hint mb-2">
            {t.modals.createCampaign.targetLanguages}
          </label>
          <div className="flex flex-wrap gap-2">
            {languageOptions.map((lang) => {
              const isSelected = selectedLanguages.includes(lang.id);
              const label = languageLabelsMap[lang.id]?.[language] || lang.id;
              return (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => handleLanguageToggle(lang.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isSelected
                      ? 'bg-accent/20 border-accent text-accent border'
                      : 'bg-white/5 border border-white/10 text-tg-hint'
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

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
          {t.modals.createCampaign.submit}
        </Button>
      </form>
    </Modal>
  );
}
