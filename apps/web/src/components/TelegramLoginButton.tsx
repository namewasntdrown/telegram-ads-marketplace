import { useEffect, useRef } from 'react';

export interface TelegramLoginWidgetData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramLoginButtonProps {
  botName: string;
  onAuth: (data: TelegramLoginWidgetData) => void;
  buttonSize?: 'large' | 'medium' | 'small';
}

declare global {
  interface Window {
    __onTelegramLoginWidgetAuth?: (data: TelegramLoginWidgetData) => void;
  }
}

export function TelegramLoginButton({ botName, onAuth, buttonSize = 'large' }: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Global callback always delegates to the latest onAuth via ref
    window.__onTelegramLoginWidgetAuth = (data) => onAuthRef.current(data);

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', buttonSize);
    script.setAttribute('data-onauth', '__onTelegramLoginWidgetAuth(user)');
    script.setAttribute('data-request-access', 'write');

    container.appendChild(script);

    return () => {
      delete window.__onTelegramLoginWidgetAuth;
      container.innerHTML = '';
    };
  }, [botName, buttonSize]);

  return <div ref={containerRef} />;
}
