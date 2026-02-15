import { useEffect, useRef, useCallback } from 'react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { api } from '../api/client';
import { useWalletStore } from '../store/wallet.store';
import { useAuthStore } from '../store/auth.store';

interface ConnectWalletResponse {
  walletAddress: string;
  connected: boolean;
}

/**
 * Hook that monitors TonConnect wallet state and handles proof-based connection.
 *
 * When a wallet connects with tonProof:
 * 1. Sends the proof to backend for verification
 * 2. Backend verifies signature and saves wallet address
 * 3. Updates local wallet store
 *
 * Handles errors:
 * - WALLET_ALREADY_CONNECTED: auto-disconnects + shows message
 * - PROOF_REQUIRED: triggers reconnection
 */
export function useWalletConnect() {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const { setConnected, setDisconnected } = useWalletStore();
  const { updateUser } = useAuthStore();
  const processingRef = useRef(false);
  const lastAddressRef = useRef<string | null>(null);

  const handleDisconnect = useCallback(async () => {
    try {
      await api.delete('/user/wallet');
    } catch {
      // Ignore errors on disconnect API call
    }
    setDisconnected();
    updateUser({ walletAddress: undefined });
    lastAddressRef.current = null;
  }, [setDisconnected, updateUser]);

  const handleConnect = useCallback(async () => {
    if (!wallet || processingRef.current) return;

    const address = wallet.account?.address;
    if (!address) return;

    // Skip if already processed this address
    if (lastAddressRef.current === address) return;

    // Check for tonProof
    const tonProof = wallet.connectItems?.tonProof;
    if (!tonProof || tonProof.name !== 'ton_proof') {
      console.warn('Wallet connected without tonProof, reconnecting...');
      try {
        await tonConnectUI.disconnect();
      } catch {
        // Ignore
      }
      return;
    }

    if ('error' in tonProof) {
      console.error('TON Proof error:', tonProof.error);
      try {
        await tonConnectUI.disconnect();
      } catch {
        // Ignore
      }
      return;
    }

    processingRef.current = true;

    try {
      const proofData = tonProof.proof;
      const response = await api.put<ConnectWalletResponse>('/user/wallet', {
        proof: {
          address,
          proof: {
            timestamp: proofData.timestamp,
            domain: proofData.domain,
            signature: proofData.signature,
            payload: proofData.payload,
            stateInit: wallet.account.walletStateInit,
          },
        },
      });

      const walletAddress = response.data.walletAddress;
      setConnected(walletAddress);
      updateUser({ walletAddress });
      lastAddressRef.current = address;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (message.includes('WALLET_ALREADY_CONNECTED')) {
        // Wallet is bound to another user
        try {
          await tonConnectUI.disconnect();
        } catch {
          // Ignore
        }
        setDisconnected();
        alert('This wallet is already connected to another account.');
      } else {
        console.error('Wallet connection failed:', message);
        try {
          await tonConnectUI.disconnect();
        } catch {
          // Ignore
        }
        setDisconnected();
      }
    } finally {
      processingRef.current = false;
    }
  }, [wallet, tonConnectUI, setConnected, setDisconnected, updateUser]);

  // Watch wallet state changes
  useEffect(() => {
    if (wallet) {
      handleConnect();
    } else {
      // Wallet disconnected via TonConnect UI
      if (lastAddressRef.current) {
        handleDisconnect();
      }
    }
  }, [wallet, handleConnect, handleDisconnect]);

  return {
    disconnect: async () => {
      await handleDisconnect();
      try {
        await tonConnectUI.disconnect();
      } catch {
        // Ignore
      }
    },
  };
}
