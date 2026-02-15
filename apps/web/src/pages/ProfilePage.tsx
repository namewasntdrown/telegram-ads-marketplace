import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  User, Wallet, Radio, Megaphone, Bell, Shield, ChevronRight,
  TrendingUp, TrendingDown, Lock, ArrowDownToLine, ArrowUpFromLine,
  Clock, Globe
} from 'lucide-react';
import { useAuthStore } from '../store/auth.store';
import { api } from '../api/client';
import { AnimatedCounter, BalanceDisplay, PageTransition } from '../components/ui';
import { WalletButton } from '../components/WalletButton';
import { DepositModal } from '../components/Modals/DepositModal';
import { WithdrawModal } from '../components/Modals/WithdrawModal';
import { useWalletConnect } from '../hooks/useWalletConnect';
import { useTelegram } from '../hooks/useTelegram';
import { useTranslation } from '../i18n';

interface UserStats {
  totalDeals: number;
  activeDeals: number;
  completedDeals: number;
  totalChannels: number;
  totalCampaigns: number;
  totalSpent: string;
  totalEarned: string;
}

interface Balance {
  available: string;
  frozen: string;
  total: string;
}

interface Transaction {
  id: string;
  amount: string;
  type: string;
  status: string;
  createdAt: string;
}

const txTypeConfig: Record<string, { icon: typeof ArrowDownToLine; color: string; bgColor: string; sign: '+' | '-' }> = {
  DEPOSIT: { icon: ArrowDownToLine, color: 'text-tg-success', bgColor: 'bg-tg-success/10', sign: '+' },
  WITHDRAWAL: { icon: ArrowUpFromLine, color: 'text-tg-error', bgColor: 'bg-tg-error/10', sign: '-' },
  ESCROW_LOCK: { icon: Lock, color: 'text-tg-warning', bgColor: 'bg-tg-warning/10', sign: '-' },
  ESCROW_RELEASE: { icon: Wallet, color: 'text-tg-success', bgColor: 'bg-tg-success/10', sign: '+' },
  ESCROW_REFUND: { icon: ArrowDownToLine, color: 'text-tg-link', bgColor: 'bg-tg-link/10', sign: '+' },
  FEE: { icon: ArrowUpFromLine, color: 'text-tg-text-secondary', bgColor: 'bg-tg-bg-secondary', sign: '-' },
};

