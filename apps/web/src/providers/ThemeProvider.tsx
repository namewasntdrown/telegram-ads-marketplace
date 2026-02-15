import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    // Get theme from Telegram WebApp
    const tg = window.Telegram?.WebApp;

    if (tg) {
      // Use Telegram's color scheme
      const colorScheme = tg.colorScheme || 'light';
      setTheme(colorScheme);

      // Apply theme params from Telegram if available
      if (tg.themeParams) {
        const root = document.documentElement;
        const params = tg.themeParams;

        if (params.bg_color) {
          root.style.setProperty('--tg-bg-color', params.bg_color);
        }
        if (params.secondary_bg_color) {
          root.style.setProperty('--tg-bg-secondary', params.secondary_bg_color);
        }
        if (params.text_color) {
          root.style.setProperty('--tg-text-color', params.text_color);
        }
        if (params.hint_color) {
          root.style.setProperty('--tg-text-secondary', params.hint_color);
        }
        if (params.link_color) {
          root.style.setProperty('--tg-link-color', params.link_color);
        }
        if (params.button_color) {
          root.style.setProperty('--tg-button-color', params.button_color);
        }
        if (params.button_text_color) {
          root.style.setProperty('--tg-button-text-color', params.button_text_color);
        }
      }
    } else {
      // Fallback: check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');

      // Listen for system theme changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        setTheme(e.matches ? 'dark' : 'light');
      };
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
