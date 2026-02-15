import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'en' | 'ru';

interface LangState {
  language: Language;
  setLanguage: (lang: Language) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      language: 'ru',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'lang-storage',
    }
  )
);
