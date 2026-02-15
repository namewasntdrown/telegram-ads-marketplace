import { useEffect, useCallback, useRef, ReactNode } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';

const PAYLOAD_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

function generatePayload(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join('');
  return `tam-${timestamp}-${random}`;
}

interface TonProofProviderProps {
  children: ReactNode;
}

export function TonProofProvider({ children }: TonProofProviderProps) {
  const [tonConnectUI] = useTonConnectUI();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshPayload = useCallback(() => {
    const payload = generatePayload();
    tonConnectUI.setConnectRequestParameters({
      state: 'ready',
      value: { tonProof: payload },
    });
  }, [tonConnectUI]);

  useEffect(() => {
    // Set initial payload
    refreshPayload();

    // Refresh payload every 5 minutes to prevent replay attacks
    intervalRef.current = setInterval(refreshPayload, PAYLOAD_REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshPayload]);

  return <>{children}</>;
}
