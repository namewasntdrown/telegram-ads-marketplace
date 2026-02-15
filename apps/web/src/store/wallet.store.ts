import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type DepositStatus = 'idle' | 'awaiting_tx' | 'confirming' | 'completed' | 'failed';
type WithdrawStatus = 'idle' | 'pending' | 'processing' | 'sent' | 'completed' | 'failed';

interface WalletState {
  // Wallet connection
  isConnected: boolean;
  walletAddress: string | null;

  // App balance (in TON string)
  balance: string;
  frozenBalance: string;

  // Deposit
  depositStatus: DepositStatus;
  activeDepositId: string | null;

  // Withdrawal
  withdrawStatus: WithdrawStatus;
  activeWithdrawalId: string | null;

  // Actions
  setConnected: (address: string) => void;
  setDisconnected: () => void;
  setBalance: (available: string, frozen: string) => void;
  setDepositStatus: (status: DepositStatus, depositId?: string | null) => void;
  setWithdrawStatus: (status: WithdrawStatus, withdrawalId?: string | null) => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  walletAddress: null,
  balance: '0',
  frozenBalance: '0',
  depositStatus: 'idle' as DepositStatus,
  activeDepositId: null,
  withdrawStatus: 'idle' as WithdrawStatus,
  activeWithdrawalId: null,
};

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      ...initialState,

      setConnected: (address: string) =>
        set({ isConnected: true, walletAddress: address }),

      setDisconnected: () =>
        set({ isConnected: false, walletAddress: null }),

      setBalance: (available: string, frozen: string) =>
        set({ balance: available, frozenBalance: frozen }),

      setDepositStatus: (status: DepositStatus, depositId?: string | null) =>
        set({
          depositStatus: status,
          activeDepositId: depositId ?? null,
        }),

      setWithdrawStatus: (status: WithdrawStatus, withdrawalId?: string | null) =>
        set({
          withdrawStatus: status,
          activeWithdrawalId: withdrawalId ?? null,
        }),

      reset: () => set(initialState),
    }),
    {
      name: 'wallet-storage',
      partialize: (state) => ({
        isConnected: state.isConnected,
        walletAddress: state.walletAddress,
      }),
    },
  ),
);
