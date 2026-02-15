import { ReactNode, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Radio, Megaphone, Handshake, FolderOpen, Shield, FileText } from 'lucide-react';
import { useTelegram } from '../hooks/useTelegram';
import { useAuthStore } from '../store/auth.store';
import { useTranslation } from '../i18n';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { hapticFeedback } = useTelegram();
  const { user } = useAuthStore();
  const { t } = useTranslation();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MODERATOR';

  const navItems = useMemo(() => {
    const baseNavItems = [
      { path: '/', label: t.nav.profile, icon: User },
      { path: '/channels', label: t.nav.channels, icon: Radio },
      { path: '/folders', label: t.nav.folders, icon: FolderOpen },
      { path: '/briefs', label: t.nav.briefs, icon: FileText },
      { path: '/campaigns', label: t.nav.campaigns, icon: Megaphone },
      { path: '/deals', label: t.nav.deals, icon: Handshake },
    ];

    const moderationItem = { path: '/moderation', label: 'Moderate', icon: Shield };

    if (isAdmin) {
      return [...baseNavItems, moderationItem];
    }
    return baseNavItems;
  }, [isAdmin, t]);

  const handleNavClick = () => {
    hapticFeedback?.('light');
  };

  return (
    <div className="min-h-screen flex flex-col bg-tg-bg-secondary">
      <main className="flex-1 pb-20">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 tg-nav px-2 py-2 safe-area-bottom">
        <div className="flex justify-around items-center max-w-lg mx-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className="relative flex flex-col items-center py-1 px-3"
              >
                <motion.div
                  whileTap={{ scale: 0.95 }}
                  className={`p-2 rounded-tg transition-colors duration-150 ${
                    isActive
                      ? 'bg-tg-link/10'
                      : 'bg-transparent'
                  }`}
                >
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2 : 1.5}
                    className={isActive ? 'text-tg-link' : 'text-tg-text-secondary'}
                  />
                </motion.div>
                <span
                  className={`text-[10px] mt-1 font-medium transition-colors duration-150 ${
                    isActive ? 'text-tg-link' : 'text-tg-text-secondary'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
