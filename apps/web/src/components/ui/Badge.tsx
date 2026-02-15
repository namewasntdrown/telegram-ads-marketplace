import { ReactNode } from 'react';
import { useTranslation } from '../../i18n';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}: BadgeProps) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  };

  const variantClasses = {
    default: 'tg-badge',
    primary: 'tg-badge-primary',
    success: 'tg-badge-success',
    warning: 'tg-badge-warning',
    error: 'tg-badge-error',
  };

  return (
    <span
      className={`${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();

  const statusConfig: Record<string, { variant: BadgeProps['variant']; labelKey: keyof typeof t.statuses }> = {
    DRAFT: { variant: 'default', labelKey: 'pending' },
    PENDING: { variant: 'warning', labelKey: 'pending' },
    ACTIVE: { variant: 'success', labelKey: 'approved' },
    PAUSED: { variant: 'warning', labelKey: 'pending' },
    COMPLETED: { variant: 'primary', labelKey: 'verified' },
    CANCELLED: { variant: 'error', labelKey: 'cancelled' },
    AWAITING_DEPOSIT: { variant: 'warning', labelKey: 'pending' },
    FUNDED: { variant: 'success', labelKey: 'approved' },
    SCHEDULED: { variant: 'primary', labelKey: 'approved' },
    CONTENT_PENDING: { variant: 'primary', labelKey: 'pending' },
    CONTENT_SUBMITTED: { variant: 'primary', labelKey: 'pending' },
    CONTENT_APPROVED: { variant: 'success', labelKey: 'approved' },
    POSTED: { variant: 'success', labelKey: 'posted' },
    AWAITING_VERIFICATION: { variant: 'warning', labelKey: 'pending' },
    VERIFIED: { variant: 'success', labelKey: 'verified' },
    RELEASED: { variant: 'success', labelKey: 'released' },
    DISPUTED: { variant: 'error', labelKey: 'disputed' },
    REFUNDED: { variant: 'default', labelKey: 'refunded' },
    EXPIRED: { variant: 'default', labelKey: 'expired' },
    REJECTED: { variant: 'error', labelKey: 'rejected' },
  };

  const config = statusConfig[status];
  const label = config ? t.statuses[config.labelKey] : status;
  const variant = config?.variant || 'default';

  return <Badge variant={variant}>{label}</Badge>;
}
