import { en, TranslationKeys } from './en';
import { ru } from './ru';
import { useLangStore, Language } from '../store/lang.store';

const translations: Record<Language, TranslationKeys> = {
  en,
  ru,
};

// Category translation mapping
const categoryMap: Record<string, keyof TranslationKeys['categories']> = {
  'technology': 'technology',
  'business': 'business',
  'entertainment': 'entertainment',
  'news': 'news',
  'crypto': 'crypto',
  'lifestyle': 'lifestyle',
  // Handle capitalized versions from API
  'Technology': 'technology',
  'Business': 'business',
  'Entertainment': 'entertainment',
  'News': 'news',
  'Crypto': 'crypto',
  'Lifestyle': 'lifestyle',
};

export function useTranslation() {
  const { language, setLanguage } = useLangStore();
  const t = translations[language];

  // Helper function to translate category names
  const translateCategory = (category: string): string => {
    const key = categoryMap[category];
    if (key && t.categories[key]) {
      return t.categories[key];
    }
    // Fallback: return lowercase category if no translation found
    return category.toLowerCase();
  };

  return { t, language, setLanguage, translateCategory };
}

export type { Language };
export { translations };