export function ProfilePage() {
  const { user } = useAuthStore();
  const { hapticFeedback } = useTelegram();
  const { t, language, setLanguage } = useTranslation();

  // Initialize wallet connect hook (handles proof verification)
  useWalletConnect();

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['userStats'],
    queryFn: async () => {
      const response = await api.get<UserStats>('/users/me/stats');
      return response.data;
    },
  });

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['balance'],
    queryFn: async () => {
      const response = await api.get<Balance>('/escrow/balance');
      return response.data;
    },
  });

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const response = await api.get<{ items: Transaction[] }>('/escrow/transactions');
      return response.data;
    },
  });

  const settingsItems = [
    { icon: Radio, label: t.profile.myChannels, path: '/channels?view=my', color: 'text-tg-link', bgColor: 'bg-tg-link/10' },
    { icon: Bell, label: t.profile.notifications, path: '/profile/notifications', color: 'text-tg-warning', bgColor: 'bg-tg-warning/10' },
    { icon: Shield, label: t.profile.security, path: '/profile/security', color: 'text-tg-success', bgColor: 'bg-tg-success/10' },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } }
  };

  return (
    <PageTransition>
      <div className="p-4 pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-5"
        >
          <div>
            <h1 className="text-2xl font-bold text-tg-text">{t.profile.title}</h1>
            <p className="text-sm text-tg-text-secondary mt-0.5">{t.profile.subtitle}</p>
          </div>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {/* User Card with Avatar */}
          <motion.div variants={itemVariants}>
            <div className="tg-card-elevated">
              <div className="flex items-center gap-4">
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="w-16 h-16 rounded-full overflow-hidden tg-avatar-ring flex-shrink-0"
                >
                  {user?.photoUrl ? (
                    <img
                      src={user.photoUrl}
                      alt={user.firstName || 'User'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-tg-link flex items-center justify-center text-2xl text-white font-bold">
                      {user?.firstName?.[0] ?? user?.username?.[0] ?? '?'}
                    </div>
                  )}
                </motion.div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-lg text-tg-text truncate">
                    {user?.firstName} {user?.lastName}
                  </h2>
                  {user?.username && (
                    <p className="text-tg-link font-medium">@{user.username}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-tg-text-secondary font-mono">ID: {user?.telegramId}</span>
                    <span className="w-2 h-2 rounded-full bg-tg-success" />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Balance Card */}
          <motion.div variants={itemVariants}>
            <div className="tg-card-elevated">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-tg bg-tg-link/10 flex items-center justify-center">
                    <Wallet size={18} className="text-tg-link" />
                  </div>
                  <span className="font-medium text-tg-text-secondary">{t.profile.balance}</span>
                </div>
              </div>
              {balanceLoading ? (
                <div className="h-10 w-32 skeleton rounded-tg" />
              ) : (
                <div className="mb-2">
                  <BalanceDisplay amount={balance?.available ?? user?.balanceTon ?? '0'} size="xl" />
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-tg-text-secondary">
                <Lock size={14} />
                <span>{balance?.frozen ?? user?.frozenTon ?? '0'} TON {t.profile.inEscrow}</span>
              </div>
            </div>
          </motion.div>

          {/* Wallet Connection with TonConnect Proof */}
          <motion.div variants={itemVariants}>
            <WalletButton
              onDeposit={() => setShowDepositModal(true)}
              onWithdraw={() => setShowWithdrawModal(true)}
            />
          </motion.div>

          {/* Quick Actions */}
          <motion.div variants={itemVariants}>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/channels" onClick={() => hapticFeedback?.('light')}>
                <motion.div
                  whileTap={{ scale: 0.98 }}
                  className="tg-card text-center py-5 cursor-pointer"
                >
                  <div className="w-12 h-12 mx-auto rounded-tg-md bg-tg-link/10 flex items-center justify-center mb-2">
                    <Radio size={24} className="text-tg-link" />
                  </div>
                  <p className="font-semibold text-tg-text">{t.nav.channels}</p>
                  <p className="text-xs text-tg-text-secondary mt-0.5">{t.profile.browsePublish}</p>
                </motion.div>
              </Link>
              <Link to="/campaigns" onClick={() => hapticFeedback?.('light')}>
                <motion.div
                  whileTap={{ scale: 0.98 }}
                  className="tg-card text-center py-5 cursor-pointer"
                >
                  <div className="w-12 h-12 mx-auto rounded-tg-md bg-purple-500/10 flex items-center justify-center mb-2">
                    <Megaphone size={24} className="text-purple-500" />
                  </div>
                  <p className="font-semibold text-tg-text">{t.nav.campaigns}</p>
                  <p className="text-xs text-tg-text-secondary mt-0.5">{t.profile.manageAds}</p>
                </motion.div>
              </Link>
            </div>
          </motion.div>

          {/* Stats Grid */}
          <motion.div variants={itemVariants}>
            <div className="tg-card">
              <div className="flex items-center gap-2 mb-3">
                <User size={16} className="text-tg-link" />
                <h2 className="font-semibold text-tg-text">{t.profile.statistics}</h2>
              </div>
              {statsLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="tg-stat">
                      <div className="h-6 w-10 mx-auto skeleton rounded mb-1" />
                      <div className="h-3 w-14 mx-auto skeleton rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="tg-stat">
                    <p className="text-xl font-bold text-tg-text"><AnimatedCounter value={stats?.totalDeals ?? 0} decimals={0} /></p>
                    <p className="text-xs text-tg-text-secondary">{t.profile.deals}</p>
                  </div>
                  <div className="tg-stat">
                    <p className="text-xl font-bold text-tg-link"><AnimatedCounter value={stats?.activeDeals ?? 0} decimals={0} /></p>
                    <p className="text-xs text-tg-text-secondary">{t.common.active}</p>
                  </div>
                  <div className="tg-stat">
                    <p className="text-xl font-bold text-tg-text"><AnimatedCounter value={stats?.totalChannels ?? 0} decimals={0} /></p>
                    <p className="text-xs text-tg-text-secondary">{t.profile.channels}</p>
                  </div>
                  <div className="tg-stat">
                    <p className="text-xl font-bold text-tg-text"><AnimatedCounter value={stats?.totalCampaigns ?? 0} decimals={0} /></p>
                    <p className="text-xs text-tg-text-secondary">{t.profile.campaigns}</p>
                  </div>
                  <div className="tg-stat">
                    <div className="flex items-center justify-center gap-1">
                      <TrendingDown size={12} className="text-tg-error" />
                      <p className="text-base font-bold text-tg-error">{stats?.totalSpent ?? '0'}</p>
                    </div>
                    <p className="text-xs text-tg-text-secondary">{t.profile.spent}</p>
                  </div>
                  <div className="tg-stat">
                    <div className="flex items-center justify-center gap-1">
                      <TrendingUp size={12} className="text-tg-success" />
                      <p className="text-base font-bold text-tg-success">{stats?.totalEarned ?? '0'}</p>
                    </div>
                    <p className="text-xs text-tg-text-secondary">{t.profile.earned}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Transactions */}
          <motion.div variants={itemVariants}>
            <div className="tg-card">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-tg-text-secondary" />
                <h2 className="font-semibold text-tg-text">{t.profile.recentTransactions}</h2>
              </div>
              {txLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-9 h-9 skeleton rounded-tg" />
                      <div className="flex-1">
                        <div className="h-4 w-20 skeleton rounded mb-1" />
                        <div className="h-3 w-14 skeleton rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : transactions?.items.length === 0 ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 mx-auto rounded-tg bg-tg-bg-secondary flex items-center justify-center mb-2">
                    <Clock size={24} className="text-tg-text-secondary" />
                  </div>
                  <p className="text-sm text-tg-text-secondary">{t.profile.noTransactions}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {transactions?.items.slice(0, 5).map((tx, index) => {
                    const config = txTypeConfig[tx.type] || txTypeConfig.FEE;
                    const Icon = config.icon;
                    return (
                      <motion.div
                        key={tx.id}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.04 }}
                        className="flex items-center justify-between p-2.5 rounded-tg bg-tg-bg-secondary"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-tg ${config.bgColor} flex items-center justify-center`}>
                            <Icon size={16} className={config.color} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-tg-text">{tx.type.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-tg-text-secondary">{new Date(tx.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-semibold ${config.color}`}>{config.sign}{tx.amount} TON</p>
                          <p className="text-xs text-tg-text-secondary">{tx.status}</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>

          {/* Settings */}
          <motion.div variants={itemVariants}>
            <div className="tg-card">
              <h2 className="font-semibold text-tg-text mb-3">{t.profile.settings}</h2>
              <div className="space-y-1">
                {settingsItems.map((item, index) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => hapticFeedback?.('light')}
                  >
                    <motion.div
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className="flex items-center justify-between p-2.5 rounded-tg hover:bg-tg-bg-secondary transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-tg ${item.bgColor} flex items-center justify-center`}>
                          <item.icon size={18} className={item.color} />
                        </div>
                        <span className="text-tg-text">{item.label}</span>
                      </div>
                      <ChevronRight size={18} className="text-tg-text-secondary" />
                    </motion.div>
                  </Link>
                ))}
                {/* Language Switcher */}
                <motion.div
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 }}
                  className="flex items-center justify-between p-2.5 rounded-tg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-tg bg-purple-500/10 flex items-center justify-center">
                      <Globe size={18} className="text-purple-500" />
                    </div>
                    <span className="text-tg-text">{t.profile.language}</span>
                  </div>
                  <div className="flex gap-1 bg-tg-bg-secondary rounded-tg p-1">
                    <button
                      onClick={() => {
                        hapticFeedback?.('light');
                        setLanguage('en');
                      }}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                        language === 'en'
                          ? 'bg-tg-link text-white'
                          : 'text-tg-text-secondary hover:text-tg-text'
                      }`}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => {
                        hapticFeedback?.('light');
                        setLanguage('ru');
                      }}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                        language === 'ru'
                          ? 'bg-tg-link text-white'
                          : 'text-tg-text-secondary hover:text-tg-text'
                      }`}
                    >
                      RU
                    </button>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>

          {/* App Info */}
          <motion.div variants={itemVariants}>
            <div className="tg-card">
              <div className="flex items-center justify-between text-sm">
                <span className="text-tg-text-secondary">{t.profile.version}</span>
                <span className="text-tg-text font-mono">1.0.0</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-tg-text-secondary">{t.profile.role}</span>
                <span className="text-tg-link font-medium">{user?.role}</span>
              </div>
            </div>
          </motion.div>

        </motion.div>
      </div>

      {/* Deposit Modal */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
      />

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        balance={balance?.available ?? user?.balanceTon ?? '0'}
      />
    </PageTransition>
  );
}
