import { AlertCircle, RefreshCw } from 'lucide-react';
import { Card, Button } from './index';
import { useTranslation } from '../../i18n';

interface ErrorCardProps {
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function ErrorCard({ onRetry, isRetrying }: ErrorCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="text-center py-8">
      <AlertCircle size={36} className="mx-auto text-tg-error mb-2" />
      <p className="text-tg-error font-medium">{t.errors.failedToLoad}</p>
      <p className="text-sm text-tg-text-secondary mt-1">{t.errors.tryAgain}</p>
      {onRetry && (
        <Button
          variant="primary"
          size="sm"
          className="mt-4"
          onClick={onRetry}
          disabled={isRetrying}
        >
          <RefreshCw size={16} className={isRetrying ? 'animate-spin' : ''} />
          {isRetrying ? t.common.loading : t.common.retry}
        </Button>
      )}
    </Card>
  );
}
