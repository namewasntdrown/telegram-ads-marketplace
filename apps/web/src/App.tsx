import { useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useTelegram } from './hooks/useTelegram';
import { useAuthStore } from './store/auth.store';
import { Layout } from './components/Layout';
import { ChannelsPage } from './pages/ChannelsPage';
import { ChannelDetailsPage } from './pages/ChannelDetailsPage';
import { ChannelSettingsPage } from './pages/ChannelSettingsPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { CampaignDetailsPage } from './pages/CampaignDetailsPage';
import { DealsPage } from './pages/DealsPage';
import { DealDetailsPage } from './pages/DealDetailsPage';
import { ProfilePage } from './pages/ProfilePage';
import { FoldersPage } from './pages/FoldersPage';
import { FolderDetailsPage } from './pages/FolderDetailsPage';
import { ModerationPage } from './pages/ModerationPage';
import { LoginPage } from './pages/LoginPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { BriefsPage } from './pages/BriefsPage';

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[100dvh] p-6 text-center bg-tg-bg-secondary">
          <p className="text-lg font-medium text-tg-text mb-2">Something went wrong</p>
          <p className="text-sm text-tg-text-secondary mb-4">An unexpected error occurred.</p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
            className="tg-btn-primary px-6 py-2"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const BUILD_VERSION = 'v11-responsive-fullscreen';
console.log('App build:', BUILD_VERSION);

export function App() {
  const { webApp, initData, isReady } = useTelegram();
  const { authenticate, isLoading, isAuthenticated, user, logout } = useAuthStore();
  const authAttempted = useRef(false);

  useEffect(() => {
    // Migration: if we have tokens but no user, clear and re-auth
    if (isAuthenticated && !user) {
      logout();
      authAttempted.current = false;
    }
  }, [isAuthenticated, user, logout]);

  useEffect(() => {
    // Always re-authenticate when initData is available to keep user fresh
    if (isReady && initData && !isLoading && !authAttempted.current) {
      authAttempted.current = true;
      authenticate(initData);
    }
  }, [isReady, initData, isLoading, authenticate]);

  useEffect(() => {
    if (webApp) {
      webApp.ready();
      webApp.expand();
      try {
        if (typeof (webApp as any).requestFullscreen === 'function') {
          (webApp as any).requestFullscreen();
        }
      } catch (e) {
        // requestFullscreen not available
      }
    }
  }, [webApp]);

  const isTelegramMiniApp = Boolean(webApp && initData);

  // Show loading while Telegram SDK initializes or waiting for user auth in Mini App
  if (!isReady || isLoading || (isTelegramMiniApp && !user)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tg-button"></div>
      </div>
    );
  }

  // Outside Telegram and not authenticated — show login page
  if (!isTelegramMiniApp && !isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<ProfilePage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/channels/:id/settings" element={<ChannelSettingsPage />} />
            <Route path="/channels/:id" element={<ChannelDetailsPage />} />
            <Route path="/folders" element={<FoldersPage />} />
            <Route path="/folders/:id" element={<FolderDetailsPage />} />
            <Route path="/briefs" element={<BriefsPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/campaigns/:id" element={<CampaignDetailsPage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/deals/:id" element={<DealDetailsPage />} />
            <Route path="/profile/notifications" element={<NotificationsPage />} />
            <Route path="/moderation" element={<ModerationPage />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </BrowserRouter>
  );
}
