import { useEffect, useState, useCallback } from 'react';

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  close: () => void;
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      photo_url?: string;
      is_premium?: boolean;
    };
    auth_date: number;
    hash: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  BackButton: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  showPopup: (params: {
    title?: string;
    message: string;
    buttons?: Array<{ id: string; type?: string; text: string }>;
  }) => void;
  showAlert: (message: string) => void;
  showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  requestFullscreen?: () => void;
  isFullscreen?: boolean;
  disableVerticalSwipes?: () => void;
}

type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type NotificationType = 'error' | 'success' | 'warning';

export function useTelegram() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      setWebApp(tg);
      tg.ready();
      tg.expand();
      // Disable vertical swipes to prevent app collapse (Bot API 7.7+)
      try {
        if (typeof tg.disableVerticalSwipes === 'function') {
          tg.disableVerticalSwipes();
        }
      } catch (e) {
        // disableVerticalSwipes not available in older clients
      }
      // Request fullscreen for newer Telegram clients
      try {
        if (typeof tg.requestFullscreen === 'function') {
          tg.requestFullscreen();
          // Check if fullscreen was activated
          setIsFullscreen(tg.isFullscreen === true);
        }
      } catch (e) {
        // requestFullscreen not available in older clients
      }
      setIsReady(true);
    } else {
      // Running outside Telegram - use mock for development
      setIsReady(true);
    }
  }, []);

  // Haptic feedback - impact (button taps)
  const hapticFeedback = useCallback(
    (style: HapticStyle = 'light') => {
      try {
        webApp?.HapticFeedback?.impactOccurred(style);
      } catch (e) {
        // Haptic not available
      }
    },
    [webApp]
  );

  // Haptic feedback - notification (success/error/warning)
  const hapticNotification = useCallback(
    (type: NotificationType) => {
      try {
        webApp?.HapticFeedback?.notificationOccurred(type);
      } catch (e) {
        // Haptic not available
      }
    },
    [webApp]
  );

  // Haptic feedback - selection changed
  const hapticSelection = useCallback(() => {
    try {
      webApp?.HapticFeedback?.selectionChanged();
    } catch (e) {
      // Haptic not available
    }
  }, [webApp]);

  // Show popup
  const showPopup = useCallback(
    (params: { title?: string; message: string; buttons?: Array<{ id: string; type?: string; text: string }> }) => {
      webApp?.showPopup(params);
    },
    [webApp]
  );

  // Show alert
  const showAlert = useCallback(
    (message: string) => {
      webApp?.showAlert(message);
    },
    [webApp]
  );

  // Show confirm
  const showConfirm = useCallback(
    (message: string): Promise<boolean> => {
      return new Promise((resolve) => {
        if (webApp) {
          webApp.showConfirm(message, resolve);
        } else {
          resolve(window.confirm(message));
        }
      });
    },
    [webApp]
  );

  return {
    webApp,
    isReady,
    isFullscreen,
    initData: webApp?.initData ?? '',
    user: webApp?.initDataUnsafe?.user,
    colorScheme: webApp?.colorScheme ?? 'light',
    // Haptic feedback
    hapticFeedback,
    hapticNotification,
    hapticSelection,
    // Popups
    showPopup,
    showAlert,
    showConfirm,
    // Buttons
    mainButton: webApp?.MainButton,
    backButton: webApp?.BackButton,
  };
}
