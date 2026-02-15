import { useCallback } from 'react';
import { TelegramLoginButton, type TelegramLoginWidgetData } from '../components/TelegramLoginButton';
import { useAuthStore } from '../store/auth.store';

const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string;

export function LoginPage() {
  const { authenticateWithLoginWidget, isLoading, error } = useAuthStore();

  const handleAuth = useCallback(
    (data: TelegramLoginWidgetData) => {
      authenticateWithLoginWidget(data);
    },
    [authenticateWithLoginWidget]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <h1 className="text-2xl font-bold">Telegram Ads Marketplace</h1>
        <p className="text-gray-500">
          Sign in with your Telegram account to access the platform.
        </p>

        <div className="flex justify-center">
          {isLoading ? (
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-button" />
          ) : (
            <TelegramLoginButton
              botName={BOT_USERNAME}
              onAuth={handleAuth}
              buttonSize="large"
            />
          )}
        </div>

        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}
      </div>
    </div>
  );
}
